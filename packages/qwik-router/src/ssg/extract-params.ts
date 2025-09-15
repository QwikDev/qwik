/**
 * Extracts parameter names from the route name.
 *
 * Example: /base/[paramA]/[paramB].json -> ['paramA', 'paramB']
 */
export function extractParamNames(routeName: string): string[] {
  const params: string[] = [];
  let idx = 0;
  while (idx < routeName.length) {
    const start = routeName.indexOf('[', idx);
    if (start !== -1) {
      const end = routeName.indexOf(']', start);
      const param = routeName.slice(start + 1, end);
      params.push(param.startsWith('...') ? param.substring(3) : param);
      idx = end + 1;
    } else {
      idx = routeName.length;
    }
  }
  return params;
}
