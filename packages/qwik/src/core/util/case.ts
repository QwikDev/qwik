export const fromCamelToKebabCase = (text: string): string => {
  return text
    .replace(/([A-Z])/g, '-$1')
    .replace(/^-/, '') // remove leading dash, this would be present if the first letter was uppercase
    .toLowerCase();
};

export const fromKebabToCamelCase = (text: string): string => {
  return text.replace(/-./g, (x) => x[1].toUpperCase());
};
