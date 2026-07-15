const unsupportedJsx = (): never => {
  throw new Error('JSX must be transformed by the Qwik compiler.');
};

export const Fragment = Symbol('Fragment');
export const jsx = (_type: unknown, _props: unknown): never => unsupportedJsx();
export const jsxs = (_type: unknown, _props: unknown): never => unsupportedJsx();
export const jsxDEV = (_type: unknown, _props: unknown): never => unsupportedJsx();
