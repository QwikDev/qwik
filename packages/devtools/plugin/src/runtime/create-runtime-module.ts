export type RuntimePart = string | false | null | undefined;
export type RuntimeInstaller = (...args: any[]) => unknown;

interface RuntimeExpression {
  __runtimeExpression: string;
}

export function createRuntimeModule(parts: RuntimePart[]): string {
  return (
    parts
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .map((part) => part.trim())
      .join('\n\n') + '\n'
  );
}

export function createRuntimeInstallerSource(installer: RuntimeInstaller): string {
  return installer.toString();
}

export function createRuntimeCall(name: string, args: unknown[]): string {
  return `${name}(${args.map(serializeRuntimeValue).join(', ')});`;
}

export function createRuntimeAssignment(name: string, expression: string): string {
  return `const ${name} = ${expression};`;
}

export function runtimeExpression(source: string): RuntimeExpression {
  return { __runtimeExpression: source };
}

export function createRuntimeVar(name: string, value: string): string {
  return `var ${name} = ${JSON.stringify(value)};`;
}

export function windowGlobalAccess(key: string): string {
  return `window.${key}`;
}

export function serializeRuntimeValue(value: unknown): string {
  if (isRuntimeExpression(value)) {
    return value.__runtimeExpression;
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeRuntimeValue).join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    return `{ ${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}: ${serializeRuntimeValue(item)}`)
      .join(', ')} }`;
  }
  return JSON.stringify(value);
}

function isRuntimeExpression(value: unknown): value is RuntimeExpression {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as RuntimeExpression).__runtimeExpression === 'string'
  );
}
