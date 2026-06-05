// Per-session storage with random session IDs stored in cookies.
const sessionData = new Map<string, string[]>();

export const SESSION_COOKIE = 'qwik-e2e';

export const getSessionData = (sessionId: string | undefined): string[] => {
  if (!sessionId) {
    return [];
  }
  let data = sessionData.get(sessionId);
  if (!data) {
    data = [];
    sessionData.set(sessionId, data);
  }
  return data;
};

export const createSessionId = () =>
  `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
