import { vnode_isVNode, vnode_toString } from '../../client/vnode';
import { isObject } from '../utils/types';
import { type Constants, TypeIds, _typeIdNames, _constantNames } from './constants';

const circularProofJson = (obj: unknown, indent?: string | number) => {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (_, value) => {
      if (isObject(value)) {
        if (seen.has(value)) {
          return `[Circular ${value.constructor.name}]`;
        }
        seen.add(value);
      }
      return value;
    },
    indent
  );
};

const printRaw = (value: any, prefix: string) => {
  let result = vnode_isVNode(value)
    ? vnode_toString.call(value, 1, '', true).replaceAll(/\n.*/gm, '')
    : typeof value === 'function'
      ? String(value)
      : circularProofJson(value, 2);
  if (result.length > 500) {
    result = result.slice(0, 500) + '"...';
  }
  result = result.replace(/\n/g, '\n' + prefix);
  return result.includes('\n') ? (result = `\n${prefix}${result}`) : result;
};

let hasRaw = false;

/** @internal */
export const _dumpState = (
  state: unknown[],
  color = false,
  prefix = '',
  limit: number | null = 20
) => {
  const RED = color ? '\x1b[31m' : '';
  const RESET = color ? '\x1b[0m' : '';
  const isRoot = prefix === '';
  const out: any[] = [];
  for (let i = 0; i < state.length; i++) {
    if (limit && i > 2 * limit) {
      out.push('...');
      break;
    }
    const key = state[i];
    let value = state[++i];
    if (key === TypeIds.Plain) {
      const isRaw = typeof value !== 'number' && typeof value !== 'string';
      if (isRaw) {
        hasRaw = true;
      }
      const type = `{${isObject(value) ? value.constructor.name : typeof value}}`;

      out.push(`${RED}${type}${RESET} ${printRaw(value, `${prefix}  `)}`);
    } else {
      if (key === TypeIds.Constant) {
        value = constantToName(value as Constants);
      } else if (typeof value === 'string') {
        value = JSON.stringify(value);
        if ((value as string).length > 120) {
          value = (value as string).slice(0, 120) + '"...';
        }
      } else if (key === TypeIds.ForwardRefs) {
        value = '[' + `\n${prefix}  ${(value as number[]).join(`\n${prefix}  `)}\n${prefix}]`;
      } else if (Array.isArray(value)) {
        value = value.length ? `[\n${_dumpState(value, color, `${prefix}  `)}\n${prefix}]` : '[]';
      }
      out.push(`${RED}${typeIdToName(key as TypeIds)}${RESET} ${value}`);
    }
  }
  const result = out.map((v, i) => `${prefix}${isRoot ? `${i} ` : ''}${v}`).join('\n');
  if (isRoot) {
    const count = hasRaw ? '' : `(${JSON.stringify(state).length} chars)`;
    hasRaw = false;
    return `\n${result}\n${count}`;
  }
  return result;
};

export const typeIdToName = (code: TypeIds) => {
  return _typeIdNames[code] || `Unknown(${code})`;
};

export const constantToName = (code: Constants) => {
  return _constantNames[code] || `Unknown(${code})`;
};
