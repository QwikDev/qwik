/**
 * Simple Auth For Testing Only!!!
 */

import type { Cookie } from 'packages/qwik-city/middleware/request-handler/cookie';
import { createToken, getToken, removeToken } from './cookies';

export const isUserAuthenticated = async (cookie: string | undefined | null) => {
  const token = getToken(cookie);
  return !!token;
};

export const signIn = async (formData: FormData, cookie: Cookie): Promise<AuthResult> => {
  const username = formData.get('username');
  const password = formData.get('password');

  if (username == 'qwik' && password == 'dev') {
    createToken(cookie);
    return {
      status: 'signed-in',
    };
  }

  return {
    status: 'invalid',
  };
};

export const signOut = async (cookie: Cookie) => {
  removeToken(cookie);
  return {
    status: 'signed-out',
  };
};

export interface AuthResult {
  status: 'signed-in' | 'signed-out' | 'invalid';
}
