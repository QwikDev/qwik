export const fromCamelToKebabCase = (text: string): string => {
  return text.replace(/([A-Z])/g, '-$1').toLowerCase();
};
