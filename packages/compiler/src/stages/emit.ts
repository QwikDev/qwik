import type { CompilerContext } from '../types';
import { emitCsrModule } from './emit-csr';
import { emitSsrModule } from './emit-ssr';

export function emitModules(ctx: CompilerContext) {
  if (ctx.manifest.diagnostics.length > 0) {
    return;
  }
  const supported = ctx.manifest.components.filter(
    (component) => component.supported && component.root !== null
  );
  if (supported.length === 0) {
    return;
  }

  const isServer = ctx.options.isServer !== false;
  ctx.outputCode = isServer ? emitSsrModule(supported) : emitCsrModule(supported);
}
