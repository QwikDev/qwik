// pascal to snake case
export const toSnakeCase = (str: string) =>
  str
    .split(/\.?(?=[A-Z])/)
    .join('-')
    .toLowerCase();
