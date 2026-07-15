import { parseSync } from 'oxc-parser';
import { createDiagnostic, getErrorMessage } from './diagnostics';
import { getLang } from './module-utils';
import type { CompilerContext } from './types';

export function parseModule(ctx: CompilerContext) {
  try {
    const parsed = parseSync(ctx.input.path, ctx.input.code, {
      lang: getLang(ctx.input.path),
      sourceType: 'module',
      astType: 'ts',
      range: true,
    });
    ctx.program = parsed.program;
    const errors = parsed.errors;
    if (errors && errors.length > 0) {
      for (const error of errors) {
        ctx.diagnostics.push(
          createDiagnostic(ctx.input.path, getErrorMessage(error, 'Unable to parse module'))
        );
      }
    }
  } catch (error) {
    ctx.program = null;
    ctx.diagnostics.push(
      createDiagnostic(ctx.input.path, getErrorMessage(error, 'Unable to parse module'))
    );
  }
}
