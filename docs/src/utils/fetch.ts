const fetchProxy = (
  req: string | Request,
  requestInitr?: Request | RequestInit | undefined
): Promise<Response> => {
  if (import.meta.env.SSR) {
    // @ts-ignore
    return import('node-fetch').then((mod) => {
      return mod.default(req, requestInitr);
    });
  } else {
    return fetch(req, requestInitr);
  }
};
export { fetchProxy as fetch };
