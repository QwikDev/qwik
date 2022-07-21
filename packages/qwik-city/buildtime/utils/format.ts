import type { BuildContext } from '../types';

export function addError(ctx: BuildContext, e: any) {
  ctx.diagnostics.push({
    type: 'error',
    message: e ? String(e.stack || e) : 'Error',
  });
}

export function addWarning(ctx: BuildContext, message: string) {
  ctx.diagnostics.push({
    type: 'warn',
    message: String(message),
  });
}
