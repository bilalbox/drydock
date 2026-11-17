import { AWS_ICONS } from "./icons/aws.ts";
import type { DiagramModel, DiagramNode } from "./model.ts";

export interface VisualNode {
  resource: DiagramNode;
  badges: DiagramNode[];
  children: VisualNode[];
}

/** Fold attachments in their declared direction, then choose the closest network container. */
export function groupModel(model: DiagramModel) {
  const nodes = new Map(model.nodes.map(resource => [resource.address, { resource, badges: [], children: [] } as VisualNode]));
  const folded = new Map<string, string>();
  for (const node of nodes.values()) {
    const direction = AWS_ICONS[node.resource.type]?.fold;
    if (!direction) continue;
    const candidates = model.edges.flatMap(edge =>
      direction === "references" && edge.from === node.resource.address ? [edge.to] :
      direction === "referencedBy" && edge.to === node.resource.address ? [edge.from] : []);
    // Avoid hiding an attachment on another attachment or folding unrelated dependencies.
    const parent = candidates.map(address => nodes.get(address)).find(candidate => candidate &&
      !AWS_ICONS[candidate.resource.type]?.fold &&
      (node.resource.type.startsWith(candidate.resource.type + "_") ||
        node.resource.type.split("_")[1] === candidate.resource.type.split("_")[1]));
    if (parent) {
      parent.badges.push(node.resource);
      folded.set(node.resource.address, parent.resource.address);
    }
  }
  const parents = new Map<string, string>();
  const roots: VisualNode[] = [];
  for (const [address, node] of nodes) {
    if (folded.has(address)) continue;
    const ownGroup = AWS_ICONS[node.resource.type]?.group;
    const targets = model.edges.filter(edge => edge.from === address).map(edge => nodes.get(edge.to));
    const parent = targets.find(target => target && target.resource.type === "aws_subnet" && !ownGroup) ??
      targets.find(target => target && target.resource.type === "aws_vpc" && ownGroup !== "vpc");
    if (parent) {
      parent.children.push(node);
      parents.set(address, parent.resource.address);
    } else roots.push(node);
  }
  const edges = model.edges.map(edge => ({ from: folded.get(edge.from) ?? edge.from, to: folded.get(edge.to) ?? edge.to }))
    .filter(edge => edge.from !== edge.to && parents.get(edge.from) !== edge.to);
  return { roots, edges, nodes, folded, parents };
}
