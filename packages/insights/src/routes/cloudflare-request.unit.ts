import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@qwik.dev/router';
import { onRequest } from './plugin@cloudflare';

describe('Cloudflare request completion', () => {
  it('keeps telemetry writes alive after the response is sent', async () => {
    let finishWrites!: () => void;
    const completion = new Promise<void>((resolve) => {
      finishWrites = resolve;
    });
    const waitUntil = vi.fn();
    const next = vi.fn(() => completion);

    const result = onRequest({ next, platform: { ctx: { waitUntil } } } as unknown as RequestEvent);

    expect(next).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
    const backgroundCompletion = waitUntil.mock.calls[0][0] as Promise<void>;
    const completed = vi.fn();
    void backgroundCompletion.then(completed);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    finishWrites();
    await result;
    await backgroundCompletion;
    expect(completed).toHaveBeenCalledOnce();
  });

  it('completes requests during local development without a Worker context', async () => {
    const next = vi.fn(async () => {});

    await onRequest({ next, platform: {} } as unknown as RequestEvent);

    expect(next).toHaveBeenCalledOnce();
  });

  it('leaves request errors to the router without failing background completion', async () => {
    const failure = new Error('Telemetry write failed');
    const completion = Promise.reject(failure);
    const waitUntil = vi.fn();
    const next = () => completion;

    const result = onRequest({ next, platform: { ctx: { waitUntil } } } as unknown as RequestEvent);

    await expect(result).rejects.toBe(failure);
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });
});
