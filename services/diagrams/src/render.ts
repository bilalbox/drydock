import fs from "node:fs/promises";
import ElkModule from "elkjs/lib/elk.bundled.js";
import type { ElkNode, ELK } from "elkjs/lib/elk-api.js";
import { buildModel } from "./parse.ts";
import { groupModel } from "./graph.ts";
import type { VisualNode } from "./graph.ts";
import { AWS_ICONS, FALLBACK_ICON } from "./icons/aws.ts";

const colors = { create: "#15803d", update: "#a16207", delete: "#b91c1c", replace: "#7e22ce", read: "#0369a1", none: "#64748b" };
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
const fallback = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="6" fill="#475569"/><path d="M14 24h20M24 14v20" stroke="white" stroke-width="3"/></svg>';

/** Render Terraform show JSON as a standalone SVG; only generated markup and escaped text enter the document. */
export async function renderDiagram(input: unknown): Promise<string> {
  const graph = groupModel(buildModel(input));
  if (!graph.roots.length) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 120" role="img"><title>No managed resources</title><text x="24" y="60">No managed resources yet. Apply Terraform or switch to Plan.</text></svg>';
  const toElk = (node: VisualNode): ElkNode => ({
    id: node.resource.address,
    width: 260, height: 110 + node.badges.length * 26,
    ...(node.children.length ? { children: node.children.map(toElk), layoutOptions: { "elk.padding": `[top=${90 + node.badges.length * 26},left=24,bottom=24,right=24]` } } : {}),
  });
  const layout: ElkNode = await new (ElkModule as unknown as { new(): ELK })().layout({
    id: "root", children: graph.roots.map(toElk),
    edges: graph.edges.map((edge, index) => ({ id: `e${index}`, sources: [edge.from], targets: [edge.to] })),
    layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT", "elk.hierarchyHandling": "INCLUDE_CHILDREN", "elk.spacing.nodeNode": "40", "elk.layered.spacing.nodeNodeBetweenLayers": "60" },
  });
  const icons = new Map<string, Promise<string>>();
  function icon(type: string) {
    const stem = AWS_ICONS[type]?.icon ?? FALLBACK_ICON;
    if (!icons.has(stem)) icons.set(stem, fs.readFile(new URL(`../assets/aws/${stem}.svg`, import.meta.url), "utf8").catch(() => fallback));
    return icons.get(stem)!;
  }
  function routes(node: ElkNode): string {
    return (node.edges ?? []).flatMap(edge => (edge.sections ?? []).map(section => {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      return `<polyline points="${points.map(p => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)"/>`;
    })).join("");
  }
  async function draw(node: ElkNode): Promise<string> {
    const visual = graph.nodes.get(node.id)!;
    const resource = visual.resource;
    const tooltip = (item: typeof resource) => [item.address, `${item.action}${item.drifted ? ", drift" : ""}`,
      ...item.changes.map(change => `${change.attr}: ${change.sensitive ? "[redacted]" : `${JSON.stringify(change.before) ?? "(absent)"} → ${change.unknownAfter ? "(known after apply)" : JSON.stringify(change.after) ?? "(absent)"}`}`),
      ...item.driftChanges.map(change => `Drift ${change.attr}: ${change.sensitive ? "[redacted]" : `${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`}`)].join("\n");
    const badge = (item: typeof resource, index: number) => `<g data-badge="${escape(item.address)}"><title>${escape(tooltip(item))}</title><rect x="12" y="${86 + index * 26}" width="236" height="22" rx="4" fill="#f1f5f9" stroke="${colors[item.action]}" ${item.drifted ? 'stroke-dasharray="4 3"' : ""}/><text x="18" y="${101 + index * 26}" font-size="10">${escape(`${item.name} · ${item.action}${item.drifted ? " · drift" : ""}`)}</text></g>`;
    const data = Buffer.from(await icon(resource.type)).toString("base64");
    return `<g data-address="${escape(resource.address)}" data-action="${resource.action}" transform="translate(${node.x ?? 0} ${node.y ?? 0})"><title>${escape(tooltip(resource))}</title><rect width="${node.width}" height="${node.height}" rx="8" fill="${node.children?.length ? "#f8fafc" : "#fff"}" stroke="${colors[resource.action]}" stroke-width="${resource.action === "none" ? 1 : 3}" ${resource.action === "delete" ? 'opacity="0.5"' : ""}/>${resource.drifted ? `<rect x="5" y="5" width="${node.width! - 10}" height="${node.height! - 10}" rx="5" fill="none" stroke="#ea580c" stroke-width="2" stroke-dasharray="6 4"/>` : ""}<image data-icon="${escape(AWS_ICONS[resource.type]?.icon ?? FALLBACK_ICON)}" x="12" y="14" width="40" height="40" href="data:image/svg+xml;base64,${data}"/><text x="62" y="30" font-size="13">${escape(resource.name.slice(0, 25))}</text><text x="62" y="48" font-size="10">${escape(resource.type.slice(0, 32))}</text><text x="12" y="74" font-size="11" fill="${colors[resource.action]}">${escape(resource.action === "delete" ? "delete · prior state" : resource.action)}${resource.drifted ? " · drift" : ""}</text>${visual.badges.map(badge).join("")}${routes(node)}${(await Promise.all((node.children ?? []).map(draw))).join("")}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Terraform architecture" font-family="system-ui, sans-serif" fill="#0f172a"><title>Terraform architecture</title><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#94a3b8"/></marker></defs>${routes(layout)}${(await Promise.all((layout.children ?? []).map(draw))).join("")}</svg>`;
}
