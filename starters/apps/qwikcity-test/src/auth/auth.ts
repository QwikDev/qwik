/**
 * Simple Auth For Testing Only!!!
 */
import type { Cookie } from '@builder.io/qwik-city';

export const isUserAuthenticated = async (cookie: Cookie) => {
  return cookie.has(AUTHTOKEN_NAME);
};

export const signIn = async (formData: FormData, cookie: Cookie): Promise<AuthResult> => {
  const username = formData.get('username');
  const password = formData.get('password');

  if (username == 'qwik' && password == 'dev') {
    // super secret username/password (Testing purposes only, DO NOT DO THIS!!)
    cookie.set(AUTHTOKEN_NAME, Math.round(Math.random() * 9999999), {
      httpOnly: true,
      maxAge: [5, 'minutes'],
      path: '/',
    });
    return {
      status: 'signed-in',
    };
  }

  return {
    status: 'invalid',
  };
};

export const signOut = (cookie: Cookie) => {
  cookie.delete(AUTHTOKEN_NAME, { path: '/' });
  return {
    status: 'signed-out',
  };
};

export interface AuthResult {
  status: 'signed-in' | 'signed-out' | 'invalid';
}

const AUTHTOKEN_NAME = 'qwikcity-auth-token';
