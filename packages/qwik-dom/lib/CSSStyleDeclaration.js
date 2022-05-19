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

var cssProperties = {
  alignContent: 'align-content',
  alignItems: 'align-items',
  alignmentBaseline: 'alignment-baseline',
  alignSelf: 'align-self',
  animation: 'animation',
  animationDelay: 'animation-delay',
  animationDirection: 'animation-direction',
  animationDuration: 'animation-duration',
  animationFillMode: 'animation-fill-mode',
  animationIterationCount: 'animation-iteration-count',
  animationName: 'animation-name',
  animationPlayState: 'animation-play-state',
  animationTimingFunction: 'animation-timing-function',
  backfaceVisibility: 'backface-visibility',
  background: 'background',
  backgroundAttachment: 'background-attachment',
  backgroundClip: 'background-clip',
  backgroundColor: 'background-color',
  backgroundImage: 'background-image',
  backgroundOrigin: 'background-origin',
  backgroundPosition: 'background-position',
  backgroundPositionX: 'background-position-x',
  backgroundPositionY: 'background-position-y',
  backgroundRepeat: 'background-repeat',
  backgroundSize: 'background-size',
  baselineShift: 'baseline-shift',
  border: 'border',
  borderBottom: 'border-bottom',
  borderBottomColor: 'border-bottom-color',
  borderBottomLeftRadius: 'border-bottom-left-radius',
  borderBottomRightRadius: 'border-bottom-right-radius',
  borderBottomStyle: 'border-bottom-style',
  borderBottomWidth: 'border-bottom-width',
  borderCollapse: 'border-collapse',
  borderColor: 'border-color',
  borderImage: 'border-image',
  borderImageOutset: 'border-image-outset',
  borderImageRepeat: 'border-image-repeat',
  borderImageSlice: 'border-image-slice',
  borderImageSource: 'border-image-source',
  borderImageWidth: 'border-image-width',
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
  captionSide: 'caption-side',
  clear: 'clear',
  clip: 'clip',
  clipPath: 'clip-path',
  clipRule: 'clip-rule',
  color: 'color',
  colorInterpolationFilters: 'color-interpolation-filters',
  columnCount: 'column-count',
  columnFill: 'column-fill',
  columnGap: 'column-gap',
  columnRule: 'column-rule',
  columnRuleColor: 'column-rule-color',
  columnRuleStyle: 'column-rule-style',
  columnRuleWidth: 'column-rule-width',
  columns: 'columns',
  columnSpan: 'column-span',
  columnWidth: 'column-width',
  content: 'content',
  counterIncrement: 'counter-increment',
  counterReset: 'counter-reset',
  cssFloat: 'float',
  cursor: 'cursor',
  direction: 'direction',
  display: 'display',
  dominantBaseline: 'dominant-baseline',
  emptyCells: 'empty-cells',
  enableBackground: 'enable-background',
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
  floodColor: 'flood-color',
  floodOpacity: 'flood-opacity',
  font: 'font',
  fontFamily: 'font-family',
  fontFeatureSettings: 'font-feature-settings',
  fontSize: 'font-size',
  fontSizeAdjust: 'font-size-adjust',
  fontStretch: 'font-stretch',
  fontStyle: 'font-style',
  fontVariant: 'font-variant',
  fontWeight: 'font-weight',
  glyphOrientationHorizontal: 'glyph-orientation-horizontal',
  glyphOrientationVertical: 'glyph-orientation-vertical',
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
  imeMode: 'ime-mode',
  justifyContent: 'justify-content',
  kerning: 'kerning',
  layoutGrid: 'layout-grid',
  layoutGridChar: 'layout-grid-char',
  layoutGridLine: 'layout-grid-line',
  layoutGridMode: 'layout-grid-mode',
  layoutGridType: 'layout-grid-type',
  left: 'left',
  letterSpacing: 'letter-spacing',
  lightingColor: 'lighting-color',
  lineBreak: 'line-break',
  lineHeight: 'line-height',
  listStyle: 'list-style',
  listStyleImage: 'list-style-image',
  listStylePosition: 'list-style-position',
  listStyleType: 'list-style-type',
  margin: 'margin',
  marginBottom: 'margin-bottom',
  marginLeft: 'margin-left',
  marginRight: 'margin-right',
  marginTop: 'margin-top',
  marker: 'marker',
  markerEnd: 'marker-end',
  markerMid: 'marker-mid',
  markerStart: 'marker-start',
  mask: 'mask',
  maxHeight: 'max-height',
  maxWidth: 'max-width',
  minHeight: 'min-height',
  minWidth: 'min-width',
  msContentZoomChaining: '-ms-content-zoom-chaining',
  msContentZooming: '-ms-content-zooming',
  msContentZoomLimit: '-ms-content-zoom-limit',
  msContentZoomLimitMax: '-ms-content-zoom-limit-max',
  msContentZoomLimitMin: '-ms-content-zoom-limit-min',
  msContentZoomSnap: '-ms-content-zoom-snap',
  msContentZoomSnapPoints: '-ms-content-zoom-snap-points',
  msContentZoomSnapType: '-ms-content-zoom-snap-type',
  msFlowFrom: '-ms-flow-from',
  msFlowInto: '-ms-flow-into',
  msFontFeatureSettings: '-ms-font-feature-settings',
  msGridColumn: '-ms-grid-column',
  msGridColumnAlign: '-ms-grid-column-align',
  msGridColumns: '-ms-grid-columns',
  msGridColumnSpan: '-ms-grid-column-span',
  msGridRow: '-ms-grid-row',
  msGridRowAlign: '-ms-grid-row-align',
  msGridRows: '-ms-grid-rows',
  msGridRowSpan: '-ms-grid-row-span',
  msHighContrastAdjust: '-ms-high-contrast-adjust',
  msHyphenateLimitChars: '-ms-hyphenate-limit-chars',
  msHyphenateLimitLines: '-ms-hyphenate-limit-lines',
  msHyphenateLimitZone: '-ms-hyphenate-limit-zone',
  msHyphens: '-ms-hyphens',
  msImeAlign: '-ms-ime-align',
  msOverflowStyle: '-ms-overflow-style',
  msScrollChaining: '-ms-scroll-chaining',
  msScrollLimit: '-ms-scroll-limit',
  msScrollLimitXMax: '-ms-scroll-limit-x-max',
  msScrollLimitXMin: '-ms-scroll-limit-x-min',
  msScrollLimitYMax: '-ms-scroll-limit-y-max',
  msScrollLimitYMin: '-ms-scroll-limit-y-min',
  msScrollRails: '-ms-scroll-rails',
  msScrollSnapPointsX: '-ms-scroll-snap-points-x',
  msScrollSnapPointsY: '-ms-scroll-snap-points-y',
  msScrollSnapType: '-ms-scroll-snap-type',
  msScrollSnapX: '-ms-scroll-snap-x',
  msScrollSnapY: '-ms-scroll-snap-y',
  msScrollTranslation: '-ms-scroll-translation',
  msTextCombineHorizontal: '-ms-text-combine-horizontal',
  msTextSizeAdjust: '-ms-text-size-adjust',
  msTouchAction: '-ms-touch-action',
  msTouchSelect: '-ms-touch-select',
  msUserSelect: '-ms-user-select',
  msWrapFlow: '-ms-wrap-flow',
  msWrapMargin: '-ms-wrap-margin',
  msWrapThrough: '-ms-wrap-through',
  opacity: 'opacity',
  order: 'order',
  orphans: 'orphans',
  outline: 'outline',
  outlineColor: 'outline-color',
  outlineOffset: 'outline-offset',
  outlineStyle: 'outline-style',
  outlineWidth: 'outline-width',
  overflow: 'overflow',
  overflowX: 'overflow-x',
  overflowY: 'overflow-y',
  padding: 'padding',
  paddingBottom: 'padding-bottom',
  paddingLeft: 'padding-left',
  paddingRight: 'padding-right',
  paddingTop: 'padding-top',
  page: 'page',
  pageBreakAfter: 'page-break-after',
  pageBreakBefore: 'page-break-before',
  pageBreakInside: 'page-break-inside',
  perspective: 'perspective',
  perspectiveOrigin: 'perspective-origin',
  pointerEvents: 'pointer-events',
  position: 'position',
  quotes: 'quotes',
  right: 'right',
  rotate: 'rotate',
  rubyAlign: 'ruby-align',
  rubyOverhang: 'ruby-overhang',
  rubyPosition: 'ruby-position',
  scale: 'scale',
  size: 'size',
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
  tableLayout: 'table-layout',
  textAlign: 'text-align',
  textAlignLast: 'text-align-last',
  textAnchor: 'text-anchor',
  textDecoration: 'text-decoration',
  textIndent: 'text-indent',
  textJustify: 'text-justify',
  textKashida: 'text-kashida',
  textKashidaSpace: 'text-kashida-space',
  textOverflow: 'text-overflow',
  textShadow: 'text-shadow',
  textTransform: 'text-transform',
  textUnderlinePosition: 'text-underline-position',
  top: 'top',
  touchAction: 'touch-action',
  transform: 'transform',
  transformOrigin: 'transform-origin',
  transformStyle: 'transform-style',
  transition: 'transition',
  transitionDelay: 'transition-delay',
  transitionDuration: 'transition-duration',
  transitionProperty: 'transition-property',
  transitionTimingFunction: 'transition-timing-function',
  translate: 'translate',
  unicodeBidi: 'unicode-bidi',
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
  webkitAnimationTimingFunction: '-webkit-animation-timing-funciton',
  webkitAppearance: '-webkit-appearance',
  webkitBackfaceVisibility: '-webkit-backface-visibility',
  webkitBackgroundClip: '-webkit-background-clip',
  webkitBackgroundOrigin: '-webkit-background-origin',
  webkitBackgroundSize: '-webkit-background-size',
  webkitBorderBottomLeftRadius: '-webkit-border-bottom-left-radius',
  webkitBorderBottomRightRadius: '-webkit-border-bottom-right-radius',
  webkitBorderImage: '-webkit-border-image',
  webkitBorderRadius: '-webkit-border-radius',
  webkitBorderTopLeftRadius: '-webkit-border-top-left-radius',
  webkitBorderTopRightRadius: '-webkit-border-top-right-radius',
  webkitBoxAlign: '-webkit-box-align',
  webkitBoxDirection: '-webkit-box-direction',
  webkitBoxFlex: '-webkit-box-flex',
  webkitBoxOrdinalGroup: '-webkit-box-ordinal-group',
  webkitBoxOrient: '-webkit-box-orient',
  webkitBoxPack: '-webkit-box-pack',
  webkitBoxSizing: '-webkit-box-sizing',
  webkitColumnBreakAfter: '-webkit-column-break-after',
  webkitColumnBreakBefore: '-webkit-column-break-before',
  webkitColumnBreakInside: '-webkit-column-break-inside',
  webkitColumnCount: '-webkit-column-count',
  webkitColumnGap: '-webkit-column-gap',
  webkitColumnRule: '-webkit-column-rule',
  webkitColumnRuleColor: '-webkit-column-rule-color',
  webkitColumnRuleStyle: '-webkit-column-rule-style',
  webkitColumnRuleWidth: '-webkit-column-rule-width',
  webkitColumns: '-webkit-columns',
  webkitColumnSpan: '-webkit-column-span',
  webkitColumnWidth: '-webkit-column-width',
  webkitFilter: '-webkit-filter',
  webkitFlex: '-webkit-flex',
  webkitFlexBasis: '-webkit-flex-basis',
  webkitFlexDirection: '-webkit-flex-direction',
  webkitFlexFlow: '-webkit-flex-flow',
  webkitFlexGrow: '-webkit-flex-grow',
  webkitFlexShrink: '-webkit-flex-shrink',
  webkitFlexWrap: '-webkit-flex-wrap',
  webkitJustifyContent: '-webkit-justify-content',
  webkitOrder: '-webkit-order',
  webkitPerspective: '-webkit-perspective-origin',
  webkitPerspectiveOrigin: '-webkit-perspective-origin',
  webkitTapHighlightColor: '-webkit-tap-highlight-color',
  webkitTextFillColor: '-webkit-text-fill-color',
  webkitTextSizeAdjust: '-webkit-text-size-adjust',
  webkitTextStroke: '-webkit-text-stroke',
  webkitTextStrokeColor: '-webkit-text-stroke-color',
  webkitTextStrokeWidth: '-webkit-text-stroke-width',
  webkitTransform: '-webkit-transform',
  webkitTransformOrigin: '-webkit-transform-origin',
  webkitTransformStyle: '-webkit-transform-style',
  webkitTransition: '-webkit-transition',
  webkitTransitionDelay: '-webkit-transition-delay',
  webkitTransitionDuration: '-webkit-transition-duration',
  webkitTransitionProperty: '-webkit-transition-property',
  webkitTransitionTimingFunction: '-webkit-transition-timing-function',
  webkitUserModify: '-webkit-user-modify',
  webkitUserSelect: '-webkit-user-select',
  webkitWritingMode: '-webkit-writing-mode',
  whiteSpace: 'white-space',
  widows: 'widows',
  width: 'width',
  wordBreak: 'word-break',
  wordSpacing: 'word-spacing',
  wordWrap: 'word-wrap',
  writingMode: 'writing-mode',
  zIndex: 'z-index',
  zoom: 'zoom',
  resize: 'resize',
  userSelect: 'user-select',
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
