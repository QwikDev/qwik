import type { EndpointHandler } from '~qwik-city-runtime';

export type Cookie = Record<string, string>;
export type AuthResult = 'New Login' | 'Already Logged In' | 'Invalid Credentials';
export const STATUS: Record<AuthResult, { code: number; msg: string }> = {
  'New Login': {
    code: 200,
    msg: 'You are now logged in!',
  },
  'Already Logged In': {
    code: 200,
    msg: 'You are now logged in!',
  },
  'Invalid Credentials': {
    code: 403,
    msg: 'Incorrect user name and password',
  },
};

export const post: EndpointHandler = async (ev) => {
  const cookie = parseCookie(ev.request.headers.get('cookie'));
  const formdata = await ev.request.formData();
  const result = handleAuth(formdata, cookie);
  const status = STATUS[result];
  return {
    status: status.code,
    headers:
      result == 'New Login'
        ? {
            'Set-Cookie': `${AUTHTOKEN_NAME}=${generateToken()}; Secure; HttpOnly; Max-Age=${
              60 * 5
            }`,
          }
        : {},
  };
};

const AUTHTOKEN_NAME = 'qwikcity-auth-token';
export const handleAuth = (submission: FormData, cookie: Cookie): AuthResult => {
  const username = submission.get('username');
  const password = submission.get('password');
  const token = cookie[AUTHTOKEN_NAME];
  if (token !== undefined) {
    return 'Already Logged In';
  }
  if (username == 'admin' && password == 'password') {
    return 'New Login';
  }
  return 'Invalid Credentials';
};

export const generateToken = () => {
  return Math.round(Math.random() * 1000);
};

export const parseCookie = (raw: string | null): Cookie => {
  if (!raw) {
    return {};
  }
  return raw
    .split(';')
    .map((v) => v.split('='))
    .reduce((acc: Cookie, v) => {
      acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
      return acc;
    }, {});
};
