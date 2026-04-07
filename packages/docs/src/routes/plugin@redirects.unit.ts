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
    expect(runRedirect('/examples')).toEqual({
      status: 307,
      location: '/examples/introduction/hello-world/',
    });
  });

  it('redirects chat without leading whitespace in the target URL', () => {
    expect(runRedirect('/chat')).toEqual({
      status: 307,
      location: 'https://discord.gg/TsNCMd6uGW',
    });
  });
});
