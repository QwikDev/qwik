/**
 * Simple Auth For Testing Only!!!
 */

export const getToken = (cookie: string | null): string | null => {
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

export const createToken = () => {
  return `${AUTHTOKEN_NAME}=${Math.round(Math.random() * 9999999)}; Secure; HttpOnly; Max-Age=${
    60 * 5
  }`;
};

export const removeToken = () => {
  return `${AUTHTOKEN_NAME}=; Secure; HttpOnly; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
};

const AUTHTOKEN_NAME = 'qwikcity-auth-token';
