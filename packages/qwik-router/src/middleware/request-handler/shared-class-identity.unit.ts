import { describe, expect, it } from 'vitest';
import { AbortMessage, RedirectMessage } from './redirect-handler';
import { RewriteMessage } from './rewrite-handler';
import { HttpError } from './http-error';
import { shareClassIdentity } from './shared-class-identity';

/** Declares the same classes again, as a second copy of the router does. */
const createRouterCopy = () => {
  class CopyAbortMessage {}
  shareClassIdentity(CopyAbortMessage, 'AbortMessage');
  class CopyRedirectMessage extends CopyAbortMessage {}
  shareClassIdentity(CopyRedirectMessage, 'RedirectMessage');
  class CopyHttpError extends Error {}
  shareClassIdentity(CopyHttpError, 'HttpError');
  return { CopyAbortMessage, CopyRedirectMessage, CopyHttpError };
};

describe('router class identity across copies', () => {
  const { CopyAbortMessage, CopyRedirectMessage, CopyHttpError } = createRouterCopy();

  it('recognizes instances made by another copy', () => {
    expect(new CopyHttpError() instanceof HttpError).toBe(true);
    expect(new CopyRedirectMessage() instanceof RedirectMessage).toBe(true);
    expect(new CopyRedirectMessage() instanceof AbortMessage).toBe(true);
    expect(new HttpError(403, 'no') instanceof CopyHttpError).toBe(true);
  });

  it('keeps sibling and parent classes apart', () => {
    expect(new CopyAbortMessage() instanceof RedirectMessage).toBe(false);
    expect(new CopyRedirectMessage() instanceof RewriteMessage).toBe(false);
    expect(new CopyHttpError() instanceof AbortMessage).toBe(false);
    expect(new Error('plain') instanceof HttpError).toBe(false);
    expect(new HttpError(500, 'x') instanceof Error).toBe(true);
  });

  it('keeps user subclasses to their own instances', () => {
    class NotFound extends HttpError {}
    expect(new HttpError(500, 'x') instanceof NotFound).toBe(false);
    expect(new NotFound(404, 'x') instanceof NotFound).toBe(true);
    expect(new NotFound(404, 'x') instanceof HttpError).toBe(true);
  });
});
