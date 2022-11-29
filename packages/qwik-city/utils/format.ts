import type { BuildContext } from '../buildtime/types';

export function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
  });
}

export function addError(ctx: BuildContext, e: any) {
  ctx.diagnostics.push({
    type: 'error',
    message: e ? String(e.stack || e) : 'Error',
  });
}

export function addWarning(ctx: BuildContext, message: string) {
  ctx.diagnostics.push({
    type: 'warn',
    message: String(message),
  });
}

export function msToString(ms: number) {
  if (ms < 1) {
    return ms.toFixed(2) + ' ms';
  }
  if (ms < 1000) {
    return ms.toFixed(1) + ' ms';
  }
  if (ms < 60000) {
    return (ms / 1000).toFixed(1) + ' s';
  }
  return (ms / 60000).toFixed(1) + ' m';
}

export function validateSerializable(val: any) {
  JSON.stringify(val);
  if (!isSerializable(val)) {
    throw new Error(`Unable to serialize value.`);
  }
}

function isSerializable(val: any) {
  if (
    val == null ||
    typeof val === 'string' ||
    typeof val === 'boolean' ||
    typeof val === 'number'
  ) {
    return true;
  }

  if (Array.isArray(val)) {
    for (const item of val) {
      if (!isSerializable(item)) {
        return false;
      }
    }
    return true;
  }

  if (val.constructor == null || val.constructor === Object) {
    for (const prop in val) {
      if (!isSerializable(val[prop])) {
        return false;
      }
    }
    return true;
  }

  return false;
}
