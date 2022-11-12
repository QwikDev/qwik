/**
 * Simple Auth For Testing Only!!!
 */
import type { Cookie } from '~qwik-city-runtime';

export const isUserAuthenticated = async (cookie: Cookie) => {
  return cookie.has(AUTHTOKEN_NAME);
};

export const signIn = async (formData: FormData, cookie: Cookie): Promise<AuthResult> => {
  const username = formData.get('username');
  const password = formData.get('password');

  if (username == 'qwik' && password == 'dev') {
    // super secret username/password (Testing purposes only, DO NOT DO THIS!!)
    cookie.set(AUTHTOKEN_NAME, Math.round(Math.random() * 9999999), {
      secure: true,
      httpOnly: true,
      maxAge: [5, 'minutes'],
    });
    return {
      status: 'signed-in',
    };
  }

  return {
    status: 'invalid',
  };
};

export const signOut = async (cookie: Cookie) => {
  cookie.delete(AUTHTOKEN_NAME);
  return {
    status: 'signed-out',
  };
};

export interface AuthResult {
  status: 'signed-in' | 'signed-out' | 'invalid';
}

const AUTHTOKEN_NAME = 'qwikcity-auth-token';
