// src/assert.ts
function isObject(value) {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

// src/compact.ts
function compact(value) {
  return Object.fromEntries(Object.entries(value !== null && value !== void 0 ? value : {}).filter(([_, value2]) => value2 !== void 0));
}

// src/condition.ts
var isBaseCondition = v => v === 'base';
function filterBaseConditions(c) {
  return c.slice().filter(v => !isBaseCondition(v));
}

// src/css-important.ts
var importantRegex = /!(important)?$/;
function isImportant(value) {
  return typeof value === 'string' ? importantRegex.test(value) : false;
}
function withoutImportant(value) {
  return typeof value === 'string' ? value.replace(importantRegex, '').trim() : value;
}
function withoutSpace(str) {
  return typeof str === 'string' ? str.replaceAll(' ', '_') : str;
}

// src/hash.ts
function toChar(code) {
  return String.fromCharCode(code + (code > 25 ? 39 : 97));
}
function toName(code) {
  let name = '';
  let x;
  for (x = Math.abs(code); x > 52; x = x / 52 | 0) name = toChar(x % 52) + name;
  return toChar(x % 52) + name;
}
function toPhash(h, x) {
  let i = x.length;
  while (i) h = h * 33 ^ x.charCodeAt(--i);
  return h;
}
function toHash(value) {
  return toName(toPhash(5381, value) >>> 0);
}

// src/merge-props.ts
function mergeProps(...sources) {
  const result = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (isObject(value)) {
        result[key] = mergeProps(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

// src/walk-object.ts
function walkObject(target, predicate, options = {}) {
  const {
    stop,
    getKey
  } = options;
  function inner(value, path = []) {
    if (isObject(value) || Array.isArray(value)) {
      const result = {};
      for (const [prop, child] of Object.entries(value)) {
        var _getKey;
        const key = (_getKey = getKey === null || getKey === void 0 ? void 0 : getKey(prop)) !== null && _getKey !== void 0 ? _getKey : prop;
        const childPath = [...path, key];
        if (stop !== null && stop !== void 0 && stop(value, childPath)) {
          return predicate(value, path);
        }
        result[key] = inner(child, childPath);
      }
      return result;
    }
    return predicate(value, path);
  }
  return inner(target);
}
function mapObject(obj, fn) {
  if (!isObject(obj)) return fn(obj);
  return walkObject(obj, value => fn(value));
}

// src/normalize-style-object.ts
function toResponsiveObject(values, breakpoints) {
  return values.reduce((acc, current, index) => {
    const key = breakpoints[index];
    if (current != null) {
      acc[key] = current;
    }
    return acc;
  }, {});
}
function normalizeShorthand(styles, context) {
  const {
    hasShorthand,
    resolveShorthand
  } = context.utility;
  return walkObject(styles, v => v, {
    getKey: prop => {
      return hasShorthand ? resolveShorthand(prop) : prop;
    }
  });
}
function normalizeStyleObject(styles, context) {
  const {
    utility,
    conditions
  } = context;
  const {
    hasShorthand,
    resolveShorthand
  } = utility;
  return walkObject(styles, value => {
    return Array.isArray(value) ? toResponsiveObject(value, conditions.breakpoints.keys) : value;
  }, {
    stop: value => Array.isArray(value),
    getKey: prop => {
      return hasShorthand ? resolveShorthand(prop) : prop;
    }
  });
}

// src/classname.ts
var fallbackCondition = {
  shift: v => v,
  finalize: v => v,
  breakpoints: {
    keys: []
  }
};
var sanitize = value => typeof value === 'string' ? value.replaceAll(/[\n\s]+/g, ' ') : value;
function createCss(context) {
  const {
    utility,
    hash,
    conditions: conds = fallbackCondition
  } = context;
  const formatClassName = str => [utility.prefix, str].filter(Boolean).join('-');
  const hashFn = (conditions, className) => {
    let result;
    if (hash) {
      const baseArray = [...conds.finalize(conditions), className];
      result = formatClassName(toHash(baseArray.join(':')));
    } else {
      const baseArray = [...conds.finalize(conditions), formatClassName(className)];
      result = baseArray.join(':');
    }
    return result;
  };
  return (styleObject = {}) => {
    const normalizedObject = normalizeStyleObject(styleObject, context);
    const classNames = /* @__PURE__ */new Set();
    walkObject(normalizedObject, (value, paths) => {
      const important = isImportant(value);
      if (value == null) return;
      const [prop, ...allConditions] = conds.shift(paths);
      const conditions = filterBaseConditions(allConditions);
      const transformed = utility.transform(prop, withoutImportant(sanitize(value)));
      let className = hashFn(conditions, transformed.className);
      if (important) className = `${className}!`;
      classNames.add(className);
    });
    return Array.from(classNames).join(' ');
  };
}
function compactStyles(...styles) {
  return styles.filter(style => isObject(style) && Object.keys(compact(style)).length > 0);
}
function createMergeCss(context) {
  function resolve(styles) {
    const allStyles = compactStyles(...styles);
    if (allStyles.length === 1) return allStyles;
    return allStyles.map(style => normalizeShorthand(style, context));
  }
  function mergeCss(...styles) {
    return mergeProps(...resolve(styles));
  }
  function assignCss(...styles) {
    return Object.assign({}, ...resolve(styles));
  }
  return {
    mergeCss,
    assignCss
  };
}

// src/normalize-html.ts
var htmlProps = ['htmlSize', 'htmlTranslate', 'htmlWidth', 'htmlHeight'];
function convert(key) {
  return htmlProps.includes(key) ? key.replace('html', '').toLowerCase() : key;
}
function normalizeHTMLProps(props) {
  return Object.fromEntries(Object.entries(props).map(([key, value]) => [convert(key), value]));
}
normalizeHTMLProps.keys = htmlProps;

// src/split-props.ts
function splitProps(props, ...keys) {
  const descriptors = Object.getOwnPropertyDescriptors(props);
  const dKeys = Object.keys(descriptors);
  const split = k => {
    const clone = {};
    for (let i = 0; i < k.length; i++) {
      const key = k[i];
      if (descriptors[key]) {
        Object.defineProperty(clone, key, descriptors[key]);
        delete descriptors[key];
      }
    }
    return clone;
  };
  const fn = key => split(Array.isArray(key) ? key : dKeys.filter(key));
  return keys.map(fn).concat(split(dKeys));
}

// src/memo.ts
var memo = fn => {
  const cache = /* @__PURE__ */new Map();
  const get = (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
  return get;
};

// src/hypenate.ts
var dashCaseRegex = /[A-Z]/g;
var hypenateProperty = memo(property => {
  if (property.startsWith('--')) return property;
  return property.replace(dashCaseRegex, match => `-${match.toLowerCase()}`);
});
function __spreadValues(a, b) {
  return {
    ...a,
    ...b
  };
}
function __objRest(source, exclude) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !exclude.includes(key)));
}
const conditions = new Set(['_hover', '_focus', '_focusWithin', '_focusVisible', '_disabled', '_active', '_visited', '_target', '_readOnly', '_readWrite', '_empty', '_checked', '_enabled', '_expanded', '_highlighted', '_before', '_after', '_firstLetter', '_firstLine', '_marker', '_selection', '_file', '_backdrop', '_first', '_last', '_only', '_even', '_odd', '_firstOfType', '_lastOfType', '_onlyOfType', '_peerFocus', '_peerHover', '_peerActive', '_peerFocusWithin', '_peerFocusVisible', '_peerDisabled', '_peerChecked', '_peerInvalid', '_peerExpanded', '_peerPlaceholderShown', '_groupFocus', '_groupHover', '_groupActive', '_groupFocusWithin', '_groupFocusVisible', '_groupDisabled', '_groupChecked', '_groupExpanded', '_groupInvalid', '_indeterminate', '_required', '_valid', '_invalid', '_autofill', '_inRange', '_outOfRange', '_placeholder', '_placeholderShown', '_pressed', '_selected', '_default', '_optional', '_open', '_fullscreen', '_loading', '_currentPage', '_currentStep', '_motionReduce', '_motionSafe', '_print', '_landscape', '_portrait', '_dark', '_light', '_osDark', '_osLight', '_highConstrast', '_lessContrast', '_moreContrast', '_ltr', '_rtl', '_scrollbar', '_scrollbarThumb', '_scrollbarTrack', '_horizontal', '_vertical', 'sm', 'smOnly', 'smDown', 'md', 'mdOnly', 'mdDown', 'lg', 'lgOnly', 'lgDown', 'xl', 'xlOnly', 'xlDown', '2xl', '2xlOnly', 'smToMd', 'smToLg', 'smToXl', 'smTo2xl', 'mdToLg', 'mdToXl', 'mdTo2xl', 'lgToXl', 'lgTo2xl', 'xlTo2xl', 'base']);
function isCondition(value) {
  return conditions.has(value) || /^@|&|&$/.test(value);
}
const underscoreRegex = /^_/;
const selectorRegex = /&|@/;
function finalizeConditions(paths) {
  return paths.map(path => {
    if (conditions.has(path)) {
      return path.replace(underscoreRegex, '');
    }
    if (selectorRegex.test(path)) {
      return `[${withoutSpace(path.trim())}]`;
    }
    return path;
  });
}
function sortConditions(paths) {
  return paths.sort((a, b) => {
    const aa = isCondition(a);
    const bb = isCondition(b);
    if (aa && !bb) return 1;
    if (!aa && bb) return -1;
    return 0;
  });
}
const classNameMap = {
  aspectRatio: 'aspect',
  boxDecorationBreak: 'decoration',
  zIndex: 'z',
  boxSizing: 'box',
  objectPosition: 'object',
  objectFit: 'object',
  overscrollBehavior: 'overscroll',
  overscrollBehaviorX: 'overscroll-x',
  overscrollBehaviorY: 'overscroll-y',
  position: 'pos',
  top: 'top',
  left: 'left',
  insetInline: 'inset-x',
  insetBlock: 'inset-y',
  inset: 'inset',
  insetBlockEnd: 'inset-b',
  insetBlockStart: 'inset-t',
  insetInlineEnd: 'end',
  insetInlineStart: 'start',
  right: 'right',
  bottom: 'bottom',
  insetX: 'inset-x',
  insetY: 'inset-y',
  float: 'float',
  visibility: 'vis',
  display: 'd',
  hideFrom: 'hide',
  hideBelow: 'show',
  flexBasis: 'basis',
  flex: 'flex',
  flexDirection: 'flex',
  flexGrow: 'grow',
  flexShrink: 'shrink',
  gridTemplateColumns: 'grid-cols',
  gridTemplateRows: 'grid-cols',
  gridColumn: 'col-span',
  gridRow: 'row-span',
  gridColumnStart: 'col-start',
  gridColumnEnd: 'col-end',
  gridAutoFlow: 'grid-flow',
  gridAutoColumns: 'auto-cols',
  gridAutoRows: 'auto-rows',
  gap: 'gap',
  gridGap: 'gap',
  gridRowGap: 'gap-x',
  gridColumnGap: 'gap-y',
  rowGap: 'gap-x',
  columnGap: 'gap-y',
  justifyContent: 'justify',
  alignContent: 'content',
  alignItems: 'items',
  alignSelf: 'self',
  padding: 'p',
  paddingLeft: 'pl',
  paddingRight: 'pr',
  paddingTop: 'pt',
  paddingBottom: 'pb',
  paddingBlock: 'py',
  paddingBlockEnd: 'pb',
  paddingBlockStart: 'pt',
  paddingInline: 'px',
  paddingInlineEnd: 'pe',
  paddingInlineStart: 'ps',
  marginLeft: 'ml',
  marginRight: 'mr',
  marginTop: 'mt',
  marginBottom: 'mb',
  margin: 'm',
  marginBlock: 'my',
  marginBlockEnd: 'mb',
  marginBlockStart: 'mt',
  marginInline: 'mx',
  marginInlineEnd: 'me',
  marginInlineStart: 'ms',
  outlineWidth: 'ring',
  outlineColor: 'ring',
  outline: 'ring',
  outlineOffset: 'ring',
  divideX: 'divide-x',
  divideY: 'divide-y',
  divideColor: 'divide',
  divideStyle: 'divide',
  width: 'w',
  inlineSize: 'w',
  minWidth: 'min-w',
  minInlineSize: 'min-w',
  maxWidth: 'max-w',
  maxInlineSize: 'max-w',
  height: 'h',
  blockSize: 'h',
  minHeight: 'min-h',
  minBlockSize: 'min-h',
  maxHeight: 'max-h',
  maxBlockSize: 'max-b',
  color: 'text',
  fontFamily: 'font',
  fontSize: 'fs',
  fontWeight: 'font',
  fontSmoothing: 'smoothing',
  fontVariantNumeric: 'numeric',
  letterSpacing: 'tracking',
  lineHeight: 'leading',
  textAlign: 'text',
  textDecoration: 'text-decor',
  textDecorationColor: 'text-decor',
  textEmphasisColor: 'text-emphasis',
  textDecorationStyle: 'decoration',
  textDecorationThickness: 'decoration',
  textUnderlineOffset: 'underline-offset',
  textTransform: 'text',
  textIndent: 'indent',
  textShadow: 'text-shadow',
  textOverflow: 'text',
  verticalAlign: 'align',
  wordBreak: 'break',
  textWrap: 'text',
  truncate: 'truncate',
  lineClamp: 'clamp',
  listStyleType: 'list',
  listStylePosition: 'list',
  listStyleImage: 'list-img',
  backgroundPosition: 'bg',
  backgroundPositionX: 'bg-x',
  backgroundPositionY: 'bg-y',
  backgroundAttachment: 'bg',
  backgroundClip: 'bg-clip',
  background: 'bg',
  backgroundColor: 'bg',
  backgroundOrigin: 'bg-origin',
  backgroundImage: 'bg-img',
  backgroundRepeat: 'bg-repeat',
  backgroundBlendMode: 'bg-blend',
  backgroundSize: 'bg',
  backgroundGradient: 'bg-gradient',
  textGradient: 'text-gradient',
  gradientFrom: 'from',
  gradientTo: 'to',
  gradientVia: 'via',
  borderRadius: 'rounded',
  borderTopLeftRadius: 'rounded-tl',
  borderTopRightRadius: 'rounded-tr',
  borderBottomRightRadius: 'rounded-br',
  borderBottomLeftRadius: 'rounded-bl',
  borderTopRadius: 'rounded-t',
  borderRightRadius: 'rounded-r',
  borderBottomRadius: 'rounded-b',
  borderLeftRadius: 'rounded-l',
  borderStartStartRadius: 'rounded-ss',
  borderStartEndRadius: 'rounded-se',
  borderStartRadius: 'rounded-s',
  borderEndStartRadius: 'rounded-es',
  borderEndEndRadius: 'rounded-ee',
  borderEndRadius: 'rounded-e',
  border: 'border',
  borderColor: 'border',
  borderInline: 'border-x',
  borderInlineWidth: 'border-x',
  borderInlineColor: 'border-x',
  borderBlock: 'border-y',
  borderBlockWidth: 'border-y',
  borderBlockColor: 'border-y',
  borderLeft: 'border-l',
  borderLeftColor: 'border-l',
  borderInlineStart: 'border-s',
  borderInlineStartColor: 'border-s',
  borderRight: 'border-r',
  borderRightColor: 'border-r',
  borderInlineEnd: 'border-e',
  borderInlineEndColor: 'border-e',
  borderTop: 'border-t',
  borderTopColor: 'border-t',
  borderBottom: 'border-b',
  borderBottomColor: 'border-b',
  borderBlockEnd: 'border-be',
  borderBlockEndColor: 'border-be',
  borderBlockStart: 'border-bs',
  borderBlockStartColor: 'border-bs',
  boxShadow: 'shadow',
  boxShadowColor: 'shadow',
  mixBlendMode: 'mix-blend',
  filter: 'filter',
  brightness: 'brightness',
  contrast: 'contrast',
  grayscale: 'grayscale',
  hueRotate: 'hue-rotate',
  invert: 'invert',
  saturate: 'saturate',
  sepia: 'sepia',
  dropShadow: 'drop-shadow',
  blur: 'blur',
  backdropFilter: 'backdrop',
  backdropBlur: 'backdrop-blur',
  backdropBrightness: 'backdrop-brightness',
  backdropContrast: 'backdrop-contrast',
  backdropGrayscale: 'backdrop-grayscale',
  backdropHueRotate: 'backdrop-hue-rotate',
  backdropInvert: 'backdrop-invert',
  backdropOpacity: 'backdrop-opacity',
  backdropSaturate: 'backdrop-saturate',
  backdropSepia: 'backdrop-sepia',
  borderCollapse: 'border',
  borderSpacing: 'border-spacing',
  borderSpacingX: 'border-spacing-x',
  borderSpacingY: 'border-spacing-y',
  tableLayout: 'table',
  transitionTimingFunction: 'ease',
  transitionDelay: 'delay',
  transitionDuration: 'duration',
  transitionProperty: 'transition',
  animation: 'animation',
  animationDelay: 'animation-delay',
  transformOrigin: 'origin',
  scale: 'scale',
  scaleX: 'scale-x',
  scaleY: 'scale-y',
  translate: 'translate',
  translateX: 'translate-x',
  translateY: 'translate-y',
  accentColor: 'accent',
  caretColor: 'caret',
  scrollBehavior: 'scroll',
  scrollbar: 'scrollbar',
  scrollMargin: 'scroll-m',
  scrollMarginX: 'scroll-mx',
  scrollMarginY: 'scroll-my',
  scrollMarginLeft: 'scroll-ml',
  scrollMarginRight: 'scroll-mr',
  scrollMarginTop: 'scroll-mt',
  scrollMarginBottom: 'scroll-mb',
  scrollMarginBlock: 'scroll-my',
  scrollMarginBlockEnd: 'scroll-mb',
  scrollMarginBlockStart: 'scroll-mt',
  scrollMarginInline: 'scroll-mx',
  scrollMarginInlineEnd: 'scroll-me',
  scrollMarginInlineStart: 'scroll-ms',
  scrollPadding: 'scroll-p',
  scrollPaddingBlock: 'scroll-pb',
  scrollPaddingBlockStart: 'scroll-pt',
  scrollPaddingBlockEnd: 'scroll-pb',
  scrollPaddingInline: 'scroll-px',
  scrollPaddingInlineEnd: 'scroll-pe',
  scrollPaddingInlineStart: 'scroll-ps',
  scrollPaddingX: 'scroll-px',
  scrollPaddingY: 'scroll-py',
  scrollPaddingLeft: 'scroll-pl',
  scrollPaddingRight: 'scroll-pr',
  scrollPaddingTop: 'scroll-pt',
  scrollPaddingBottom: 'scroll-pb',
  scrollSnapAlign: 'snap',
  scrollSnapStop: 'snap',
  scrollSnapType: 'snap',
  scrollSnapStrictness: 'strictness',
  scrollSnapMargin: 'snap-m',
  scrollSnapMarginTop: 'snap-mt',
  scrollSnapMarginBottom: 'snap-mb',
  scrollSnapMarginLeft: 'snap-ml',
  scrollSnapMarginRight: 'snap-mr',
  touchAction: 'touch',
  userSelect: 'select',
  fill: 'fill',
  stroke: 'stroke',
  srOnly: 'sr',
  debug: 'debug',
  textStyle: 'textStyle'
};
const shorthands = {
  pos: 'position',
  insetEnd: 'insetInlineEnd',
  end: 'insetInlineEnd',
  insetStart: 'insetInlineStart',
  start: 'insetInlineStart',
  flexDir: 'flexDirection',
  p: 'padding',
  pl: 'paddingLeft',
  pr: 'paddingRight',
  pt: 'paddingTop',
  pb: 'paddingBottom',
  py: 'paddingBlock',
  paddingY: 'paddingBlock',
  paddingX: 'paddingInline',
  px: 'paddingInline',
  pe: 'paddingInlineEnd',
  paddingEnd: 'paddingInlineEnd',
  ps: 'paddingInlineStart',
  paddingStart: 'paddingInlineStart',
  ml: 'marginLeft',
  mr: 'marginRight',
  mt: 'marginTop',
  mb: 'marginBottom',
  m: 'margin',
  my: 'marginBlock',
  marginY: 'marginBlock',
  mx: 'marginInline',
  marginX: 'marginInline',
  me: 'marginInlineEnd',
  marginEnd: 'marginInlineEnd',
  ms: 'marginInlineStart',
  marginStart: 'marginInlineStart',
  ringWidth: 'outlineWidth',
  ringColor: 'outlineColor',
  ring: 'outline',
  ringOffset: 'outlineOffset',
  w: 'width',
  minW: 'minWidth',
  maxW: 'maxWidth',
  h: 'height',
  minH: 'minHeight',
  maxH: 'maxHeight',
  bgPosition: 'backgroundPosition',
  bgPositionX: 'backgroundPositionX',
  bgPositionY: 'backgroundPositionY',
  bgAttachment: 'backgroundAttachment',
  bgClip: 'backgroundClip',
  bg: 'background',
  bgColor: 'backgroundColor',
  bgOrigin: 'backgroundOrigin',
  bgImage: 'backgroundImage',
  bgRepeat: 'backgroundRepeat',
  bgBlendMode: 'backgroundBlendMode',
  bgSize: 'backgroundSize',
  bgGradient: 'backgroundGradient',
  rounded: 'borderRadius',
  roundedTopLeft: 'borderTopLeftRadius',
  roundedTopRight: 'borderTopRightRadius',
  roundedBottomRight: 'borderBottomRightRadius',
  roundedBottomLeft: 'borderBottomLeftRadius',
  roundedTop: 'borderTopRadius',
  roundedRight: 'borderRightRadius',
  roundedBottom: 'borderBottomRadius',
  roundedLeft: 'borderLeftRadius',
  roundedStartStart: 'borderStartStartRadius',
  roundedStartEnd: 'borderStartEndRadius',
  roundedStart: 'borderStartRadius',
  roundedEndStart: 'borderEndStartRadius',
  roundedEndEnd: 'borderEndEndRadius',
  roundedEnd: 'borderEndRadius',
  borderX: 'borderInline',
  borderXWidth: 'borderInlineWidth',
  borderXColor: 'borderInlineColor',
  borderY: 'borderBlock',
  borderYWidth: 'borderBlockWidth',
  borderYColor: 'borderBlockColor',
  borderStart: 'borderInlineStart',
  borderStartColor: 'borderInlineStartColor',
  borderEnd: 'borderInlineEnd',
  borderEndColor: 'borderInlineEndColor',
  shadow: 'boxShadow',
  shadowColor: 'boxShadowColor',
  x: 'translateX',
  y: 'translateY'
};
const breakpointKeys = ['base', 'sm', 'md', 'lg', 'xl', '2xl'];
const hasShorthand = true;
const resolveShorthand = prop => shorthands[prop] || prop;
function transform(prop, value) {
  const key = resolveShorthand(prop);
  const propKey = classNameMap[key] || hypenateProperty(key);
  const className = `${propKey}_${withoutSpace(value)}`;
  return {
    className
  };
}
const context = {
  hash: false,
  conditions: {
    shift: sortConditions,
    finalize: finalizeConditions,
    breakpoints: {
      keys: breakpointKeys
    }
  },
  utility: {
    prefix: undefined,
    transform,
    hasShorthand,
    resolveShorthand
  }
};
const css = createCss(context);
