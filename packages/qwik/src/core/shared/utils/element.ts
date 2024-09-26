export const isNode = (value: any): value is Node => {
  return value && typeof value.nodeType === 'number';
};

export const isDocument = (value: Node): value is Document => {
  return (value as any).nodeType === 9;
};

export const isElement = (value: object): value is Element => {
  return (value as any).nodeType === 1;
};

export const isText = (value: Node | Element): value is Text => {
  return (value as any).nodeType === 3;
};

export const isComment = (value: Node | Element): value is Comment => {
  return (value as any).nodeType === 8;
};
