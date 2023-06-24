/**
 * @public
 */
export const untypedAppUrl = function appUrl(
  route: string,
  params?: Record<string, string>,
  paramsPrefix: string = ''
): string {
  const path = route.split('/');
  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    if (segment.startsWith('[') && segment.endsWith(']')) {
      const key = segment.substring(segment.startsWith('[...') ? 4 : 1, segment.length - 1);
      path[i] = params ? params[paramsPrefix + key] || params[key] : '';
    }
  }
  return path.join('/');
};

/**
 * @public
 */
export function omitProps<T, KEYS extends keyof T>(obj: T, keys: KEYS[]): Omit<T, KEYS> {
  const omittedObj: Record<string, any> = {};
  for (const key in obj) {
    if (!key.startsWith('param:') && !keys.includes(key as any)) {
      omittedObj[key] = obj[key];
    }
  }
  return omittedObj as Omit<T, KEYS>;
}
