import { describe, expect, it } from 'vitest';

import { onGet } from './plugin@redirects';

const runRedirect = (pathname: string) => {
  try {
    onGet({
      url: new URL(`https://qwik.dev${pathname}`),
      redirect: (status: number, location: string) => ({ status, location }),
    } as never);
  } catch (redirectResponse) {
    return redirectResponse;
  }

  throw new Error(`Expected ${pathname} to redirect`);
};

describe('plugin redirects', () => {
  it('redirects temporary docs routes without whitespace mismatches', () => {
    expect(runRedirect('/guide')).toEqual({ status: 307, location: '/docs/' });
  });

  it('redirects examples to the playground', () => {
    expect(runRedirect('/examples')).toEqual({ status: 308, location: '/playground/' });
    expect(runRedirect('/examples/introduction/hello-world/')).toEqual({
      status: 308,
      location: '/playground/',
    });
    expect(runRedirect('/examples/reactivity/counter/')).toEqual({
      status: 308,
      location: '/playground/?example=counter',
    });
  });

  it('redirects chat without leading whitespace in the target URL', () => {
    expect(runRedirect('/chat')).toEqual({
      status: 307,
      location: 'https://discord.gg/TsNCMd6uGW',
    });
  });
});
