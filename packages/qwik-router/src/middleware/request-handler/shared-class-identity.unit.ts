import { describe, expect, it } from 'vitest';
import { AbortMessage, RedirectMessage } from './redirect-handler';
import { RewriteMessage } from './rewrite-handler';
import { ServerError } from './server-error';
import { shareClassIdentity } from './shared-class-identity';

/** Declares the same classes again, as a second copy of the router does. */
const createRouterCopy = () => {
  class CopyAbortMessage {}
  shareClassIdentity(CopyAbortMessage, 'AbortMessage');
  class CopyRedirectMessage extends CopyAbortMessage {}
  shareClassIdentity(CopyRedirectMessage, 'RedirectMessage');
  class CopyServerError extends Error {}
  shareClassIdentity(CopyServerError, 'ServerError');
  return { CopyAbortMessage, CopyRedirectMessage, CopyServerError };
};

describe('router class identity across copies', () => {
  const { CopyAbortMessage, CopyRedirectMessage, CopyServerError } = createRouterCopy();

  it('recognizes instances made by another copy', () => {
    expect(new CopyServerError() instanceof ServerError).toBe(true);
    expect(new CopyRedirectMessage() instanceof RedirectMessage).toBe(true);
    expect(new CopyRedirectMessage() instanceof AbortMessage).toBe(true);
    expect(new ServerError(403, 'no') instanceof CopyServerError).toBe(true);
  });

  it('keeps sibling and parent classes apart', () => {
    expect(new CopyAbortMessage() instanceof RedirectMessage).toBe(false);
    expect(new CopyRedirectMessage() instanceof RewriteMessage).toBe(false);
    expect(new CopyServerError() instanceof AbortMessage).toBe(false);
    expect(new Error('plain') instanceof ServerError).toBe(false);
    expect(new ServerError(500, 'x') instanceof Error).toBe(true);
  });

  it('keeps user subclasses to their own instances', () => {
    class NotFound extends ServerError {}
    expect(new ServerError(500, 'x') instanceof NotFound).toBe(false);
    expect(new NotFound(404, 'x') instanceof NotFound).toBe(true);
    expect(new NotFound(404, 'x') instanceof ServerError).toBe(true);
  });
});
