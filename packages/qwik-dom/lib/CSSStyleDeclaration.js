'use strict';
var parserlib = require('./cssparser');

module.exports = CSSStyleDeclaration;

function CSSStyleDeclaration(elt) {
  this._element = elt;
}

// Utility function for parsing style declarations
// Pass in a string like "margin-left: 5px; border-style: solid"
// and this function returns an object like
// {"margin-left":"5px", "border-style":"solid"}
function parseStyles(s) {
  var parser = new parserlib.css.Parser();
  var result = { property: Object.create(null), priority: Object.create(null) };
  parser.addListener('property', function (e) {
    if (e.invalid) return; // Skip errors
    result.property[e.property.text] = e.value.text;
    if (e.important) result.priority[e.property.text] = 'important';
  });
  s = ('' + s).replace(/^;/, '');
  parser.parseStyleAttribute(s);
  return result;
}

var NO_CHANGE = {}; // Private marker object

CSSStyleDeclaration.prototype = Object.create(Object.prototype, {
  // Return the parsed form of the element's style attribute.
  // If the element's style attribute has never been parsed
  // or if it has changed since the last parse, then reparse it
  // Note that the styles don't get parsed until they're actually needed
  _parsed: {
    get: function () {
      if (!this._parsedStyles || this.cssText !== this._lastParsedText) {
        var text = this.cssText;
        this._parsedStyles = parseStyles(text);
        this._lastParsedText = text;
        delete this._names;
      }
      return this._parsedStyles;
    },
  },

  // Call this method any time the parsed representation of the
  // style changes.  It converts the style properties to a string and
  // sets cssText and the element's style attribute
  _serialize: {
    value: function () {
      var styles = this._parsed;
      var s = '';

      for (var name in styles.property) {
        if (s) s += ' ';
        s += name + ': ' + styles.property[name];
        if (styles.priority[name]) {
          s += ' !' + styles.priority[name];
        }
        s += ';';
      }

      this.cssText = s; // also sets the style attribute
      this._lastParsedText = s; // so we don't reparse
      delete this._names;
    },
  },

  cssText: {
    get: function () {
      // XXX: this is a CSSStyleDeclaration for an element.
      // A different impl might be necessary for a set of styles
      // associated returned by getComputedStyle(), e.g.
      return this._element.getAttribute('style');
    },
    set: function (value) {
      // XXX: I should parse and serialize the value to
      // normalize it and remove errors. FF and chrome do that.
      this._element.setAttribute('style', value);
    },
  },

  length: {
    get: function () {
      if (!this._names) this._names = Object.getOwnPropertyNames(this._parsed.property);
      return this._names.length;
    },
  },

  item: {
    value: function (n) {
      if (!this._names) this._names = Object.getOwnPropertyNames(this._parsed.property);
      return this._names[n];
    },
  },

  getPropertyValue: {
    value: function (property) {
      property = property.toLowerCase();
      return this._parsed.property[property] || '';
    },
  },

  getPropertyPriority: {
    value: function (property) {
      property = property.toLowerCase();
      return this._parsed.priority[property] || '';
    },
  },

  setProperty: {
    value: function (property, value, priority) {
      property = property.toLowerCase();
      if (value === null || value === undefined) {
        value = '';
      }
      if (priority === null || priority === undefined) {
        priority = '';
      }

      // String coercion
      if (value !== NO_CHANGE) {
        value = '' + value;
      }

      if (value === '') {
        this.removeProperty(property);
        return;
      }

      if (priority !== '' && priority !== NO_CHANGE && !/^important$/i.test(priority)) {
        return;
      }

      var styles = this._parsed;
      if (value === NO_CHANGE) {
        if (!styles.property[property]) {
          return; // Not a valid property name.
        }
        if (priority !== '') {
          styles.priority[property] = 'important';
        } else {
          delete styles.priority[property];
        }
      } else {
        // We don't just accept the property value.  Instead
        // we parse it to ensure that it is something valid.
        // If it contains a semicolon it is invalid
        if (value.indexOf(';') !== -1) return;

        var newprops = parseStyles(property + ':' + value);
        if (Object.getOwnPropertyNames(newprops.property).length === 0) {
          return; // no valid property found
        }
        if (Object.getOwnPropertyNames(newprops.priority).length !== 0) {
          return; // if the value included '!important' it wasn't valid.
        }

        // XXX handle shorthand properties

        for (var p in newprops.property) {
          styles.property[p] = newprops.property[p];
          if (priority === NO_CHANGE) {
            continue;
          } else if (priority !== '') {
            styles.priority[p] = 'important';
          } else if (styles.priority[p]) {
            delete styles.priority[p];
          }
        }
      }

      // Serialize and update cssText and element.style!
      this._serialize();
    },
  },

  setPropertyValue: {
    value: function (property, value) {
      return this.setProperty(property, value, NO_CHANGE);
    },
  },

  setPropertyPriority: {
    value: function (property, priority) {
      return this.setProperty(property, NO_CHANGE, priority);
    },
  },

  removeProperty: {
    value: function (property) {
      property = property.toLowerCase();
      var styles = this._parsed;
      if (property in styles.property) {
        delete styles.property[property];
        delete styles.priority[property];

        // Serialize and update cssText and element.style!
        this._serialize();
      }
    },
  },
});

