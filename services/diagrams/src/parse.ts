import type { Action, AttrChange, DiagramEdge, DiagramModel, DiagramNode } from "./model.ts";

/* Minimal views of `terraform show -json` output. Only fields we read. */
interface TfChange {
  actions: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  after_unknown?: Record<string, unknown> | boolean;
  before_sensitive?: Record<string, unknown> | boolean;
  after_sensitive?: Record<string, unknown> | boolean;
}
interface TfResourceChange {
  address: string;
  mode: string;
  type: string;
  name: string;
  change: TfChange;
}
interface TfStateResource {
  address: string;
  mode: string;
  type: string;
  name: string;
  values: Record<string, unknown>;
  sensitive_values?: Record<string, unknown> | boolean;
}
interface TfModule {
  address?: string;
  resources?: TfStateResource[];
  child_modules?: TfModule[];
}
interface TfConfigModule {
  resources?: { address: string; mode: string; expressions?: Record<string, unknown>; depends_on?: string[] }[];
  module_calls?: Record<string, { module?: TfConfigModule }>;
}
interface TfDoc {
  format_version?: string;
  planned_values?: { root_module?: TfModule };
  values?: { root_module?: TfModule };
  prior_state?: { values?: { root_module?: TfModule } };
  resource_changes?: TfResourceChange[];
  resource_drift?: TfResourceChange[];
  configuration?: { root_module?: TfConfigModule };
}

export class DiagramInputError extends Error {}

/** Builds a model from `terraform show -json` (state) or `terraform show -json <planfile>` (plan). */
export function buildModel(input: unknown): DiagramModel {
  if (!input || typeof input !== "object") throw new DiagramInputError("input is not a JSON object");
  const doc = input as TfDoc;
  const isPlan = Array.isArray(doc.resource_changes) || !!doc.planned_values;
  if (!isPlan && !doc.values && !doc.prior_state && !doc.format_version) {
    throw new DiagramInputError("input is neither terraform state nor plan JSON");
  }

  const nodes = new Map<string, DiagramNode>();
  const stateResources = new Map<string, TfStateResource>();

  const stateRoot = isPlan ? doc.prior_state?.values?.root_module : doc.values?.root_module;
  for (const r of walkModule(stateRoot)) {
    if (r.mode !== "managed") continue;
    stateResources.set(r.address, r);
    nodes.set(r.address, makeNode(r.address, r.type, r.name, "none"));
  }

  if (isPlan) {
    for (const r of walkModule(doc.planned_values?.root_module)) {
      if (r.mode === "managed" && !nodes.has(r.address)) nodes.set(r.address, makeNode(r.address, r.type, r.name, "none"));
    }
    for (const rc of doc.resource_changes ?? []) {
      if (rc.mode !== "managed") continue;
      const node = nodes.get(rc.address) ?? makeNode(rc.address, rc.type, rc.name, "none");
      node.action = toAction(rc.change.actions);
      node.changes = node.action === "none" ? [] : diffAttrs(rc.change);
      nodes.set(rc.address, node);
    }
    for (const rd of doc.resource_drift ?? []) {
      if (rd.mode !== "managed") continue;
      const node = nodes.get(rd.address) ?? makeNode(rd.address, rd.type, rd.name, "none");
      node.drifted = true;
      node.driftChanges = diffAttrs(rd.change);
      nodes.set(rd.address, node);
    }
  }

  const edges = isPlan && doc.configuration?.root_module
    ? configEdges(doc.configuration.root_module, nodes)
    : [];
  // State has no expressions, so fall back to matching ids/ARNs in attribute values.
  edges.push(...valueEdges(stateResources));

  return { source: isPlan ? "plan" : "state", nodes: [...nodes.values()], edges: dedupe(edges) };
}

function makeNode(address: string, type: string, name: string, action: Action): DiagramNode {
  return { address, type, name, vendor: vendorOf(type), action, drifted: false, changes: [], driftChanges: [] };
}

export function vendorOf(type: string): DiagramNode["vendor"] {
  if (type.startsWith("aws_")) return "aws";
  if (type.startsWith("azurerm_") || type.startsWith("azapi_") || type.startsWith("azuread_")) return "azure";
  if (type.startsWith("google_")) return "gcp";
  if (type.startsWith("oci_")) return "oci";
  return "other";
}

function* walkModule(mod: TfModule | undefined): Generator<TfStateResource> {
  if (!mod) return;
  yield* mod.resources ?? [];
  for (const child of mod.child_modules ?? []) yield* walkModule(child);
}

