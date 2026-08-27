// Minimal inlined replacement for `kleur/colors` — same color-support detection.
const isColorEnabled = () => {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  if (!env || env.NODE_DISABLE_COLORS != null || env.NO_COLOR != null || env.TERM === 'dumb') {
    return false;
  }
  if (env.FORCE_COLOR != null) {
    return env.FORCE_COLOR !== '0';
  }
  return !!process.stdout?.isTTY;
};

const enabled = /*#__PURE__*/ isColorEnabled();

const style =
  (open: number, close: number) =>
  (text: string | number): string =>
    enabled ? `\x1b[${open}m${text}\x1b[${close}m` : String(text);

export const bold = /*#__PURE__*/ style(1, 22);
export const dim = /*#__PURE__*/ style(2, 22);
export const red = /*#__PURE__*/ style(31, 39);
export const green = /*#__PURE__*/ style(32, 39);
export const magenta = /*#__PURE__*/ style(35, 39);
