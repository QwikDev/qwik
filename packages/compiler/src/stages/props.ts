import type { CompilerContext, RenderNode } from '../types';

export function normalizeProps(ctx: CompilerContext) {
  for (const component of ctx.manifest.components) {
    if (component.root) {
      normalizeNodeProps(component.root);
    }
  }
}

function normalizeNodeProps(node: RenderNode) {
  if (node.kind !== 'element') {
    if (node.kind === 'fragment') {
      for (const child of node.children) {
        normalizeNodeProps(child);
      }
    }
    return;
  }
  node.props = node.props.filter((prop) => prop.name !== '__unsupported_spread');
  for (const prop of node.props) {
    if (prop.name === 'className') {
      prop.name = 'class';
    }
  }
  for (const child of node.children) {
    normalizeNodeProps(child);
  }
}
