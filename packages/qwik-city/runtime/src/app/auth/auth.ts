/**
 * Simple Auth For Testing Only!!!
 */

import { createToken, getToken, removeToken } from './cookies';

export const isUserAuthenticated = async (cookie: string | null) => {
  const token = getToken(cookie);
  return !!token;
};

export const signIn = async (formData: FormData): Promise<AuthResult> => {
  const username = formData.get('username');
  const password = formData.get('password');

  if (username == 'qwik' && password == 'dev') {
    return {
      status: 'signed-in',
      cookie: createToken(),
    };
  }

  return {
    status: 'invalid',
    cookie: '',
  };
};

export const signOut = async () => {
  return {
    status: 'signed-out',
    cookie: removeToken(),
  };
};

export interface AuthResult {
  status: 'signed-in' | 'signed-out' | 'invalid';
  cookie: string;
}