const cssProperties = {
  accentColor: 'accent-color',
  additiveSymbols: 'additive-symbols',
  alignContent: 'align-content',
  alignItems: 'align-items',
  alignSelf: 'align-self',
  alignmentBaseline: 'alignment-baseline',
  all: 'all',
  animation: 'animation',
  animationDelay: 'animation-delay',
  animationDirection: 'animation-direction',
  animationDuration: 'animation-duration',
  animationFillMode: 'animation-fill-mode',
  animationIterationCount: 'animation-iteration-count',
  animationName: 'animation-name',
  animationPlayState: 'animation-play-state',
  animationTimingFunction: 'animation-timing-function',
  appRegion: 'app-region',
  appearance: 'appearance',
  ascentOverride: 'ascent-override',
  aspectRatio: 'aspect-ratio',
  backdropFilter: 'backdrop-filter',
  backfaceVisibility: 'backface-visibility',
  background: 'background',
  backgroundAttachment: 'background-attachment',
  backgroundBlendMode: 'background-blend-mode',
  backgroundClip: 'background-clip',
  backgroundColor: 'background-color',
  backgroundImage: 'background-image',
  backgroundOrigin: 'background-origin',
  backgroundPosition: 'background-position',
  backgroundPositionX: 'background-position-x',
  backgroundPositionY: 'background-position-y',
  backgroundRepeat: 'background-repeat',
  backgroundRepeatX: 'background-repeat-x',
  backgroundRepeatY: 'background-repeat-y',
  backgroundSize: 'background-size',
  basePalette: 'base-palette',
  baselineShift: 'baseline-shift',
  blockSize: 'block-size',
  border: 'border',
  borderBlock: 'border-block',
  borderBlockColor: 'border-block-color',
  borderBlockEnd: 'border-block-end',
  borderBlockEndColor: 'border-block-end-color',
  borderBlockEndStyle: 'border-block-end-style',
  borderBlockEndWidth: 'border-block-end-width',
  borderBlockStart: 'border-block-start',
  borderBlockStartColor: 'border-block-start-color',
  borderBlockStartStyle: 'border-block-start-style',
  borderBlockStartWidth: 'border-block-start-width',
  borderBlockStyle: 'border-block-style',
  borderBlockWidth: 'border-block-width',
  borderBottom: 'border-bottom',
  borderBottomColor: 'border-bottom-color',
  borderBottomLeftRadius: 'border-bottom-left-radius',
  borderBottomRightRadius: 'border-bottom-right-radius',
  borderBottomStyle: 'border-bottom-style',
  borderBottomWidth: 'border-bottom-width',
  borderCollapse: 'border-collapse',
  borderColor: 'border-color',
  borderEndEndRadius: 'border-end-end-radius',
  borderEndStartRadius: 'border-end-start-radius',
  borderImage: 'border-image',
  borderImageOutset: 'border-image-outset',
  borderImageRepeat: 'border-image-repeat',
  borderImageSlice: 'border-image-slice',
  borderImageSource: 'border-image-source',
  borderImageWidth: 'border-image-width',
  borderInline: 'border-inline',
  borderInlineColor: 'border-inline-color',
  borderInlineEnd: 'border-inline-end',
  borderInlineEndColor: 'border-inline-end-color',
  borderInlineEndStyle: 'border-inline-end-style',
  borderInlineEndWidth: 'border-inline-end-width',
  borderInlineStart: 'border-inline-start',
  borderInlineStartColor: 'border-inline-start-color',
  borderInlineStartStyle: 'border-inline-start-style',
  borderInlineStartWidth: 'border-inline-start-width',
  borderInlineStyle: 'border-inline-style',
  borderInlineWidth: 'border-inline-width',
  borderLeft: 'border-left',
  borderLeftColor: 'border-left-color',
  borderLeftStyle: 'border-left-style',
  borderLeftWidth: 'border-left-width',
  borderRadius: 'border-radius',
  borderRight: 'border-right',
  borderRightColor: 'border-right-color',
  borderRightStyle: 'border-right-style',
  borderRightWidth: 'border-right-width',
  borderSpacing: 'border-spacing',
  borderStartEndRadius: 'border-start-end-radius',
  borderStartStartRadius: 'border-start-start-radius',
  borderStyle: 'border-style',
  borderTop: 'border-top',
  borderTopColor: 'border-top-color',
  borderTopLeftRadius: 'border-top-left-radius',
  borderTopRightRadius: 'border-top-right-radius',
  borderTopStyle: 'border-top-style',
  borderTopWidth: 'border-top-width',
  borderWidth: 'border-width',
  bottom: 'bottom',
  boxShadow: 'box-shadow',
  boxSizing: 'box-sizing',
  breakAfter: 'break-after',
  breakBefore: 'break-before',
  breakInside: 'break-inside',
  bufferedRendering: 'buffered-rendering',
  captionSide: 'caption-side',
  caretColor: 'caret-color',
  clear: 'clear',
  clip: 'clip',
  clipPath: 'clip-path',
  clipRule: 'clip-rule',
  color: 'color',
  colorInterpolation: 'color-interpolation',
  colorInterpolationFilters: 'color-interpolation-filters',
  colorRendering: 'color-rendering',
  colorScheme: 'color-scheme',
  columnCount: 'column-count',
  columnFill: 'column-fill',
  columnGap: 'column-gap',
  columnRule: 'column-rule',
  columnRuleColor: 'column-rule-color',
  columnRuleStyle: 'column-rule-style',
  columnRuleWidth: 'column-rule-width',
  columnSpan: 'column-span',
  columnWidth: 'column-width',
  columns: 'columns',
  contain: 'contain',
  containIntrinsicBlockSize: 'contain-intrinsic-block-size',
  containIntrinsicHeight: 'contain-intrinsic-height',
  containIntrinsicInlineSize: 'contain-intrinsic-inline-size',
  containIntrinsicSize: 'contain-intrinsic-size',
  containIntrinsicWidth: 'contain-intrinsic-width',
  container: 'container',
  containerName: 'container-name',
  containerType: 'container-type',
  content: 'content',
  contentVisibility: 'content-visibility',
  counterIncrement: 'counter-increment',
  counterReset: 'counter-reset',
  counterSet: 'counter-set',
  cursor: 'cursor',
  cx: 'cx',
  cy: 'cy',
  d: 'd',
  descentOverride: 'descent-override',
  direction: 'direction',
  display: 'display',
  dominantBaseline: 'dominant-baseline',
  emptyCells: 'empty-cells',
  fallback: 'fallback',
  fill: 'fill',
  fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule',
  filter: 'filter',
  flex: 'flex',
  flexBasis: 'flex-basis',
  flexDirection: 'flex-direction',
  flexFlow: 'flex-flow',
  flexGrow: 'flex-grow',
  flexShrink: 'flex-shrink',
  flexWrap: 'flex-wrap',
  float: 'float',
  floodColor: 'flood-color',
  floodOpacity: 'flood-opacity',
  font: 'font',
  fontDisplay: 'font-display',
  fontFamily: 'font-family',
  fontFeatureSettings: 'font-feature-settings',
  fontKerning: 'font-kerning',
  fontOpticalSizing: 'font-optical-sizing',
  fontPalette: 'font-palette',
  fontSize: 'font-size',
  fontStretch: 'font-stretch',
  fontStyle: 'font-style',
  fontSynthesis: 'font-synthesis',
  fontSynthesisSmallCaps: 'font-synthesis-small-caps',
  fontSynthesisStyle: 'font-synthesis-style',
  fontSynthesisWeight: 'font-synthesis-weight',
  fontVariant: 'font-variant',
  fontVariantCaps: 'font-variant-caps',
  fontVariantEastAsian: 'font-variant-east-asian',
  fontVariantLigatures: 'font-variant-ligatures',
  fontVariantNumeric: 'font-variant-numeric',
  fontVariationSettings: 'font-variation-settings',
  fontWeight: 'font-weight',
  forcedColorAdjust: 'forced-color-adjust',
  gap: 'gap',
  grid: 'grid',
  gridArea: 'grid-area',
  gridAutoColumns: 'grid-auto-columns',
  gridAutoFlow: 'grid-auto-flow',
  gridAutoRows: 'grid-auto-rows',
  gridColumn: 'grid-column',
  gridColumnEnd: 'grid-column-end',
  gridColumnGap: 'grid-column-gap',
  gridColumnStart: 'grid-column-start',
  gridGap: 'grid-gap',
  gridRow: 'grid-row',
  gridRowEnd: 'grid-row-end',
  gridRowGap: 'grid-row-gap',
  gridRowStart: 'grid-row-start',
  gridTemplate: 'grid-template',
  gridTemplateAreas: 'grid-template-areas',
  gridTemplateColumns: 'grid-template-columns',
  gridTemplateRows: 'grid-template-rows',
  height: 'height',
  hyphenateCharacter: 'hyphenate-character',
  hyphenateLimitChars: 'hyphenate-limit-chars',
  hyphens: 'hyphens',
  imageOrientation: 'image-orientation',
  imageRendering: 'image-rendering',
  inherits: 'inherits',
  initialLetter: 'initial-letter',
  initialValue: 'initial-value',
  inlineSize: 'inline-size',
  inset: 'inset',
  insetBlock: 'inset-block',
  insetBlockEnd: 'inset-block-end',
  insetBlockStart: 'inset-block-start',
  insetInline: 'inset-inline',
  insetInlineEnd: 'inset-inline-end',
  insetInlineStart: 'inset-inline-start',
  isolation: 'isolation',
  justifyContent: 'justify-content',
  justifyItems: 'justify-items',
  justifySelf: 'justify-self',
  left: 'left',
  letterSpacing: 'letter-spacing',
  lightingColor: 'lighting-color',
  lineBreak: 'line-break',
  lineGapOverride: 'line-gap-override',
  lineHeight: 'line-height',
  listStyle: 'list-style',
  listStyleImage: 'list-style-image',
  listStylePosition: 'list-style-position',
  listStyleType: 'list-style-type',
  margin: 'margin',
  marginBlock: 'margin-block',
  marginBlockEnd: 'margin-block-end',
  marginBlockStart: 'margin-block-start',
  marginBottom: 'margin-bottom',
  marginInline: 'margin-inline',
  marginInlineEnd: 'margin-inline-end',
  marginInlineStart: 'margin-inline-start',
  marginLeft: 'margin-left',
  marginRight: 'margin-right',
  marginTop: 'margin-top',
  marker: 'marker',
  markerEnd: 'marker-end',
  markerMid: 'marker-mid',
  markerStart: 'marker-start',
  mask: 'mask',
  maskType: 'mask-type',
  mathDepth: 'math-depth',
  mathShift: 'math-shift',
  mathStyle: 'math-style',
  maxBlockSize: 'max-block-size',
  maxHeight: 'max-height',
  maxInlineSize: 'max-inline-size',
  maxWidth: 'max-width',
  minBlockSize: 'min-block-size',
  minHeight: 'min-height',
  minInlineSize: 'min-inline-size',
  minWidth: 'min-width',
  mixBlendMode: 'mix-blend-mode',
  negative: 'negative',
  objectFit: 'object-fit',
  objectPosition: 'object-position',
  objectViewBox: 'object-view-box',
  offset: 'offset',
  offsetDistance: 'offset-distance',
  offsetPath: 'offset-path',
  offsetRotate: 'offset-rotate',
  opacity: 'opacity',
  order: 'order',
  orphans: 'orphans',
  outline: 'outline',
  outlineColor: 'outline-color',
  outlineOffset: 'outline-offset',
  outlineStyle: 'outline-style',
  outlineWidth: 'outline-width',
  overflow: 'overflow',
  overflowAnchor: 'overflow-anchor',
  overflowClipMargin: 'overflow-clip-margin',
  overflowWrap: 'overflow-wrap',
  overflowX: 'overflow-x',
  overflowY: 'overflow-y',
  overrideColors: 'override-colors',
  overscrollBehavior: 'overscroll-behavior',
  overscrollBehaviorBlock: 'overscroll-behavior-block',
  overscrollBehaviorInline: 'overscroll-behavior-inline',
  overscrollBehaviorX: 'overscroll-behavior-x',
  overscrollBehaviorY: 'overscroll-behavior-y',
  pad: 'pad',
  padding: 'padding',
  paddingBlock: 'padding-block',
  paddingBlockEnd: 'padding-block-end',
  paddingBlockStart: 'padding-block-start',
  paddingBottom: 'padding-bottom',
  paddingInline: 'padding-inline',
  paddingInlineEnd: 'padding-inline-end',
  paddingInlineStart: 'padding-inline-start',
  paddingLeft: 'padding-left',
  paddingRight: 'padding-right',
  paddingTop: 'padding-top',
  page: 'page',
  pageBreakAfter: 'page-break-after',
  pageBreakBefore: 'page-break-before',
  pageBreakInside: 'page-break-inside',
  pageOrientation: 'page-orientation',
  paintOrder: 'paint-order',
  perspective: 'perspective',
  perspectiveOrigin: 'perspective-origin',
  placeContent: 'place-content',
  placeItems: 'place-items',
  placeSelf: 'place-self',
  pointerEvents: 'pointer-events',
  position: 'position',
  prefix: 'prefix',
  quotes: 'quotes',
  r: 'r',
  range: 'range',
  resize: 'resize',
  right: 'right',
  rotate: 'rotate',
  rowGap: 'row-gap',
  rubyPosition: 'ruby-position',
  rx: 'rx',
  ry: 'ry',
  scale: 'scale',
  scrollBehavior: 'scroll-behavior',
  scrollMargin: 'scroll-margin',
  scrollMarginBlock: 'scroll-margin-block',
  scrollMarginBlockEnd: 'scroll-margin-block-end',
  scrollMarginBlockStart: 'scroll-margin-block-start',
  scrollMarginBottom: 'scroll-margin-bottom',
  scrollMarginInline: 'scroll-margin-inline',
  scrollMarginInlineEnd: 'scroll-margin-inline-end',
  scrollMarginInlineStart: 'scroll-margin-inline-start',
  scrollMarginLeft: 'scroll-margin-left',
  scrollMarginRight: 'scroll-margin-right',
  scrollMarginTop: 'scroll-margin-top',
  scrollPadding: 'scroll-padding',
  scrollPaddingBlock: 'scroll-padding-block',
  scrollPaddingBlockEnd: 'scroll-padding-block-end',
  scrollPaddingBlockStart: 'scroll-padding-block-start',
  scrollPaddingBottom: 'scroll-padding-bottom',
  scrollPaddingInline: 'scroll-padding-inline',
  scrollPaddingInlineEnd: 'scroll-padding-inline-end',
  scrollPaddingInlineStart: 'scroll-padding-inline-start',
  scrollPaddingLeft: 'scroll-padding-left',
  scrollPaddingRight: 'scroll-padding-right',
  scrollPaddingTop: 'scroll-padding-top',
  scrollSnapAlign: 'scroll-snap-align',
  scrollSnapStop: 'scroll-snap-stop',
  scrollSnapType: 'scroll-snap-type',
  scrollbarGutter: 'scrollbar-gutter',
  shapeImageThreshold: 'shape-image-threshold',
  shapeMargin: 'shape-margin',
  shapeOutside: 'shape-outside',
  shapeRendering: 'shape-rendering',
  size: 'size',
  sizeAdjust: 'size-adjust',
  speak: 'speak',
  speakAs: 'speak-as',
  src: 'src',
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
  stroke: 'stroke',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeMiterlimit: 'stroke-miterlimit',
  strokeOpacity: 'stroke-opacity',
  strokeWidth: 'stroke-width',
  suffix: 'suffix',
  symbols: 'symbols',
  syntax: 'syntax',
  system: 'system',
  tabSize: 'tab-size',
  tableLayout: 'table-layout',
  textAlign: 'text-align',
  textAlignLast: 'text-align-last',
  textAnchor: 'text-anchor',
  textCombineUpright: 'text-combine-upright',
  textDecoration: 'text-decoration',
  textDecorationColor: 'text-decoration-color',
  textDecorationLine: 'text-decoration-line',
  textDecorationSkipInk: 'text-decoration-skip-ink',
  textDecorationStyle: 'text-decoration-style',
  textDecorationThickness: 'text-decoration-thickness',
  textEmphasis: 'text-emphasis',
  textEmphasisColor: 'text-emphasis-color',
  textEmphasisPosition: 'text-emphasis-position',
  textEmphasisStyle: 'text-emphasis-style',
  textIndent: 'text-indent',
  textOrientation: 'text-orientation',
  textOverflow: 'text-overflow',
  textRendering: 'text-rendering',
  textShadow: 'text-shadow',
  textSizeAdjust: 'text-size-adjust',
  textTransform: 'text-transform',
  textUnderlineOffset: 'text-underline-offset',
  textUnderlinePosition: 'text-underline-position',
  top: 'top',
  touchAction: 'touch-action',
  transform: 'transform',
  transformBox: 'transform-box',
  transformOrigin: 'transform-origin',
  transformStyle: 'transform-style',
  transition: 'transition',
  transitionDelay: 'transition-delay',
  transitionDuration: 'transition-duration',
  transitionProperty: 'transition-property',
  transitionTimingFunction: 'transition-timing-function',
  translate: 'translate',
  unicodeBidi: 'unicode-bidi',
  unicodeRange: 'unicode-range',
  userSelect: 'user-select',
  vectorEffect: 'vector-effect',
  verticalAlign: 'vertical-align',
  visibility: 'visibility',
  webkitAlignContent: '-webkit-align-content',
  webkitAlignItems: '-webkit-align-items',
  webkitAlignSelf: '-webkit-align-self',
  webkitAnimation: '-webkit-animation',
  webkitAnimationDelay: '-webkit-animation-delay',
  webkitAnimationDirection: '-webkit-animation-direction',
  webkitAnimationDuration: '-webkit-animation-duration',
  webkitAnimationFillMode: '-webkit-animation-fill-mode',
  webkitAnimationIterationCount: '-webkit-animation-iteration-count',
  webkitAnimationName: '-webkit-animation-name',
  webkitAnimationPlayState: '-webkit-animation-play-state',
  webkitAnimationTimingFunction: '-webkit-animation-timing-function',
  webkitAppRegion: '-webkit-app-region',
  webkitAppearance: '-webkit-appearance',
  webkitBackfaceVisibility: '-webkit-backface-visibility',
  webkitBackgroundClip: '-webkit-background-clip',
  webkitBackgroundOrigin: '-webkit-background-origin',
  webkitBackgroundSize: '-webkit-background-size',
  webkitBorderAfter: '-webkit-border-after',
  webkitBorderAfterColor: '-webkit-border-after-color',
  webkitBorderAfterStyle: '-webkit-border-after-style',
  webkitBorderAfterWidth: '-webkit-border-after-width',
  webkitBorderBefore: '-webkit-border-before',
  webkitBorderBeforeColor: '-webkit-border-before-color',
  webkitBorderBeforeStyle: '-webkit-border-before-style',
  webkitBorderBeforeWidth: '-webkit-border-before-width',
  webkitBorderBottomLeftRadius: '-webkit-border-bottom-left-radius',
  webkitBorderBottomRightRadius: '-webkit-border-bottom-right-radius',
  webkitBorderEnd: '-webkit-border-end',
  webkitBorderEndColor: '-webkit-border-end-color',
  webkitBorderEndStyle: '-webkit-border-end-style',
  webkitBorderEndWidth: '-webkit-border-end-width',
  webkitBorderHorizontalSpacing: '-webkit-border-horizontal-spacing',
  webkitBorderImage: '-webkit-border-image',
  webkitBorderRadius: '-webkit-border-radius',
  webkitBorderStart: '-webkit-border-start',
  webkitBorderStartColor: '-webkit-border-start-color',
  webkitBorderStartStyle: '-webkit-border-start-style',
  webkitBorderStartWidth: '-webkit-border-start-width',
  webkitBorderTopLeftRadius: '-webkit-border-top-left-radius',
  webkitBorderTopRightRadius: '-webkit-border-top-right-radius',
  webkitBorderVerticalSpacing: '-webkit-border-vertical-spacing',
  webkitBoxAlign: '-webkit-box-align',
  webkitBoxDecorationBreak: '-webkit-box-decoration-break',
  webkitBoxDirection: '-webkit-box-direction',
  webkitBoxFlex: '-webkit-box-flex',
  webkitBoxOrdinalGroup: '-webkit-box-ordinal-group',
  webkitBoxOrient: '-webkit-box-orient',
  webkitBoxPack: '-webkit-box-pack',
  webkitBoxReflect: '-webkit-box-reflect',
  webkitBoxShadow: '-webkit-box-shadow',
  webkitBoxSizing: '-webkit-box-sizing',
  webkitClipPath: '-webkit-clip-path',
  webkitColumnBreakAfter: '-webkit-column-break-after',
  webkitColumnBreakBefore: '-webkit-column-break-before',
  webkitColumnBreakInside: '-webkit-column-break-inside',
  webkitColumnCount: '-webkit-column-count',
  webkitColumnGap: '-webkit-column-gap',
  webkitColumnRule: '-webkit-column-rule',
  webkitColumnRuleColor: '-webkit-column-rule-color',
  webkitColumnRuleStyle: '-webkit-column-rule-style',
  webkitColumnRuleWidth: '-webkit-column-rule-width',
  webkitColumnSpan: '-webkit-column-span',
  webkitColumnWidth: '-webkit-column-width',
  webkitColumns: '-webkit-columns',
  webkitFilter: '-webkit-filter',
  webkitFlex: '-webkit-flex',
  webkitFlexBasis: '-webkit-flex-basis',
  webkitFlexDirection: '-webkit-flex-direction',
  webkitFlexFlow: '-webkit-flex-flow',
  webkitFlexGrow: '-webkit-flex-grow',
  webkitFlexShrink: '-webkit-flex-shrink',
  webkitFlexWrap: '-webkit-flex-wrap',
  webkitFontFeatureSettings: '-webkit-font-feature-settings',
  webkitFontSmoothing: '-webkit-font-smoothing',
  webkitHighlight: '-webkit-highlight',
  webkitHyphenateCharacter: '-webkit-hyphenate-character',
  webkitJustifyContent: '-webkit-justify-content',
  webkitLineBreak: '-webkit-line-break',
  webkitLineClamp: '-webkit-line-clamp',
  webkitLocale: '-webkit-locale',
  webkitLogicalHeight: '-webkit-logical-height',
  webkitLogicalWidth: '-webkit-logical-width',
  webkitMarginAfter: '-webkit-margin-after',
  webkitMarginBefore: '-webkit-margin-before',
  webkitMarginEnd: '-webkit-margin-end',
  webkitMarginStart: '-webkit-margin-start',
  webkitMask: '-webkit-mask',
  webkitMaskBoxImage: '-webkit-mask-box-image',
  webkitMaskBoxImageOutset: '-webkit-mask-box-image-outset',
  webkitMaskBoxImageRepeat: '-webkit-mask-box-image-repeat',
  webkitMaskBoxImageSlice: '-webkit-mask-box-image-slice',
  webkitMaskBoxImageSource: '-webkit-mask-box-image-source',
  webkitMaskBoxImageWidth: '-webkit-mask-box-image-width',
  webkitMaskClip: '-webkit-mask-clip',
  webkitMaskComposite: '-webkit-mask-composite',
  webkitMaskImage: '-webkit-mask-image',
  webkitMaskOrigin: '-webkit-mask-origin',
  webkitMaskPosition: '-webkit-mask-position',
  webkitMaskPositionX: '-webkit-mask-position-x',
  webkitMaskPositionY: '-webkit-mask-position-y',
  webkitMaskRepeat: '-webkit-mask-repeat',
  webkitMaskRepeatX: '-webkit-mask-repeat-x',
  webkitMaskRepeatY: '-webkit-mask-repeat-y',
  webkitMaskSize: '-webkit-mask-size',
  webkitMaxLogicalHeight: '-webkit-max-logical-height',
  webkitMaxLogicalWidth: '-webkit-max-logical-width',
  webkitMinLogicalHeight: '-webkit-min-logical-height',
  webkitMinLogicalWidth: '-webkit-min-logical-width',
  webkitOpacity: '-webkit-opacity',
  webkitOrder: '-webkit-order',
  webkitPaddingAfter: '-webkit-padding-after',
  webkitPaddingBefore: '-webkit-padding-before',
  webkitPaddingEnd: '-webkit-padding-end',
  webkitPaddingStart: '-webkit-padding-start',
  webkitPerspective: '-webkit-perspective',
  webkitPerspectiveOrigin: '-webkit-perspective-origin',
  webkitPerspectiveOriginX: '-webkit-perspective-origin-x',
  webkitPerspectiveOriginY: '-webkit-perspective-origin-y',
  webkitPrintColorAdjust: '-webkit-print-color-adjust',
  webkitRtlOrdering: '-webkit-rtl-ordering',
  webkitRubyPosition: '-webkit-ruby-position',
  webkitShapeImageThreshold: '-webkit-shape-image-threshold',
  webkitShapeMargin: '-webkit-shape-margin',
  webkitShapeOutside: '-webkit-shape-outside',
  webkitTapHighlightColor: '-webkit-tap-highlight-color',
  webkitTextCombine: '-webkit-text-combine',
  webkitTextDecorationsInEffect: '-webkit-text-decorations-in-effect',
  webkitTextEmphasis: '-webkit-text-emphasis',
  webkitTextEmphasisColor: '-webkit-text-emphasis-color',
  webkitTextEmphasisPosition: '-webkit-text-emphasis-position',
  webkitTextEmphasisStyle: '-webkit-text-emphasis-style',
  webkitTextFillColor: '-webkit-text-fill-color',
  webkitTextOrientation: '-webkit-text-orientation',
  webkitTextSecurity: '-webkit-text-security',
  webkitTextSizeAdjust: '-webkit-text-size-adjust',
  webkitTextStroke: '-webkit-text-stroke',
  webkitTextStrokeColor: '-webkit-text-stroke-color',
  webkitTextStrokeWidth: '-webkit-text-stroke-width',
  webkitTransform: '-webkit-transform',
  webkitTransformOrigin: '-webkit-transform-origin',
  webkitTransformOriginX: '-webkit-transform-origin-x',
  webkitTransformOriginY: '-webkit-transform-origin-y',
  webkitTransformOriginZ: '-webkit-transform-origin-z',
  webkitTransformStyle: '-webkit-transform-style',
  webkitTransition: '-webkit-transition',
  webkitTransitionDelay: '-webkit-transition-delay',
  webkitTransitionDuration: '-webkit-transition-duration',
  webkitTransitionProperty: '-webkit-transition-property',
  webkitTransitionTimingFunction: '-webkit-transition-timing-function',
  webkitUserDrag: '-webkit-user-drag',
  webkitUserModify: '-webkit-user-modify',
  webkitUserSelect: '-webkit-user-select',
  webkitWritingMode: '-webkit-writing-mode',
  whiteSpace: 'white-space',
  widows: 'widows',
  width: 'width',
  willChange: 'will-change',
  wordBreak: 'word-break',
  wordSpacing: 'word-spacing',
  wordWrap: 'word-wrap',
  writingMode: 'writing-mode',
  x: 'x',
  y: 'y',
  zIndex: 'z-index',
  zoom: 'zoom',
};

for (var prop in cssProperties) defineStyleProperty(prop);

function defineStyleProperty(jsname) {
  var cssname = cssProperties[jsname];
  Object.defineProperty(CSSStyleDeclaration.prototype, jsname, {
    get: function () {
      return this.getPropertyValue(cssname);
    },
    set: function (value) {
      this.setProperty(cssname, value);
    },
  });

  if (!CSSStyleDeclaration.prototype.hasOwnProperty(cssname)) {
    Object.defineProperty(CSSStyleDeclaration.prototype, cssname, {
      get: function () {
        return this.getPropertyValue(cssname);
      },
      set: function (value) {
        this.setProperty(cssname, value);
      },
    });
  }
}