export function toAction(actions: string[]): Action {
  const has = (a: string) => actions.includes(a);
  if (has("delete") && has("create")) return "replace";
  if (has("create")) return "create";
  if (has("delete")) return "delete";
  if (has("update")) return "update";
  if (has("read")) return "read";
  return "none";
}

/** Attribute-level diff. Sensitive values are named but never copied. */
export function diffAttrs(change: TfChange): AttrChange[] {
  const before = change.before ?? {};
  const after = change.after ?? {};
  const unknown = isRecord(change.after_unknown) ? change.after_unknown : {};
  const out: AttrChange[] = [];
  for (const attr of new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(unknown)])) {
    const sensitive = flagged(change.before_sensitive, attr) || flagged(change.after_sensitive, attr);
    const unknownAfter = unknown[attr] === true;
    if (!unknownAfter && same(before[attr], after[attr])) continue;
    // Terraform reports empty/absent computed attrs as equal; skip null->null.
    if (before[attr] == null && after[attr] == null && !unknownAfter) continue;
    const entry: AttrChange = { attr };
    if (sensitive) entry.sensitive = true;
    else {
      if (attr in before) entry.before = before[attr];
      if (attr in after) entry.after = after[attr];
    }
    if (unknownAfter) entry.unknownAfter = true;
    out.push(entry);
  }
  return out.sort((a, b) => a.attr.localeCompare(b.attr));
}

function flagged(map: unknown, attr: string): boolean {
  if (map === true) return true;
  if (!isRecord(map)) return false;
  const v = map[attr];
  return v === true || (isRecord(v) && Object.keys(v).length > 0) || (Array.isArray(v) && v.length > 0);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Edges from configuration expressions. Works for resources that do not exist yet. */
function configEdges(root: TfConfigModule, nodes: Map<string, DiagramNode>): DiagramEdge[] {
  const byBase = new Map<string, string[]>();
  for (const n of nodes.values()) {
    const base = n.address.replace(/\[[^\]]*\]/g, "");
    byBase.set(base, [...(byBase.get(base) ?? []), n.address]);
  }
  const edges: DiagramEdge[] = [];
  const visit = (mod: TfConfigModule, prefix: string) => {
    for (const res of mod.resources ?? []) {
      if (res.mode !== "managed") continue;
      const fromBase = prefix + res.address;
      const refs = [...collectRefs(res.expressions), ...(res.depends_on ?? [])];
      for (const ref of refs) {
        if (ref.startsWith("data.")) continue;
        const qualified = prefix + ref;
        const exact = [...nodes.keys()].filter(address => qualified === address || qualified.startsWith(address + "."));
        const baseRef = qualified.replace(/\[[^\]]*\]/g, "");
        const targets = exact.length ? exact : [...byBase.keys()].filter(base => baseRef === base || baseRef.startsWith(base + ".")).flatMap(base => byBase.get(base)!);
        const sources = nodes.has(fromBase) ? [fromBase] : byBase.get(fromBase.replace(/\[[^\]]*\]/g, "")) ?? [];
        for (const from of sources)
          for (const to of targets) if (to !== from) edges.push({ from, to });
      }
    }
    for (const [name, call] of Object.entries(mod.module_calls ?? {}))
      if (call.module) visit(call.module, `${prefix}module.${name}.`);
  };
  visit(root, "");
  return edges;
}

function collectRefs(expr: unknown): string[] {
  if (Array.isArray(expr)) return expr.flatMap(collectRefs);
  if (!isRecord(expr)) return [];
  const own = Array.isArray(expr.references) ? (expr.references as string[]) : [];
  return [...own, ...Object.values(expr).flatMap(collectRefs)];
}

/** Edges from state attribute values that contain another resource's id or ARN. */
function valueEdges(resources: Map<string, TfStateResource>): DiagramEdge[] {
  const owner = new Map<string, string>();
  for (const r of resources.values()) {
    for (const key of ["id", "arn"]) {
      const v = r.values[key];
      // Short ids ("a", "1") would match everywhere; require some specificity.
      if (typeof v === "string" && v.length >= 6) owner.set(v, r.address);
    }
  }
  const edges: DiagramEdge[] = [];
  for (const r of resources.values()) {
    for (const [key, v] of Object.entries(r.values)) {
      if (key === "id" || key === "arn") continue;
      for (const s of strings(v)) {
        const to = owner.get(s);
        if (to && to !== r.address) edges.push({ from: r.address, to });
      }
    }
  }
  return edges;
}

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (isRecord(v)) return Object.values(v).flatMap(strings);
  return [];
}

function dedupe(edges: DiagramEdge[]): DiagramEdge[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    const k = `${e.from}\0${e.to}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
