import { createDiagnostic } from '../diagnostics';
import type { CompilerContext, RenderNode } from '../types';

export function rejectUnsupportedV1(ctx: CompilerContext) {
  for (const component of ctx.manifest.components) {
    if (!component.root) {
      continue;
    }
    visitRenderNode(component.root, (node) => {
      if (node.kind === 'expr') {
        component.supported = false;
        ctx.manifest.diagnostics.push(createDiagnostic(ctx.input.path, node.reason));
      }
    });
  }
}

function visitRenderNode(node: RenderNode, visitor: (node: RenderNode) => void) {
  visitor(node);
  if (node.kind === 'element' || node.kind === 'fragment') {
    for (const child of node.children) {
      visitRenderNode(child, visitor);
    }
  }
}
