import type { RequestHandler } from '@builder.io/qwik-city';
import { describe, expect, it, vi } from 'vitest';
import { combineRequestHandlers } from './combine-request-handlers';

describe('combineRequestHandlers', () => {
  // Correct order
  it('should execute code before and after next() in the correct order', async () => {
    const executionOrder: string[] = [];

    const handler1: RequestHandler = vi.fn(async (context) => {
      executionOrder.push('pre1');
      await context.next();
      executionOrder.push('post1');
    });
    const handler2: RequestHandler = vi.fn(async (context) => {
      executionOrder.push('pre2');
      await context.next();
      executionOrder.push('post2');
    });
    const handler3: RequestHandler = vi.fn(async (context) => {
      executionOrder.push('pre3');
      await context.next();
      executionOrder.push('post3');
    });

    const next = vi.fn(async () => {
      executionOrder.push('originalNext');
    });
    const context = { next } as any as Parameters<RequestHandler>[0];

    const combined = combineRequestHandlers(handler1, handler2, handler3);
    await combined(context);

    expect(executionOrder).toEqual([
      'pre1',
      'pre2',
      'pre3',
      'originalNext',
      'post3',
      'post2',
      'post1',
    ]);
  });

  // No Handlers
  it('should call original next when no handlers are provided', async () => {
    const next = vi.fn();
    const context = { next } as any as Parameters<RequestHandler>[0];

    const combined = combineRequestHandlers();
    await combined(context);

    expect(next).toHaveBeenCalledOnce();
  });

  // Single Handler
  it('should handle a single handler correctly', async () => {
    const handler: RequestHandler = vi.fn(async (context) => {
      await context.next();
    });

    const next = vi.fn();
    const context = { next } as any as Parameters<RequestHandler>[0];

    const combined = combineRequestHandlers(handler);
    await combined(context);

    expect(handler).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  // Handler Throws Error
  it('should propagate errors from handlers', async () => {
    const erroringHandler: RequestHandler = vi.fn(async () => {
      throw new Error('Test error');
    });

    const next = vi.fn();
    const context = { next } as any as Parameters<RequestHandler>[0];

    const combined = combineRequestHandlers(erroringHandler);

    await expect(combined(context)).rejects.toThrow('Test error');
    expect(next).not.toHaveBeenCalled();
  });

  // Handler Does Not Call `next()`
  it('should not call subsequent handlers if a handler does not call next', async () => {
    const handler1: RequestHandler = vi.fn(async () => {
      /* not calling next */
    });
    const handler2: RequestHandler = vi.fn(async (context) => {
      await context.next();
    });

    const next = vi.fn();
    const context = { next } as any as Parameters<RequestHandler>[0];

    const combined = combineRequestHandlers(handler1, handler2);
    await combined(context);

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  // Asynchronous Handlers
  it('should handle asynchronous handlers correctly', async () => {
    const handler: RequestHandler = vi.fn(async (context) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await context.next();
    });

    const next = vi.fn();
    const context = { next } as any as Parameters<RequestHandler>[0];

    const combined = combineRequestHandlers(handler);
    await combined(context);

    expect(handler).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  // Context Modification
  it('should pass modified context to subsequent handlers', async () => {
    const handler1: RequestHandler = vi.fn(async (context) => {
      context.sharedMap.set('modified', true);
      await context.next();
    });
    const handler2: RequestHandler = vi.fn(async (context) => {
      expect(context.sharedMap.get('modified')).toBe(true);
      await context.next();
    });

    const next = vi.fn();
    const context = {
      next,
      sharedMap: new Map(),
    } as any as Parameters<RequestHandler>[0];

    const combined = combineRequestHandlers(handler1, handler2);
    await combined(context);

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });
});
