const CLIENT_PREFIX = "client:";
const HOST_PREFIX = "host:";

export const getHostProps = (
  props: Record<string, any>
): Record<string, any> => {
  const obj: Record<string, any> = {};
  Object.keys(props).forEach((key) => {
    if (key.startsWith(HOST_PREFIX)) {
      obj[key.slice(HOST_PREFIX.length)] = props[key];
    }
  });
  return obj;
};

export const getSvelteProps = (
  props: Record<string, any>
): Record<string, any> => {
  const obj: Record<string, any> = {};
  Object.keys(props).forEach((key) => {
    if (!key.startsWith(CLIENT_PREFIX) && !key.startsWith(HOST_PREFIX)) {
      const normalizedKey = key.endsWith("$") ? key.slice(0, -1) : key;
      obj[normalizedKey] = props[key];
    }
  });
  return obj;
};
