import type { Diagnostic } from '@qwik.dev/optimizer';

export function createDiagnostic(file: string, message: string): Diagnostic {
  return {
    scope: 'compiler',
    category: 'error',
    code: 'vdomless-unsupported',
    file,
    message,
    highlights: null,
    suggestions: null,
  };
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}
