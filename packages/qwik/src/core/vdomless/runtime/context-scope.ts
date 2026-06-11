export type ContextKey = string;

export class ContextScope {
  values = new Map<ContextKey, unknown>();
  constructor(
    public id: string | null,
    public parent: ContextScope | null
  ) {}
}

export const createContextScope = (parent: ContextScope | null): ContextScope => {
  return new ContextScope(null, parent);
};

export const isContextScope = (value: unknown): value is ContextScope => {
  return value instanceof ContextScope;
};
