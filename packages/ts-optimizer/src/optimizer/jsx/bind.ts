export interface BindTransformResult {
  propName: string;
  propValue: string;
  handler: { name: string; code: string } | null;
  needsImport: string[];
}

interface BindMapping {
  propName: string;
  helperFn: string;
  helperStr: string;
}

const KNOWN_BINDS: Record<string, BindMapping> = {
  value: {
    propName: 'value',
    helperFn: '_val',
    helperStr: '"_val"',
  },
  checked: {
    propName: 'checked',
    helperFn: '_chk',
    helperStr: '"_chk"',
  },
};

export function isBindProp(propName: string): boolean {
  return propName.startsWith('bind:');
}

export function transformBindProp(
  bindAttrName: string,
  valueExprSource: string
): BindTransformResult {
  const bindKey = bindAttrName.slice('bind:'.length);
  const mapping = KNOWN_BINDS[bindKey];

  if (!mapping) {
    return {
      propName: bindAttrName,
      propValue: valueExprSource,
      handler: null,
      needsImport: [],
    };
  }

  const handlerCode = `inlinedQrl(${mapping.helperFn}, ${mapping.helperStr}, [${valueExprSource}])`;

  return {
    propName: mapping.propName,
    propValue: valueExprSource,
    handler: {
      name: 'q-e:input',
      code: handlerCode,
    },
    needsImport: ['inlinedQrl', mapping.helperFn],
  };
}

export function mergeEventHandlers(existingHandler: string | null, newHandler: string): string {
  if (existingHandler === null) {
    return newHandler;
  }
  return `[${newHandler}, ${existingHandler}]`;
}
