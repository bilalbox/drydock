/** Normalized diagram model. Independent of the Terraform JSON shape and of rendering. */

export type Action = "create" | "update" | "delete" | "replace" | "read" | "none";

export interface AttrChange {
  attr: string;
  /** Omitted when the value is sensitive. */
  before?: unknown;
  after?: unknown;
  sensitive?: boolean;
  /** True when the plan says the new value is only known after apply. */
  unknownAfter?: boolean;
}

export interface DiagramNode {
  /** Full Terraform address, e.g. module.net.aws_subnet.a["x"]. Unique. */
  address: string;
  type: string;
  name: string;
  /** Cloud vendor derived from the resource type prefix. */
  vendor: "aws" | "azure" | "gcp" | "oci" | "other";
  /** Planned action. "none" for state-only diagrams and no-op resources. */
  action: Action;
  /** True when the refresh found the resource changed outside Terraform. */
  drifted: boolean;
  changes: AttrChange[];
  driftChanges: AttrChange[];
}

export interface DiagramEdge {
  from: string;
  to: string;
}

export interface DiagramModel {
  source: "state" | "plan";
  nodes: DiagramNode[];
  /** `from` depends on / references `to`. */
  edges: DiagramEdge[];
}
