export const isNode = (value: any): value is Node => {
  return value && typeof value.nodeType === 'number';
};

export const isElement = (value: object): value is Element => {
  return (value as any).nodeType === 1;
};
