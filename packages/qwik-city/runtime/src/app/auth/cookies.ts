/**
 * Simple Auth For Testing Only!!!
 */

import type { Cookie } from 'packages/qwik-city/middleware/request-handler/cookie';

export const getToken = (cookie: string | undefined | null): string | null => {
  if (!cookie) {
    return null;
  }
  return (
    cookie
      .split(';')
      .map((v) => v.split('='))
      .reduce((acc, v) => {
        acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
        return acc;
      }, {} as Record<string, string>)[AUTHTOKEN_NAME] || null
  );
};

export const createToken = (cookie: Cookie) => {
  cookie.set(AUTHTOKEN_NAME, Math.round(Math.random() * 9999999), {
    secure: true,
    httpOnly: true,
    maxAge: [5, 'minutes'],
  });
};

export const removeToken = (cookie: Cookie) => {
  cookie.delete(AUTHTOKEN_NAME);
};

export const AUTHTOKEN_NAME = 'qwikcity-auth-token';
