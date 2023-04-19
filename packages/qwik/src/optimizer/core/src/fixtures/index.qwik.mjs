import {
  componentQrl,
  inlinedQrl,
  useStylesScopedQrl,
  _wrapSignal,
  _IMMUTABLE,
  createContext,
  useLexicalScope,
  useContextProvider,
  useStore,
  useContext,
  Slot,
  Fragment as Fragment$1,
  useTaskQrl,
  useRef,
  useClientEffectQrl,
  useCleanupQrl,
} from '@builder.io/qwik';
import { jsx, Fragment, jsxs } from '@builder.io/qwik/jsx-runtime';
const Button = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    useStylesScopedQrl(inlinedQrl(STYLES$3, 'Button_component_useStylesScoped_a1JZ0Q0Q2Oc'));
    return /* @__PURE__ */ jsx(
      Fragment,
      {
        children: props.link
          ? /* @__PURE__ */ jsx('a', {
              role: 'button',
              ...props.attributes,
              get href() {
                return props.link;
              },
              target: props.openLinkInNewTab ? '_blank' : void 0,
              children: _wrapSignal(props, 'text'),
              [_IMMUTABLE]: {
                href: _wrapSignal(props, 'link'),
              },
            })
          : /* @__PURE__ */ jsx('button', {
              class: 'button-Button',
              ...props.attributes,
              children: _wrapSignal(props, 'text'),
            }),
        [_IMMUTABLE]: {
          children: false,
        },
      },
      'jc_0'
    );
  }, 'Button_component_gJoMUICXoUQ')
);
const STYLES$3 = `
.button-Button {
  all: unset;
}`;
const builderContext = createContext('Builder');
const TARGET = 'qwik';
function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}
function isIframe() {
  return isBrowser() && window.self !== window.top;
}
function isEditing() {
  return isIframe() && window.location.search.indexOf('builder.frameEditing=') !== -1;
}
const fastClone = (obj) => JSON.parse(JSON.stringify(obj));
const SIZES = {
  small: {
    min: 320,
    default: 321,
    max: 640,
  },
  medium: {
    min: 641,
    default: 642,
    max: 991,
  },
  large: {
    min: 990,
    default: 991,
    max: 1200,
  },
};
const getMaxWidthQueryForSize = (size, sizeValues = SIZES) =>
  `@media (max-width: ${sizeValues[size].max}px)`;
const getSizesForBreakpoints = ({ small, medium }) => {
  const newSizes = fastClone(SIZES);
  if (!small || !medium) return newSizes;
  const smallMin = Math.floor(small / 2);
  newSizes.small = {
    max: small,
    min: smallMin,
    default: smallMin + 1,
  };
  const mediumMin = newSizes.small.max + 1;
  newSizes.medium = {
    max: medium,
    min: mediumMin,
    default: mediumMin + 1,
  };
  const largeMin = newSizes.medium.max + 1;
  newSizes.large = {
    max: 2e3,
    min: largeMin,
    default: largeMin + 1,
  };
  return newSizes;
};
function evaluate({ code, context, state, event, isExpression = true }) {
  if (code === '') {
    console.warn('Skipping evaluation of empty code block.');
    return;
  }
  const builder = {
    isEditing: isEditing(),
    isBrowser: isBrowser(),
    isServer: !isBrowser(),
  };
  const useReturn =
    isExpression &&
    !(code.includes(';') || code.includes(' return ') || code.trim().startsWith('return '));
  const useCode = useReturn ? `return (${code});` : code;
  try {
    return new Function('builder', 'Builder', 'state', 'context', 'event', useCode)(
      builder,
      builder,
      state,
      context,
      event
    );
  } catch (e) {
    console.warn('Builder custom code error: \n While Evaluating: \n ', useCode, '\n', e);
  }
}
const set = (obj, _path, value) => {
  if (Object(obj) !== obj) return obj;
  const path = Array.isArray(_path) ? _path : _path.toString().match(/[^.[\]]+/g);
  path
    .slice(0, -1)
    .reduce(
      (a, c, i) =>
        Object(a[c]) === a[c]
          ? a[c]
          : (a[c] = Math.abs(Number(path[i + 1])) >> 0 === +path[i + 1] ? [] : {}),
      obj
    )[path[path.length - 1]] = value;
  return obj;
};
function transformBlock(block) {
  return block;
}
const evaluateBindings = ({ block, context, state }) => {
  if (!block.bindings) return block;
  const copy = fastClone(block);
  const copied = {
    ...copy,
    properties: {
      ...copy.properties,
    },
    actions: {
      ...copy.actions,
    },
  };
  for (const binding in block.bindings) {
    const expression = block.bindings[binding];
    const value = evaluate({
      code: expression,
      state,
      context,
    });
    set(copied, binding, value);
  }
  return copied;
};
function getProcessedBlock({ block, context, shouldEvaluateBindings, state }) {
  const transformedBlock = transformBlock(block);
  if (shouldEvaluateBindings)
    return evaluateBindings({
      block: transformedBlock,
      state,
      context,
    });
  else return transformedBlock;
}
const camelToKebabCase = (string) =>
  string.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
const checkIsDefined = (maybeT) => maybeT !== null && maybeT !== void 0;
const convertStyleMapToCSSArray = (style) => {
  const cssProps = Object.entries(style).map(([key, value]) => {
    if (typeof value === 'string') return `${camelToKebabCase(key)}: ${value};`;
    else return void 0;
  });
  return cssProps.filter(checkIsDefined);
};
const convertStyleMapToCSS = (style) => convertStyleMapToCSSArray(style).join('\n');
const createCssClass = ({ mediaQuery, className: className3, styles }) => {
  const cssClass = `.${className3} {
    ${convertStyleMapToCSS(styles)}
  }`;
  if (mediaQuery)
    return `${mediaQuery} {
      ${cssClass}
    }`;
  else return cssClass;
};
const tag$1 = function tag2(props, state) {
  return 'style';
};
const RenderInlinedStyles = (props) => {
  const state = {};
  state.tag = tag$1();
  return /* @__PURE__ */ jsx(
    Fragment,
    {
      children: /* @__PURE__ */ jsx('style', {
        get dangerouslySetInnerHTML() {
          return props.styles;
        },
        [_IMMUTABLE]: {
          dangerouslySetInnerHTML: _wrapSignal(props, 'styles'),
        },
      }),
      [_IMMUTABLE]: {
        children: false,
      },
    },
    'zz_0'
  );
};
const useBlock$1 = function useBlock2(props, state) {
  return getProcessedBlock({
    block: props.block,
    state: props.context.state,
    context: props.context.context,
    shouldEvaluateBindings: true,
  });
};
const canShowBlock$1 = function canShowBlock2(props, state) {
  if (checkIsDefined(useBlock$1(props).hide)) return !useBlock$1(props).hide;
  if (checkIsDefined(useBlock$1(props).show)) return useBlock$1(props).show;
  return true;
};
const css = function css2(props, state) {
  const styles = useBlock$1(props).responsiveStyles;
  const content = props.context.content;
  const sizesWithUpdatedBreakpoints = getSizesForBreakpoints(content?.meta?.breakpoints || {});
  const largeStyles = styles?.large;
  const mediumStyles = styles?.medium;
  const smallStyles = styles?.small;
  const className3 = useBlock$1(props).id;
  const largeStylesClass = largeStyles
    ? createCssClass({
        className: className3,
        styles: largeStyles,
      })
    : '';
  const mediumStylesClass = mediumStyles
    ? createCssClass({
        className: className3,
        styles: mediumStyles,
        mediaQuery: getMaxWidthQueryForSize('medium', sizesWithUpdatedBreakpoints),
      })
    : '';
  const smallStylesClass = smallStyles
    ? createCssClass({
        className: className3,
        styles: smallStyles,
        mediaQuery: getMaxWidthQueryForSize('small', sizesWithUpdatedBreakpoints),
      })
    : '';
  return [largeStylesClass, mediumStylesClass, smallStylesClass].join(' ');
};
const BlockStyles = (props) => {
  return /* @__PURE__ */ jsx(
    Fragment,
    {
      children:
        css(props) && canShowBlock$1(props)
          ? /* @__PURE__ */ jsx(
              RenderInlinedStyles,
              {
                styles: css(props),
              },
              'LQ_0'
            )
          : null,
      [_IMMUTABLE]: {
        children: false,
      },
    },
    'LQ_1'
  );
};
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
const getEventHandlerName = (key) => `on${capitalizeFirstLetter(key)}$`;
function createEventHandler(value, options) {
  return inlinedQrl(
    (event) => {
      const [options2, value2] = useLexicalScope();
      return evaluate({
        code: value2,
        context: options2.context,
        state: options2.state,
        event,
      });
    },
    'createEventHandler_7wCAiJVliNE',
    [options, value]
  );
}
function getBlockActions(options) {
  const obj = {};
  const optionActions = options.block.actions ?? {};
  for (const key in optionActions) {
    if (!optionActions.hasOwnProperty(key)) continue;
    const value = optionActions[key];
    obj[getEventHandlerName(key)] = createEventHandler(value, options);
  }
  return obj;
}
function getBlockComponentOptions(block) {
  return {
    ...block.component?.options,
    ...block.options,
    builderBlock: block,
  };
}
function transformBlockProperties(properties) {
  return properties;
}
function getBlockProperties(block) {
  const properties = {
    ...block.properties,
    'builder-id': block.id,
    style: getStyleAttribute(block.style),
    class: [block.id, 'builder-block', block.class, block.properties?.class]
      .filter(Boolean)
      .join(' '),
  };
  return transformBlockProperties(properties);
}
function getStyleAttribute(style) {
  if (!style) return void 0;
  switch (TARGET) {
    case 'svelte':
    case 'vue2':
    case 'vue3':
    case 'solid':
      return convertStyleMapToCSSArray(style).join(' ');
    case 'qwik':
    case 'reactNative':
    case 'react':
      return style;
  }
}
function getBlockTag(block) {
  return block.tagName || 'div';
}
const EMPTY_HTML_ELEMENTS = [
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
];
const isEmptyHtmlElement = (tagName) => {
  return typeof tagName === 'string' && EMPTY_HTML_ELEMENTS.includes(tagName.toLowerCase());
};
const getComponent = ({ block, context }) => {
  const componentName = getProcessedBlock({
    block,
    state: context.state,
    context: context.context,
    shouldEvaluateBindings: false,
  }).component?.name;
  if (!componentName) return null;
  const ref = context.registeredComponents[componentName];
  if (!ref) {
    console.warn(`
      Could not find a registered component named "${componentName}".
      If you registered it, is the file that registered it imported by the file that needs to render it?`);
    return void 0;
  } else return ref;
};
const getRepeatItemData = ({ block, context }) => {
  const { repeat, ...blockWithoutRepeat } = block;
  if (!repeat?.collection) return void 0;
  const itemsArray = evaluate({
    code: repeat.collection,
    state: context.state,
    context: context.context,
  });
  if (!Array.isArray(itemsArray)) return void 0;
  const collectionName = repeat.collection.split('.').pop();
  const itemNameToUse = repeat.itemName || (collectionName ? collectionName + 'Item' : 'item');
  const repeatArray = itemsArray.map((item, index) => ({
    context: {
      ...context,
      state: {
        ...context.state,
        $index: index,
        $item: item,
        [itemNameToUse]: item,
        [`$${itemNameToUse}Index`]: index,
      },
    },
    block: blockWithoutRepeat,
  }));
  return repeatArray;
};
const RenderComponent = (props) => {
  return /* @__PURE__ */ jsx(
    Fragment,
    {
      children: props.componentRef
        ? /* @__PURE__ */ jsxs(props.componentRef, {
            ...props.componentOptions,
            children: [
              (props.blockChildren || []).map(function (child) {
                return /* @__PURE__ */ jsx(
                  RenderBlock$1,
                  {
                    block: child,
                    get context() {
                      return props.context;
                    },
                    [_IMMUTABLE]: {
                      context: _wrapSignal(props, 'context'),
                    },
                  },
                  'render-block-' + child.id
                );
              }),
              (props.blockChildren || []).map(function (child) {
                return /* @__PURE__ */ jsx(
                  BlockStyles,
                  {
                    block: child,
                    get context() {
                      return props.context;
                    },
                    [_IMMUTABLE]: {
                      context: _wrapSignal(props, 'context'),
                    },
                  },
                  'block-style-' + child.id
                );
              }),
            ],
          })
        : null,
      [_IMMUTABLE]: {
        children: false,
      },
    },
    'R9_0'
  );
};
const RenderRepeatedBlock = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    useContextProvider(
      builderContext,
      useStore({
        content: props.repeatContext.content,
        state: props.repeatContext.state,
        context: props.repeatContext.context,
        apiKey: props.repeatContext.apiKey,
        registeredComponents: props.repeatContext.registeredComponents,
        inheritedStyles: props.repeatContext.inheritedStyles,
      })
    );
    return /* @__PURE__ */ jsx(
      RenderBlock$1,
      {
        get block() {
          return props.block;
        },
        get context() {
          return props.repeatContext;
        },
        [_IMMUTABLE]: {
          block: _wrapSignal(props, 'block'),
          context: _wrapSignal(props, 'repeatContext'),
        },
      },
      'K5_0'
    );
  }, 'RenderRepeatedBlock_component_nRyVBtbGKc8')
);
const component = function component2(props, state) {
  return getComponent({
    block: props.block,
    context: props.context,
  });
};
const tag = function tag22(props, state) {
  return getBlockTag(useBlock(props));
};
const useBlock = function useBlock22(props, state) {
  return repeatItemData(props)
    ? props.block
    : getProcessedBlock({
        block: props.block,
        state: props.context.state,
        context: props.context.context,
        shouldEvaluateBindings: true,
      });
};
const canShowBlock = function canShowBlock22(props, state) {
  if (checkIsDefined(useBlock(props).hide)) return !useBlock(props).hide;
  if (checkIsDefined(useBlock(props).show)) return useBlock(props).show;
  return true;
};
const proxyState = function proxyState2(props, state) {
  if (typeof Proxy === 'undefined') {
    console.error('no Proxy available in this environment, cannot proxy state.');
    return props.context.state;
  }
  const useState = new Proxy(props.context.state, {
    set: (obj, prop, value) => {
      obj[prop] = value;
      props.context.setState?.(obj);
      return true;
    },
  });
  return useState;
};
const actions = function actions2(props, state) {
  return getBlockActions({
    block: useBlock(props),
    state: proxyState(props),
    context: props.context.context,
  });
};
const attributes = function attributes2(props, state) {
  const blockProperties = getBlockProperties(useBlock(props));
  return {
    ...blockProperties,
    ...{},
  };
};
const renderComponentProps = function renderComponentProps2(props, state) {
  return {
    blockChildren: useBlock(props).children ?? [],
    componentRef: component(props)?.component,
    componentOptions: {
      ...getBlockComponentOptions(useBlock(props)),
      ...(!component(props)?.noWrap
        ? {}
        : {
            attributes: {
              ...attributes(props),
              ...actions(props),
            },
          }),
    },
    context: childrenContext(props),
  };
};
const childrenWithoutParentComponent = function childrenWithoutParentComponent2(props, state) {
  const shouldRenderChildrenOutsideRef = !component(props)?.component && !repeatItemData(props);
  return shouldRenderChildrenOutsideRef ? useBlock(props).children ?? [] : [];
};
const repeatItemData = function repeatItemData2(props, state) {
  return getRepeatItemData({
    block: props.block,
    context: props.context,
  });
};
const childrenContext = function childrenContext2(props, state) {
  const getInheritedTextStyles = () => {
    return {};
  };
  return {
    apiKey: props.context.apiKey,
    state: props.context.state,
    content: props.context.content,
    context: props.context.context,
    setState: props.context.setState,
    registeredComponents: props.context.registeredComponents,
    inheritedStyles: getInheritedTextStyles(),
  };
};
const RenderBlock = (props) => {
  const state = {};
  state.tag = tag(props);
  return /* @__PURE__ */ jsx(
    Fragment,
    {
      children: canShowBlock(props)
        ? !component(props)?.noWrap
          ? /* @__PURE__ */ jsxs(
              Fragment,
              {
                children: [
                  isEmptyHtmlElement(tag(props))
                    ? /* @__PURE__ */ jsx(state.tag, {
                        ...attributes(props),
                        ...actions(props),
                      })
                    : null,
                  !isEmptyHtmlElement(tag(props)) && repeatItemData(props)
                    ? (repeatItemData(props) || []).map(function (data, index) {
                        return /* @__PURE__ */ jsx(
                          RenderRepeatedBlock,
                          {
                            get repeatContext() {
                              return data.context;
                            },
                            get block() {
                              return data.block;
                            },
                            [_IMMUTABLE]: {
                              repeatContext: _wrapSignal(data, 'context'),
                              block: _wrapSignal(data, 'block'),
                            },
                          },
                          index
                        );
                      })
                    : null,
                  !isEmptyHtmlElement(tag(props)) && !repeatItemData(props)
                    ? /* @__PURE__ */ jsxs(state.tag, {
                        ...attributes(props),
                        ...actions(props),
                        children: [
                          /* @__PURE__ */ jsx(
                            RenderComponent,
                            {
                              ...renderComponentProps(props),
                            },
                            '9d_0'
                          ),
                          (childrenWithoutParentComponent(props) || []).map(function (child) {
                            return /* @__PURE__ */ jsx(
                              RenderBlock,
                              {
                                block: child,
                                context: childrenContext(props),
                              },
                              'render-block-' + child.id
                            );
                          }),
                          (childrenWithoutParentComponent(props) || []).map(function (child) {
                            return /* @__PURE__ */ jsx(
                              BlockStyles,
                              {
                                block: child,
                                context: childrenContext(props),
                              },
                              'block-style-' + child.id
                            );
                          }),
                        ],
                      })
                    : null,
                ],
                [_IMMUTABLE]: {
                  children: false,
                },
              },
              '9d_1'
            )
          : /* @__PURE__ */ jsx(
              RenderComponent,
              {
                ...renderComponentProps(props),
              },
              '9d_2'
            )
        : null,
      [_IMMUTABLE]: {
        children: false,
      },
    },
    '9d_3'
  );
};
const RenderBlock$1 = RenderBlock;
const className$1 = function className2(props, state, builderContext2) {
  return 'builder-blocks' + (!props.blocks?.length ? ' no-blocks' : '');
};
const onClick$1 = function onClick2(props, state, builderContext2) {
  if (isEditing() && !props.blocks?.length)
    window.parent?.postMessage(
      {
        type: 'builder.clickEmptyBlocks',
        data: {
          parentElementId: props.parent,
          dataPath: props.path,
        },
      },
      '*'
    );
};
const onMouseEnter = function onMouseEnter2(props, state, builderContext2) {
  if (isEditing() && !props.blocks?.length)
    window.parent?.postMessage(
      {
        type: 'builder.hoverEmptyBlocks',
        data: {
          parentElementId: props.parent,
          dataPath: props.path,
        },
      },
      '*'
    );
};
const RenderBlocks = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    useStylesScopedQrl(inlinedQrl(STYLES$2, 'RenderBlocks_component_useStylesScoped_0XKYzaR059E'));
    const builderContext$1 = useContext(builderContext);
    const state = {};
    return /* @__PURE__ */ jsxs('div', {
      class: className$1(props) + ' div-RenderBlocks',
      get 'builder-path'() {
        return props.path;
      },
      get 'builder-parent-id'() {
        return props.parent;
      },
      get style() {
        return props.styleProp;
      },
      onClick$: inlinedQrl(
        (event) => {
          const [builderContext2, props2, state2] = useLexicalScope();
          return onClick$1(props2);
        },
        'RenderBlocks_component_div_onClick_RzhhZa265Yg',
        [builderContext$1, props, state]
      ),
      onMouseEnter$: inlinedQrl(
        (event) => {
          const [builderContext2, props2, state2] = useLexicalScope();
          return onMouseEnter(props2);
        },
        'RenderBlocks_component_div_onMouseEnter_nG7I7RYG3JQ',
        [builderContext$1, props, state]
      ),
      children: [
        props.blocks
          ? (props.blocks || []).map(function (block) {
              return /* @__PURE__ */ jsx(
                RenderBlock$1,
                {
                  block,
                  context: builderContext$1,
                },
                'render-block-' + block.id
              );
            })
          : null,
        props.blocks
          ? (props.blocks || []).map(function (block) {
              return /* @__PURE__ */ jsx(
                BlockStyles,
                {
                  block,
                  context: builderContext$1,
                },
                'block-style-' + block.id
              );
            })
          : null,
      ],
      [_IMMUTABLE]: {
        'builder-path': _wrapSignal(props, 'path'),
        'builder-parent-id': _wrapSignal(props, 'parent'),
        style: _wrapSignal(props, 'styleProp'),
        children: false,
      },
    });
  }, 'RenderBlocks_component_MYUZ0j1uLsw')
);
const STYLES$2 = `
.div-RenderBlocks {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}`;
const getGutterSize = function getGutterSize2(props, state, builderContext2) {
  return typeof props.space === 'number' ? props.space || 0 : 20;
};
const getColumns = function getColumns2(props, state, builderContext2) {
  return props.columns || [];
};
const getWidth = function getWidth2(props, state, builderContext2, index) {
  const columns = getColumns(props);
  return columns[index]?.width || 100 / columns.length;
};
const getColumnCssWidth = function getColumnCssWidth2(props, state, builderContext2, index) {
  const columns = getColumns(props);
  const gutterSize = getGutterSize(props);
  const subtractWidth = (gutterSize * (columns.length - 1)) / columns.length;
  return `calc(${getWidth(props, state, builderContext2, index)}% - ${subtractWidth}px)`;
};
const maybeApplyForTablet = function maybeApplyForTablet2(props, state, builderContext2, prop) {
  const _stackColumnsAt = props.stackColumnsAt || 'tablet';
  return _stackColumnsAt === 'tablet' ? prop : 'inherit';
};
const columnsCssVars = function columnsCssVars2(props, state, builderContext2) {
  const flexDir =
    props.stackColumnsAt === 'never'
      ? 'inherit'
      : props.reverseColumnsWhenStacked
      ? 'column-reverse'
      : 'column';
  return {
    '--flex-dir': flexDir,
    '--flex-dir-tablet': maybeApplyForTablet(props, state, builderContext2, flexDir),
  };
};
const columnCssVars = function columnCssVars2(props, state, builderContext2) {
  const width = '100%';
  const marginLeft = '0';
  return {
    '--column-width': width,
    '--column-margin-left': marginLeft,
    '--column-width-tablet': maybeApplyForTablet(props, state, builderContext2, width),
    '--column-margin-left-tablet': maybeApplyForTablet(props, state, builderContext2, marginLeft),
  };
};
const getWidthForBreakpointSize = function getWidthForBreakpointSize2(
  props,
  state,
  builderContext2,
  size
) {
  const breakpointSizes = getSizesForBreakpoints(builderContext2.content?.meta?.breakpoints || {});
  return breakpointSizes[size].max;
};
const columnStyleObjects = function columnStyleObjects2(props, state, builderContext2) {
  return {
    columns: {
      small: {
        flexDirection: 'var(--flex-dir)',
        alignItems: 'stretch',
      },
      medium: {
        flexDirection: 'var(--flex-dir-tablet)',
        alignItems: 'stretch',
      },
    },
    column: {
      small: {
        width: 'var(--column-width) !important',
        marginLeft: 'var(--column-margin-left) !important',
      },
      medium: {
        width: 'var(--column-width-tablet) !important',
        marginLeft: 'var(--column-margin-left-tablet) !important',
      },
    },
  };
};
const columnsStyles = function columnsStyles2(props, state, builderContext2) {
  return `
        @media (max-width: ${getWidthForBreakpointSize(
          props,
          state,
          builderContext2,
          'medium'
        )}px) {
          .${props.builderBlock.id}-breakpoints {
            ${convertStyleMapToCSS(columnStyleObjects().columns.medium)}
          }

          .${props.builderBlock.id}-breakpoints > .builder-column {
            ${convertStyleMapToCSS(columnStyleObjects().column.medium)}
          }
        }

        @media (max-width: ${getWidthForBreakpointSize(props, state, builderContext2, 'small')}px) {
          .${props.builderBlock.id}-breakpoints {
            ${convertStyleMapToCSS(columnStyleObjects().columns.small)}
          }

          .${props.builderBlock.id}-breakpoints > .builder-column {
            ${convertStyleMapToCSS(columnStyleObjects().column.small)}
          }
        },
      `;
};
const Columns = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    useStylesScopedQrl(inlinedQrl(STYLES$1, 'Columns_component_useStylesScoped_s7JLZz7MCCQ'));
    const builderContext$1 = useContext(builderContext);
    const state = {};
    return /* @__PURE__ */ jsxs('div', {
      class: `builder-columns ${props.builderBlock.id}-breakpoints div-Columns`,
      style: {
        ...{},
        ...columnsCssVars(props, state, builderContext$1),
      },
      children: [
        /* @__PURE__ */ jsx(
          RenderInlinedStyles,
          {
            styles: columnsStyles(props, state, builderContext$1),
          },
          'c0_0'
        ),
        (props.columns || []).map(function (column, index) {
          return /* @__PURE__ */ jsx(
            'div',
            {
              class: 'builder-column div-Columns-2',
              style: {
                width: getColumnCssWidth(props, state, builderContext$1, index),
                marginLeft: `${index === 0 ? 0 : getGutterSize(props)}px`,
                ...{},
                ...columnCssVars(props, state, builderContext$1),
              },
              children: /* @__PURE__ */ jsx(
                RenderBlocks,
                {
                  get blocks() {
                    return column.blocks;
                  },
                  path: `component.options.columns.${index}.blocks`,
                  get parent() {
                    return props.builderBlock.id;
                  },
                  styleProp: {
                    flexGrow: '1',
                  },
                  [_IMMUTABLE]: {
                    blocks: _wrapSignal(column, 'blocks'),
                    parent: _wrapSignal(props.builderBlock, 'id'),
                  },
                },
                'c0_1'
              ),
            },
            index
          );
        }),
      ],
      [_IMMUTABLE]: {
        children: false,
      },
    });
  }, 'Columns_component_7yLj4bxdI6c')
);
const STYLES$1 = `
.div-Columns {
  display: flex;
  line-height: normal;
}.div-Columns-2 {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}`;
const FragmentComponent = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    return /* @__PURE__ */ jsx('span', {
      children: /* @__PURE__ */ jsx(Slot, {}, 'oj_0'),
    });
  }, 'FragmentComponent_component_T0AypnadAK0')
);
function removeProtocol(path) {
  return path.replace(/http(s)?:/, '');
}
function updateQueryParam(uri = '', key, value) {
  const re = new RegExp('([?&])' + key + '=.*?(&|$)', 'i');
  const separator = uri.indexOf('?') !== -1 ? '&' : '?';
  if (uri.match(re)) return uri.replace(re, '$1' + key + '=' + encodeURIComponent(value) + '$2');
  return uri + separator + key + '=' + encodeURIComponent(value);
}
function getShopifyImageUrl(src, size) {
  if (!src || !src?.match(/cdn\.shopify\.com/) || !size) return src;
  if (size === 'master') return removeProtocol(src);
  const match = src.match(/(_\d+x(\d+)?)?(\.(jpg|jpeg|gif|png|bmp|bitmap|tiff|tif)(\?v=\d+)?)/i);
  if (match) {
    const prefix = src.split(match[0]);
    const suffix = match[3];
    const useSize = size.match('x') ? size : `${size}x`;
    return removeProtocol(`${prefix[0]}_${useSize}${suffix}`);
  }
  return null;
}
function getSrcSet(url) {
  if (!url) return url;
  const sizes = [100, 200, 400, 800, 1200, 1600, 2e3];
  if (url.match(/builder\.io/)) {
    let srcUrl = url;
    const widthInSrc = Number(url.split('?width=')[1]);
    if (!isNaN(widthInSrc)) srcUrl = `${srcUrl} ${widthInSrc}w`;
    return sizes
      .filter((size) => size !== widthInSrc)
      .map((size) => `${updateQueryParam(url, 'width', size)} ${size}w`)
      .concat([srcUrl])
      .join(', ');
  }
  if (url.match(/cdn\.shopify\.com/))
    return sizes
      .map((size) => [getShopifyImageUrl(url, `${size}x${size}`), size])
      .filter(([sizeUrl]) => !!sizeUrl)
      .map(([sizeUrl, size]) => `${sizeUrl} ${size}w`)
      .concat([url])
      .join(', ');
  return url;
}
const srcSetToUse = function srcSetToUse2(props, state) {
  const imageToUse = props.image || props.src;
  const url = imageToUse;
  if (!url || !(url.match(/builder\.io/) || url.match(/cdn\.shopify\.com/))) return props.srcset;
  if (props.srcset && props.image?.includes('builder.io/api/v1/image')) {
    if (!props.srcset.includes(props.image.split('?')[0])) {
      console.debug('Removed given srcset');
      return getSrcSet(url);
    }
  } else if (props.image && !props.srcset) return getSrcSet(url);
  return getSrcSet(url);
};
const webpSrcSet = function webpSrcSet2(props, state) {
  if (srcSetToUse(props)?.match(/builder\.io/) && !props.noWebp)
    return srcSetToUse(props).replace(/\?/g, '?format=webp&');
  else return '';
};
const aspectRatioCss = function aspectRatioCss2(props, state) {
  const aspectRatioStyles = {
    position: 'absolute',
    height: '100%',
    width: '100%',
    left: '0px',
    top: '0px',
  };
  const out = props.aspectRatio ? aspectRatioStyles : void 0;
  return out;
};
const Image = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    useStylesScopedQrl(inlinedQrl(STYLES, 'Image_component_useStylesScoped_fBMYiVf9fuU'));
    return /* @__PURE__ */ jsxs(
      Fragment$1,
      {
        children: [
          /* @__PURE__ */ jsxs('picture', {
            children: [
              webpSrcSet(props)
                ? /* @__PURE__ */ jsx('source', {
                    type: 'image/webp',
                    srcSet: webpSrcSet(props),
                  })
                : null,
              /* @__PURE__ */ jsx('img', {
                loading: 'lazy',
                get alt() {
                  return props.altText;
                },
                role: props.altText ? 'presentation' : void 0,
                style: {
                  objectPosition: props.backgroundPosition || 'center',
                  objectFit: props.backgroundSize || 'cover',
                  ...aspectRatioCss(props),
                },
                class:
                  'builder-image' + (props.className ? ' ' + props.className : '') + ' img-Image',
                get src() {
                  return props.image;
                },
                srcSet: srcSetToUse(props),
                get sizes() {
                  return props.sizes;
                },
                [_IMMUTABLE]: {
                  alt: _wrapSignal(props, 'altText'),
                  src: _wrapSignal(props, 'image'),
                  sizes: _wrapSignal(props, 'sizes'),
                },
              }),
            ],
            [_IMMUTABLE]: {
              children: false,
            },
          }),
          props.aspectRatio && !(props.builderBlock?.children?.length && props.fitContent)
            ? /* @__PURE__ */ jsx('div', {
                class: 'builder-image-sizer div-Image',
                style: {
                  paddingTop: props.aspectRatio * 100 + '%',
                },
              })
            : null,
          props.builderBlock?.children?.length && props.fitContent
            ? /* @__PURE__ */ jsx(Slot, {}, '0A_0')
            : null,
          !props.fitContent && props.children
            ? /* @__PURE__ */ jsx('div', {
                class: 'div-Image-2',
                children: /* @__PURE__ */ jsx(Slot, {}, '0A_1'),
              })
            : null,
        ],
        [_IMMUTABLE]: {
          children: false,
        },
      },
      '0A_2'
    );
  }, 'Image_component_LRxDkFa1EfU')
);
const STYLES = `
.img-Image {
  opacity: 1;
  transition: opacity 0.2s ease-in-out;
}.div-Image {
  width: 100%;
  pointer-events: none;
  font-size: 0;
}.div-Image-2 {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}`;
const componentInfo$a = {
  name: 'Core:Button',
  image:
    'https://cdn.builder.io/api/v1/image/assets%2FIsxPKMo2gPRRKeakUztj1D6uqed2%2F81a15681c3e74df09677dfc57a615b13',
  defaultStyles: {
    appearance: 'none',
    paddingTop: '15px',
    paddingBottom: '15px',
    paddingLeft: '25px',
    paddingRight: '25px',
    backgroundColor: '#000000',
    color: 'white',
    borderRadius: '4px',
    textAlign: 'center',
    cursor: 'pointer',
  },
  inputs: [
    {
      name: 'text',
      type: 'text',
      defaultValue: 'Click me!',
      bubble: true,
    },
    {
      name: 'link',
      type: 'url',
      bubble: true,
    },
    {
      name: 'openLinkInNewTab',
      type: 'boolean',
      defaultValue: false,
      friendlyName: 'Open link in new tab',
    },
  ],
  static: true,
  noWrap: true,
};
const serializeFn = (fnValue) => {
  const fnStr = fnValue.toString().trim();
  const appendFunction = !fnStr.startsWith('function') && !fnStr.startsWith('(');
  return `return (${appendFunction ? 'function ' : ''}${fnStr}).apply(this, arguments)`;
};
const componentInfo$9 = {
  name: 'Columns',
  inputs: [
    {
      name: 'columns',
      type: 'array',
      broadcast: true,
      subFields: [
        {
          name: 'blocks',
          type: 'array',
          hideFromUI: true,
          defaultValue: [
            {
              '@type': '@builder.io/sdk:Element',
              responsiveStyles: {
                large: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  flexShrink: '0',
                  position: 'relative',
                  marginTop: '30px',
                  textAlign: 'center',
                  lineHeight: 'normal',
                  height: 'auto',
                  minHeight: '20px',
                  minWidth: '20px',
                  overflow: 'hidden',
                },
              },
              component: {
                name: 'Image',
                options: {
                  image:
                    'https://builder.io/api/v1/image/assets%2Fpwgjf0RoYWbdnJSbpBAjXNRMe9F2%2Ffb27a7c790324294af8be1c35fe30f4d',
                  backgroundPosition: 'center',
                  backgroundSize: 'cover',
                  aspectRatio: 0.7004048582995948,
                },
              },
            },
            {
              '@type': '@builder.io/sdk:Element',
              responsiveStyles: {
                large: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  flexShrink: '0',
                  position: 'relative',
                  marginTop: '30px',
                  textAlign: 'center',
                  lineHeight: 'normal',
                  height: 'auto',
                },
              },
              component: {
                name: 'Text',
                options: {
                  text: '<p>Enter some text...</p>',
                },
              },
            },
          ],
        },
        {
          name: 'width',
          type: 'number',
          hideFromUI: true,
          helperText: 'Width %, e.g. set to 50 to fill half of the space',
        },
        {
          name: 'link',
          type: 'url',
          helperText: 'Optionally set a url that clicking this column will link to',
        },
      ],
      defaultValue: [
        {
          blocks: [
            {
              '@type': '@builder.io/sdk:Element',
              responsiveStyles: {
                large: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  flexShrink: '0',
                  position: 'relative',
                  marginTop: '30px',
                  textAlign: 'center',
                  lineHeight: 'normal',
                  height: 'auto',
                  minHeight: '20px',
                  minWidth: '20px',
                  overflow: 'hidden',
                },
              },
              component: {
                name: 'Image',
                options: {
                  image:
                    'https://builder.io/api/v1/image/assets%2Fpwgjf0RoYWbdnJSbpBAjXNRMe9F2%2Ffb27a7c790324294af8be1c35fe30f4d',
                  backgroundPosition: 'center',
                  backgroundSize: 'cover',
                  aspectRatio: 0.7004048582995948,
                },
              },
            },
            {
              '@type': '@builder.io/sdk:Element',
              responsiveStyles: {
                large: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  flexShrink: '0',
                  position: 'relative',
                  marginTop: '30px',
                  textAlign: 'center',
                  lineHeight: 'normal',
                  height: 'auto',
                },
              },
              component: {
                name: 'Text',
                options: {
                  text: '<p>Enter some text...</p>',
                },
              },
            },
          ],
        },
        {
          blocks: [
            {
              '@type': '@builder.io/sdk:Element',
              responsiveStyles: {
                large: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  flexShrink: '0',
                  position: 'relative',
                  marginTop: '30px',
                  textAlign: 'center',
                  lineHeight: 'normal',
                  height: 'auto',
                  minHeight: '20px',
                  minWidth: '20px',
                  overflow: 'hidden',
                },
              },
              component: {
                name: 'Image',
                options: {
                  image:
                    'https://builder.io/api/v1/image/assets%2Fpwgjf0RoYWbdnJSbpBAjXNRMe9F2%2Ffb27a7c790324294af8be1c35fe30f4d',
                  backgroundPosition: 'center',
                  backgroundSize: 'cover',
                  aspectRatio: 0.7004048582995948,
                },
              },
            },
            {
              '@type': '@builder.io/sdk:Element',
              responsiveStyles: {
                large: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  flexShrink: '0',
                  position: 'relative',
                  marginTop: '30px',
                  textAlign: 'center',
                  lineHeight: 'normal',
                  height: 'auto',
                },
              },
              component: {
                name: 'Text',
                options: {
                  text: '<p>Enter some text...</p>',
                },
              },
            },
          ],
        },
      ],
      onChange: serializeFn((options) => {
        function clearWidths() {
          columns.forEach((col) => {
            col.delete('width');
          });
        }
        const columns = options.get('columns');
        if (Array.isArray(columns)) {
          const containsColumnWithWidth = !!columns.find((col) => col.get('width'));
          if (containsColumnWithWidth) {
            const containsColumnWithoutWidth = !!columns.find((col) => !col.get('width'));
            if (containsColumnWithoutWidth) clearWidths();
            else {
              const sumWidths = columns.reduce((memo, col) => {
                return memo + col.get('width');
              }, 0);
              const widthsDontAddUp = sumWidths !== 100;
              if (widthsDontAddUp) clearWidths();
            }
          }
        }
      }),
    },
    {
      name: 'space',
      type: 'number',
      defaultValue: 20,
      helperText: 'Size of gap between columns',
      advanced: true,
    },
    {
      name: 'stackColumnsAt',
      type: 'string',
      defaultValue: 'tablet',
      helperText: 'Convert horizontal columns to vertical at what device size',
      enum: ['tablet', 'mobile', 'never'],
      advanced: true,
    },
    {
      name: 'reverseColumnsWhenStacked',
      type: 'boolean',
      defaultValue: false,
      helperText: 'When stacking columns for mobile devices, reverse the ordering',
      advanced: true,
    },
  ],
};
const componentInfo$8 = {
  name: 'Fragment',
  static: true,
  hidden: true,
  canHaveChildren: true,
  noWrap: true,
};
const componentInfo$7 = {
  name: 'Image',
  static: true,
  image:
    'https://firebasestorage.googleapis.com/v0/b/builder-3b0a2.appspot.com/o/images%2Fbaseline-insert_photo-24px.svg?alt=media&token=4e5d0ef4-f5e8-4e57-b3a9-38d63a9b9dc4',
  defaultStyles: {
    position: 'relative',
    minHeight: '20px',
    minWidth: '20px',
    overflow: 'hidden',
  },
  canHaveChildren: true,
  inputs: [
    {
      name: 'image',
      type: 'file',
      bubble: true,
      allowedFileTypes: ['jpeg', 'jpg', 'png', 'svg'],
      required: true,
      defaultValue:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F72c80f114dc149019051b6852a9e3b7a',
      onChange: serializeFn((options) => {
        const DEFAULT_ASPECT_RATIO = 0.7041;
        options.delete('srcset');
        options.delete('noWebp');
        function loadImage(url, timeout = 6e4) {
          return new Promise((resolve, reject) => {
            const img = document.createElement('img');
            let loaded = false;
            img.onload = () => {
              loaded = true;
              resolve(img);
            };
            img.addEventListener('error', (event) => {
              console.warn('Image load failed', event.error);
              reject(event.error);
            });
            img.src = url;
            setTimeout(() => {
              if (!loaded) reject(new Error('Image load timed out'));
            }, timeout);
          });
        }
        function round2(num) {
          return Math.round(num * 1e3) / 1e3;
        }
        const value = options.get('image');
        const aspectRatio = options.get('aspectRatio');
        fetch(value)
          .then((res) => res.blob())
          .then((blob) => {
            if (blob.type.includes('svg')) options.set('noWebp', true);
          });
        if (value && (!aspectRatio || aspectRatio === DEFAULT_ASPECT_RATIO))
          return loadImage(value).then((img) => {
            const possiblyUpdatedAspectRatio = options.get('aspectRatio');
            if (
              options.get('image') === value &&
              (!possiblyUpdatedAspectRatio || possiblyUpdatedAspectRatio === DEFAULT_ASPECT_RATIO)
            ) {
              if (img.width && img.height) {
                options.set('aspectRatio', round2(img.height / img.width));
                options.set('height', img.height);
                options.set('width', img.width);
              }
            }
          });
      }),
    },
    {
      name: 'backgroundSize',
      type: 'text',
      defaultValue: 'cover',
      enum: [
        {
          label: 'contain',
          value: 'contain',
          helperText: 'The image should never get cropped',
        },
        {
          label: 'cover',
          value: 'cover',
          helperText: "The image should fill it's box, cropping when needed",
        },
      ],
    },
    {
      name: 'backgroundPosition',
      type: 'text',
      defaultValue: 'center',
      enum: [
        'center',
        'top',
        'left',
        'right',
        'bottom',
        'top left',
        'top right',
        'bottom left',
        'bottom right',
      ],
    },
    {
      name: 'altText',
      type: 'string',
      helperText: 'Text to display when the user has images off',
    },
    {
      name: 'height',
      type: 'number',
      hideFromUI: true,
    },
    {
      name: 'width',
      type: 'number',
      hideFromUI: true,
    },
    {
      name: 'sizes',
      type: 'string',
      hideFromUI: true,
    },
    {
      name: 'srcset',
      type: 'string',
      hideFromUI: true,
    },
    {
      name: 'lazy',
      type: 'boolean',
      defaultValue: true,
      hideFromUI: true,
    },
    {
      name: 'fitContent',
      type: 'boolean',
      helperText:
        "When child blocks are provided, fit to them instead of using the image's aspect ratio",
      defaultValue: true,
    },
    {
      name: 'aspectRatio',
      type: 'number',
      helperText:
        "This is the ratio of height/width, e.g. set to 1.5 for a 300px wide and 200px tall photo. Set to 0 to not force the image to maintain it's aspect ratio",
      advanced: true,
      defaultValue: 0.7041,
    },
  ],
};
const componentInfo$6 = {
  name: 'Core:Section',
  static: true,
  image:
    'https://cdn.builder.io/api/v1/image/assets%2FIsxPKMo2gPRRKeakUztj1D6uqed2%2F682efef23ace49afac61748dd305c70a',
  inputs: [
    {
      name: 'maxWidth',
      type: 'number',
      defaultValue: 1200,
    },
    {
      name: 'lazyLoad',
      type: 'boolean',
      defaultValue: false,
      advanced: true,
      description: 'Only render this section when in view',
    },
  ],
  defaultStyles: {
    paddingLeft: '20px',
    paddingRight: '20px',
    paddingTop: '50px',
    paddingBottom: '50px',
    marginTop: '0px',
    width: '100vw',
    marginLeft: 'calc(50% - 50vw)',
  },
  canHaveChildren: true,
  defaultChildren: [
    {
      '@type': '@builder.io/sdk:Element',
      responsiveStyles: {
        large: {
          textAlign: 'center',
        },
      },
      component: {
        name: 'Text',
        options: {
          text: "<p><b>I am a section! My content keeps from getting too wide, so that it's easy to read even on big screens.</b></p><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur</p>",
        },
      },
    },
  ],
};
const SectionComponent = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    return /* @__PURE__ */ jsx('section', {
      ...props.attributes,
      style: {
        width: '100%',
        alignSelf: 'stretch',
        flexGrow: 1,
        boxSizing: 'border-box',
        maxWidth: props.maxWidth || 1200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        marginLeft: 'auto',
        marginRight: 'auto',
      },
      children: /* @__PURE__ */ jsx(Slot, {}, '2Y_0'),
    });
  }, 'SectionComponent_component_ZWF9iD5WeLg')
);
const componentInfo$5 = {
  name: 'Symbol',
  noWrap: true,
  static: true,
  inputs: [
    {
      name: 'symbol',
      type: 'uiSymbol',
    },
    {
      name: 'dataOnly',
      helperText: "Make this a data symbol that doesn't display any UI",
      type: 'boolean',
      defaultValue: false,
      advanced: true,
      hideFromUI: true,
    },
    {
      name: 'inheritState',
      helperText: 'Inherit the parent component state and data',
      type: 'boolean',
      defaultValue: false,
      advanced: true,
    },
    {
      name: 'renderToLiquid',
      helperText:
        'Render this symbols contents to liquid. Turn off to fetch with javascript and use custom targeting',
      type: 'boolean',
      defaultValue: false,
      advanced: true,
      hideFromUI: true,
    },
    {
      name: 'useChildren',
      hideFromUI: true,
      type: 'boolean',
    },
  ],
};
function getGlobalThis() {
  if (typeof globalThis !== 'undefined') return globalThis;
  if (typeof window !== 'undefined') return window;
  if (typeof global !== 'undefined') return global;
  if (typeof self !== 'undefined') return self;
  return globalThis;
}
function getFetch() {
  const globalFetch = getGlobalThis().fetch;
  if (typeof globalFetch === 'undefined') {
    console.warn(`Builder SDK could not find a global fetch function. Make sure you have a polyfill for fetch in your project.
      For more information, read https://github.com/BuilderIO/this-package-uses-fetch`);
    throw new Error('Builder SDK could not find a global `fetch` function');
  }
  return globalFetch;
}
const fetch$1 = getFetch();
const getTopLevelDomain = (host) => {
  if (host === 'localhost' || host === '127.0.0.1') return host;
  const parts = host.split('.');
  if (parts.length > 2) return parts.slice(1).join('.');
  return host;
};
const getCookie = async ({ name, canTrack }) => {
  try {
    if (!canTrack) return void 0;
    return document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${name}=`))
      ?.split('=')[1];
  } catch (err) {
    console.debug('[COOKIE] GET error: ', err);
    return void 0;
  }
};
const stringifyCookie = (cookie) =>
  cookie
    .map(([key, value]) => (value ? `${key}=${value}` : key))
    .filter(checkIsDefined)
    .join('; ');
const SECURE_CONFIG = [
  ['secure', ''],
  ['SameSite', 'None'],
];
const createCookieString = ({ name, value, expires }) => {
  const secure = isBrowser() ? location.protocol === 'https:' : true;
  const secureObj = secure ? SECURE_CONFIG : [[]];
  const expiresObj = expires ? [['expires', expires.toUTCString()]] : [[]];
  const cookieValue = [
    [name, value],
    ...expiresObj,
    ['path', '/'],
    ['domain', getTopLevelDomain(window.location.hostname)],
    ...secureObj,
  ];
  const cookie = stringifyCookie(cookieValue);
  return cookie;
};
const setCookie = async ({ name, value, expires, canTrack }) => {
  try {
    if (!canTrack) return;
    const cookie = createCookieString({
      name,
      value,
      expires,
    });
    document.cookie = cookie;
  } catch (err) {
    console.warn('[COOKIE] SET error: ', err);
  }
};
const BUILDER_STORE_PREFIX = 'builderio.variations';
const getContentTestKey = (id) => `${BUILDER_STORE_PREFIX}.${id}`;
const getContentVariationCookie = ({ contentId, canTrack }) =>
  getCookie({
    name: getContentTestKey(contentId),
    canTrack,
  });
const setContentVariationCookie = ({ contentId, canTrack, value }) =>
  setCookie({
    name: getContentTestKey(contentId),
    value,
    canTrack,
  });
const checkIsBuilderContentWithVariations = (item) =>
  checkIsDefined(item.id) &&
  checkIsDefined(item.variations) &&
  Object.keys(item.variations).length > 0;
const getRandomVariationId = ({ id, variations }) => {
  let n = 0;
  const random = Math.random();
  for (const id1 in variations) {
    const testRatio = variations[id1]?.testRatio;
    n += testRatio;
    if (random < n) return id1;
  }
  return id;
};
const getTestFields = ({ item, testGroupId }) => {
  const variationValue = item.variations[testGroupId];
  if (testGroupId === item.id || !variationValue)
    return {
      testVariationId: item.id,
      testVariationName: 'Default',
    };
  else
    return {
      data: variationValue.data,
      testVariationId: variationValue.id,
      testVariationName: variationValue.name || (variationValue.id === item.id ? 'Default' : ''),
    };
};
const getContentVariation = async ({ item, canTrack }) => {
  const testGroupId = await getContentVariationCookie({
    canTrack,
    contentId: item.id,
  });
  const testFields = testGroupId
    ? getTestFields({
        item,
        testGroupId,
      })
    : void 0;
  if (testFields) return testFields;
  else {
    const randomVariationId = getRandomVariationId({
      variations: item.variations,
      id: item.id,
    });
    setContentVariationCookie({
      contentId: item.id,
      value: randomVariationId,
      canTrack,
    }).catch((err) => {
      console.error('could not store A/B test variation: ', err);
    });
    return getTestFields({
      item,
      testGroupId: randomVariationId,
    });
  }
};
const handleABTesting = async ({ item, canTrack }) => {
  if (!checkIsBuilderContentWithVariations(item)) return;
  const variationValue = await getContentVariation({
    item,
    canTrack,
  });
  Object.assign(item, variationValue);
};
function flatten(object, path = null, separator = '.') {
  return Object.keys(object).reduce((acc, key) => {
    const value = object[key];
    const newPath = [path, key].filter(Boolean).join(separator);
    const isObject = [
      typeof value === 'object',
      value !== null,
      !(Array.isArray(value) && value.length === 0),
    ].every(Boolean);
    return isObject
      ? {
          ...acc,
          ...flatten(value, newPath, separator),
        }
      : {
          ...acc,
          [newPath]: value,
        };
  }, {});
}
const BUILDER_SEARCHPARAMS_PREFIX = 'builder.';
const BUILDER_OPTIONS_PREFIX = 'options.';
const convertSearchParamsToQueryObject = (searchParams) => {
  const options = {};
  searchParams.forEach((value, key) => {
    options[key] = value;
  });
  return options;
};
const getBuilderSearchParams = (_options) => {
  if (!_options) return {};
  const options = normalizeSearchParams(_options);
  const newOptions = {};
  Object.keys(options).forEach((key) => {
    if (key.startsWith(BUILDER_SEARCHPARAMS_PREFIX)) {
      const trimmedKey = key
        .replace(BUILDER_SEARCHPARAMS_PREFIX, '')
        .replace(BUILDER_OPTIONS_PREFIX, '');
      newOptions[trimmedKey] = options[key];
    }
  });
  return newOptions;
};
const getBuilderSearchParamsFromWindow = () => {
  if (!isBrowser()) return {};
  const searchParams = new URLSearchParams(window.location.search);
  return getBuilderSearchParams(searchParams);
};
const normalizeSearchParams = (searchParams) =>
  searchParams instanceof URLSearchParams
    ? convertSearchParamsToQueryObject(searchParams)
    : searchParams;
const generateContentUrl = (options) => {
  const {
    limit = 30,
    userAttributes,
    query,
    noTraverse = false,
    model,
    apiKey,
    includeRefs = true,
    locale,
  } = options;
  if (!apiKey) throw new Error('Missing API key');
  const url = new URL(
    `https://cdn.builder.io/api/v2/content/${model}?apiKey=${apiKey}&limit=${limit}&noTraverse=${noTraverse}&includeRefs=${includeRefs}${
      locale ? `&locale=${locale}` : ''
    }`
  );
  const queryOptions = {
    ...getBuilderSearchParamsFromWindow(),
    ...normalizeSearchParams(options.options || {}),
  };
  const flattened = flatten(queryOptions);
  for (const key in flattened) url.searchParams.set(key, String(flattened[key]));
  if (userAttributes) url.searchParams.set('userAttributes', JSON.stringify(userAttributes));
  if (query) {
    const flattened1 = flatten({
      query,
    });
    for (const key1 in flattened1) url.searchParams.set(key1, JSON.stringify(flattened1[key1]));
  }
  return url;
};
async function getContent(options) {
  return (
    (
      await getAllContent({
        ...options,
        limit: 1,
      })
    ).results[0] || null
  );
}
async function getAllContent(options) {
  const url = generateContentUrl(options);
  const res = await fetch$1(url.href);
  const content = await res.json();
  const canTrack = options.canTrack !== false;
  if (canTrack && Array.isArray(content.results))
    for (const item of content.results)
      await handleABTesting({
        item,
        canTrack,
      });
  return content;
}
const className = function className22(props, state, builderContext2) {
  return [
    ...[props.attributes.class],
    'builder-symbol',
    props.symbol?.inline ? 'builder-inline-symbol' : void 0,
    props.symbol?.dynamic || props.dynamic ? 'builder-dynamic-symbol' : void 0,
  ]
    .filter(Boolean)
    .join(' ');
};
const contentToUse = function contentToUse2(props, state, builderContext2) {
  return props.symbol?.content || state.fetchedContent;
};
const Symbol$1 = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    const builderContext$1 = useContext(builderContext);
    const state = useStore({
      fetchedContent: null,
    });
    useTaskQrl(
      inlinedQrl(
        ({ track: track2 }) => {
          const [builderContext2, props2, state2] = useLexicalScope();
          track2(() => props2.symbol);
          track2(() => state2.fetchedContent);
          const symbolToUse = props2.symbol;
          if (
            symbolToUse &&
            !symbolToUse.content &&
            !state2.fetchedContent &&
            symbolToUse.model &&
            builderContext2?.apiKey
          )
            getContent({
              model: symbolToUse.model,
              apiKey: builderContext2.apiKey,
              query: {
                id: symbolToUse.entry,
              },
            }).then((response) => {
              state2.fetchedContent = response;
            });
        },
        'Symbol_component_useTask_NIAWAC1bMBo',
        [builderContext$1, props, state]
      )
    );
    return /* @__PURE__ */ jsx('div', {
      ...props.attributes,
      class: className(props),
      children: /* @__PURE__ */ jsx(
        RenderContent$1,
        {
          get apiKey() {
            return builderContext$1.apiKey;
          },
          get context() {
            return builderContext$1.context;
          },
          customComponents: Object.values(builderContext$1.registeredComponents),
          data: {
            ...props.symbol?.data,
            ...builderContext$1.state,
            ...props.symbol?.content?.data?.state,
          },
          model: props.symbol?.model,
          content: contentToUse(props, state),
          [_IMMUTABLE]: {
            apiKey: _wrapSignal(builderContext$1, 'apiKey'),
            context: _wrapSignal(builderContext$1, 'context'),
          },
        },
        'Wt_0'
      ),
    });
  }, 'Symbol_component_WVvggdkUPdk')
);
const componentInfo$4 = {
  name: 'Text',
  static: true,
  image:
    'https://firebasestorage.googleapis.com/v0/b/builder-3b0a2.appspot.com/o/images%2Fbaseline-text_fields-24px%20(1).svg?alt=media&token=12177b73-0ee3-42ca-98c6-0dd003de1929',
  inputs: [
    {
      name: 'text',
      type: 'html',
      required: true,
      autoFocus: true,
      bubble: true,
      defaultValue: 'Enter some text...',
    },
  ],
  defaultStyles: {
    lineHeight: 'normal',
    height: 'auto',
    textAlign: 'center',
  },
};
const Text = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    return /* @__PURE__ */ jsx('span', {
      class: 'builder-text',
      get dangerouslySetInnerHTML() {
        return props.text;
      },
      style: {
        outline: 'none',
      },
      [_IMMUTABLE]: {
        dangerouslySetInnerHTML: _wrapSignal(props, 'text'),
      },
    });
  }, 'Text_component_15p0cKUxgIE')
);
const componentInfo$3 = {
  name: 'Video',
  canHaveChildren: true,
  defaultStyles: {
    minHeight: '20px',
    minWidth: '20px',
  },
  image:
    'https://firebasestorage.googleapis.com/v0/b/builder-3b0a2.appspot.com/o/images%2Fbaseline-videocam-24px%20(1).svg?alt=media&token=49a84e4a-b20e-4977-a650-047f986874bb',
  inputs: [
    {
      name: 'video',
      type: 'file',
      allowedFileTypes: ['mp4'],
      bubble: true,
      defaultValue:
        'https://firebasestorage.googleapis.com/v0/b/builder-3b0a2.appspot.com/o/assets%2FKQlEmWDxA0coC3PK6UvkrjwkIGI2%2F28cb070609f546cdbe5efa20e931aa4b?alt=media&token=912e9551-7a7c-4dfb-86b6-3da1537d1a7f',
      required: true,
    },
    {
      name: 'posterImage',
      type: 'file',
      allowedFileTypes: ['jpeg', 'png'],
      helperText: 'Image to show before the video plays',
    },
    {
      name: 'autoPlay',
      type: 'boolean',
      defaultValue: true,
    },
    {
      name: 'controls',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'muted',
      type: 'boolean',
      defaultValue: true,
    },
    {
      name: 'loop',
      type: 'boolean',
      defaultValue: true,
    },
    {
      name: 'playsInline',
      type: 'boolean',
      defaultValue: true,
    },
    {
      name: 'fit',
      type: 'text',
      defaultValue: 'cover',
      enum: ['contain', 'cover', 'fill', 'auto'],
    },
    {
      name: 'fitContent',
      type: 'boolean',
      helperText: 'When child blocks are provided, fit to them instead of using the aspect ratio',
      defaultValue: true,
      advanced: true,
    },
    {
      name: 'position',
      type: 'text',
      defaultValue: 'center',
      enum: [
        'center',
        'top',
        'left',
        'right',
        'bottom',
        'top left',
        'top right',
        'bottom left',
        'bottom right',
      ],
    },
    {
      name: 'height',
      type: 'number',
      advanced: true,
    },
    {
      name: 'width',
      type: 'number',
      advanced: true,
    },
    {
      name: 'aspectRatio',
      type: 'number',
      advanced: true,
      defaultValue: 0.7004048582995948,
    },
    {
      name: 'lazyLoad',
      type: 'boolean',
      helperText:
        'Load this video "lazily" - as in only when a user scrolls near the video. Recommended for optmized performance and bandwidth consumption',
      defaultValue: true,
      advanced: true,
    },
  ],
};
const videoProps = function videoProps2(props, state) {
  return {
    ...(props.autoPlay === true
      ? {
          autoPlay: true,
        }
      : {}),
    ...(props.muted === true
      ? {
          muted: true,
        }
      : {}),
    ...(props.controls === true
      ? {
          controls: true,
        }
      : {}),
    ...(props.loop === true
      ? {
          loop: true,
        }
      : {}),
    ...(props.playsInline === true
      ? {
          playsInline: true,
        }
      : {}),
  };
};
const spreadProps = function spreadProps2(props, state) {
  return {
    ...props.attributes,
    ...videoProps(props),
  };
};
const Video = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    return /* @__PURE__ */ jsx('video', {
      ...spreadProps(props),
      style: {
        width: '100%',
        height: '100%',
        ...props.attributes?.style,
        objectFit: props.fit,
        objectPosition: props.position,
        borderRadius: 1,
      },
      src: props.video || 'no-src',
      get poster() {
        return props.posterImage;
      },
      [_IMMUTABLE]: {
        poster: _wrapSignal(props, 'posterImage'),
      },
    });
  }, 'Video_component_qdcTZflYyoQ')
);
const componentInfo$2 = {
  name: 'Embed',
  static: true,
  inputs: [
    {
      name: 'url',
      type: 'url',
      required: true,
      defaultValue: '',
      helperText: 'e.g. enter a youtube url, google map, etc',
      onChange: serializeFn((options) => {
        const url = options.get('url');
        if (url) {
          options.set('content', 'Loading...');
          const apiKey = 'ae0e60e78201a3f2b0de4b';
          return fetch(`https://iframe.ly/api/iframely?url=${url}&api_key=${apiKey}`)
            .then((res) => res.json())
            .then((data) => {
              if (options.get('url') === url) {
                if (data.html) options.set('content', data.html);
                else options.set('content', 'Invalid url, please try another');
              }
            })
            .catch((_err) => {
              options.set(
                'content',
                'There was an error embedding this URL, please try again or another URL'
              );
            });
        } else options.delete('content');
      }),
    },
    {
      name: 'content',
      type: 'html',
      defaultValue: '<div style="padding: 20px; text-align: center">(Choose an embed URL)<div>',
      hideFromUI: true,
    },
  ],
};
const SCRIPT_MIME_TYPES = ['text/javascript', 'application/javascript', 'application/ecmascript'];
const isJsScript = (script) => SCRIPT_MIME_TYPES.includes(script.type);
const findAndRunScripts$1 = function findAndRunScripts2(props, state, elem) {
  if (!elem || !elem.getElementsByTagName) return;
  const scripts = elem.getElementsByTagName('script');
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    if (script.src && !state.scriptsInserted.includes(script.src)) {
      state.scriptsInserted.push(script.src);
      const newScript = document.createElement('script');
      newScript.async = true;
      newScript.src = script.src;
      document.head.appendChild(newScript);
    } else if (isJsScript(script) && !state.scriptsRun.includes(script.innerText))
      try {
        state.scriptsRun.push(script.innerText);
        new Function(script.innerText)();
      } catch (error) {
        console.warn('`Embed`: Error running script:', error);
      }
  }
};
const Embed = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    const elem = useRef();
    const state = useStore({
      ranInitFn: false,
      scriptsInserted: [],
      scriptsRun: [],
    });
    useTaskQrl(
      inlinedQrl(
        ({ track: track2 }) => {
          const [elem2, props2, state2] = useLexicalScope();
          track2(() => elem2);
          track2(() => state2.ranInitFn);
          if (elem2 && !state2.ranInitFn) {
            state2.ranInitFn = true;
            findAndRunScripts$1(props2, state2, elem2);
          }
        },
        'Embed_component_useTask_bg7ez0XUtiM',
        [elem, props, state]
      )
    );
    return /* @__PURE__ */ jsx('div', {
      class: 'builder-embed',
      ref: elem,
      get dangerouslySetInnerHTML() {
        return props.content;
      },
      [_IMMUTABLE]: {
        dangerouslySetInnerHTML: _wrapSignal(props, 'content'),
      },
    });
  }, 'Embed_component_Uji08ORjXbE')
);
const ImgComponent = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    return /* @__PURE__ */ jsx(
      'img',
      {
        style: {
          objectFit: props.backgroundSize || 'cover',
          objectPosition: props.backgroundPosition || 'center',
        },
        get alt() {
          return props.altText;
        },
        src: props.imgSrc || props.image,
        ...props.attributes,
        [_IMMUTABLE]: {
          alt: _wrapSignal(props, 'altText'),
        },
      },
      (isEditing() && props.imgSrc) || 'default-key'
    );
  }, 'ImgComponent_component_FXvIDBSffO8')
);
const componentInfo$1 = {
  name: 'Raw:Img',
  hideFromInsertMenu: true,
  image:
    'https://firebasestorage.googleapis.com/v0/b/builder-3b0a2.appspot.com/o/images%2Fbaseline-insert_photo-24px.svg?alt=media&token=4e5d0ef4-f5e8-4e57-b3a9-38d63a9b9dc4',
  inputs: [
    {
      name: 'image',
      bubble: true,
      type: 'file',
      allowedFileTypes: ['jpeg', 'jpg', 'png', 'svg'],
      required: true,
    },
  ],
  noWrap: true,
  static: true,
};
const findAndRunScripts = function findAndRunScripts22(props, state, elem) {
  if (elem && elem.getElementsByTagName && typeof window !== 'undefined') {
    const scripts = elem.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      if (script.src) {
        if (state.scriptsInserted.includes(script.src)) continue;
        state.scriptsInserted.push(script.src);
        const newScript = document.createElement('script');
        newScript.async = true;
        newScript.src = script.src;
        document.head.appendChild(newScript);
      } else if (
        !script.type ||
        ['text/javascript', 'application/javascript', 'application/ecmascript'].includes(
          script.type
        )
      ) {
        if (state.scriptsRun.includes(script.innerText)) continue;
        try {
          state.scriptsRun.push(script.innerText);
          new Function(script.innerText)();
        } catch (error) {
          console.warn('`CustomCode`: Error running script:', error);
        }
      }
    }
  }
};
const CustomCode = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    const elem = useRef();
    const state = useStore({
      scriptsInserted: [],
      scriptsRun: [],
    });
    useClientEffectQrl(
      inlinedQrl(
        () => {
          const [elem2, props2, state2] = useLexicalScope();
          findAndRunScripts(props2, state2, elem2);
        },
        'CustomCode_component_useClientEffect_4w4c951ufB4',
        [elem, props, state]
      )
    );
    return /* @__PURE__ */ jsx('div', {
      ref: elem,
      class: 'builder-custom-code' + (props.replaceNodes ? ' replace-nodes' : ''),
      get dangerouslySetInnerHTML() {
        return props.code;
      },
      [_IMMUTABLE]: {
        dangerouslySetInnerHTML: _wrapSignal(props, 'code'),
      },
    });
  }, 'CustomCode_component_uYOSy7w7Zqw')
);
const componentInfo = {
  name: 'Custom Code',
  static: true,
  requiredPermissions: ['editCode'],
  inputs: [
    {
      name: 'code',
      type: 'html',
      required: true,
      defaultValue: '<p>Hello there, I am custom HTML code!</p>',
      code: true,
    },
    {
      name: 'replaceNodes',
      type: 'boolean',
      helperText: 'Preserve server rendered dom nodes',
      advanced: true,
    },
    {
      name: 'scriptsClientOnly',
      type: 'boolean',
      defaultValue: false,
      helperText:
        'Only print and run scripts on the client. Important when scripts influence DOM that could be replaced when client loads',
      advanced: true,
    },
  ],
};
const getDefaultRegisteredComponents = () => [
  {
    component: Button,
    ...componentInfo$a,
  },
  {
    component: Columns,
    ...componentInfo$9,
  },
  {
    component: CustomCode,
    ...componentInfo,
  },
  {
    component: Embed,
    ...componentInfo$2,
  },
  {
    component: FragmentComponent,
    ...componentInfo$8,
  },
  {
    component: Image,
    ...componentInfo$7,
  },
  {
    component: ImgComponent,
    ...componentInfo$1,
  },
  {
    component: SectionComponent,
    ...componentInfo$6,
  },
  {
    component: Symbol$1,
    ...componentInfo$5,
  },
  {
    component: Text,
    ...componentInfo$4,
  },
  {
    component: Video,
    ...componentInfo$3,
  },
];
function isPreviewing() {
  if (!isBrowser()) return false;
  if (isEditing()) return false;
  return Boolean(location.search.indexOf('builder.preview=') !== -1);
}
const components = [];
function registerComponent(component3, info) {
  components.push({
    component: component3,
    ...info,
  });
  console.warn(
    'registerComponent is deprecated. Use the `customComponents` prop in RenderContent instead to provide your custom components to the builder SDK.'
  );
  return component3;
}
const createRegisterComponentMessage = ({ component: _, ...info }) => ({
  type: 'builder.registerComponent',
  data: prepareComponentInfoToSend(info),
});
const serializeValue = (value) =>
  typeof value === 'function' ? serializeFn(value) : fastClone(value);
const prepareComponentInfoToSend = ({ inputs, ...info }) => ({
  ...fastClone(info),
  inputs: inputs?.map((input) =>
    Object.entries(input).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: serializeValue(value),
      }),
      {}
    )
  ),
});
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == 'x' ? r : (r & 3) | 8;
    return v.toString(16);
  });
}
function uuid() {
  return uuidv4().replace(/-/g, '');
}
const SESSION_LOCAL_STORAGE_KEY = 'builderSessionId';
const getSessionId = async ({ canTrack }) => {
  if (!canTrack) return void 0;
  const sessionId = await getCookie({
    name: SESSION_LOCAL_STORAGE_KEY,
    canTrack,
  });
  if (checkIsDefined(sessionId)) return sessionId;
  else {
    const newSessionId = createSessionId();
    setSessionId({
      id: newSessionId,
      canTrack,
    });
    return newSessionId;
  }
};
const createSessionId = () => uuid();
const setSessionId = ({ id, canTrack }) =>
  setCookie({
    name: SESSION_LOCAL_STORAGE_KEY,
    value: id,
    canTrack,
  });
const getLocalStorage = () =>
  isBrowser() && typeof localStorage !== 'undefined' ? localStorage : void 0;
const getLocalStorageItem = ({ key, canTrack }) => {
  try {
    if (canTrack) return getLocalStorage()?.getItem(key);
    return void 0;
  } catch (err) {
    console.debug('[LocalStorage] GET error: ', err);
    return void 0;
  }
};
const setLocalStorageItem = ({ key, canTrack, value }) => {
  try {
    if (canTrack) getLocalStorage()?.setItem(key, value);
  } catch (err) {
    console.debug('[LocalStorage] SET error: ', err);
  }
};
const VISITOR_LOCAL_STORAGE_KEY = 'builderVisitorId';
const getVisitorId = ({ canTrack }) => {
  if (!canTrack) return void 0;
  const visitorId = getLocalStorageItem({
    key: VISITOR_LOCAL_STORAGE_KEY,
    canTrack,
  });
  if (checkIsDefined(visitorId)) return visitorId;
  else {
    const newVisitorId = createVisitorId();
    setVisitorId({
      id: newVisitorId,
      canTrack,
    });
    return newVisitorId;
  }
};
const createVisitorId = () => uuid();
const setVisitorId = ({ id, canTrack }) =>
  setLocalStorageItem({
    key: VISITOR_LOCAL_STORAGE_KEY,
    value: id,
    canTrack,
  });
const getLocation = () => {
  if (isBrowser()) {
    const parsedLocation = new URL(location.href);
    if (parsedLocation.pathname === '') parsedLocation.pathname = '/';
    return parsedLocation;
  } else {
    console.warn('Cannot get location for tracking in non-browser environment');
    return null;
  }
};
const getUserAgent = () => (typeof navigator === 'object' && navigator.userAgent) || '';
const getUserAttributes = () => {
  const userAgent = getUserAgent();
  const isMobile = {
    Android() {
      return userAgent.match(/Android/i);
    },
    BlackBerry() {
      return userAgent.match(/BlackBerry/i);
    },
    iOS() {
      return userAgent.match(/iPhone|iPod/i);
    },
    Opera() {
      return userAgent.match(/Opera Mini/i);
    },
    Windows() {
      return userAgent.match(/IEMobile/i) || userAgent.match(/WPDesktop/i);
    },
    any() {
      return (
        isMobile.Android() ||
        isMobile.BlackBerry() ||
        isMobile.iOS() ||
        isMobile.Opera() ||
        isMobile.Windows() ||
        TARGET === 'reactNative'
      );
    },
  };
  const isTablet = userAgent.match(/Tablet|iPad/i);
  const url = getLocation();
  return {
    urlPath: url?.pathname,
    host: url?.host || url?.hostname,
    device: isTablet ? 'tablet' : isMobile.any() ? 'mobile' : 'desktop',
  };
};
const getTrackingEventData = async ({ canTrack }) => {
  if (!canTrack)
    return {
      visitorId: void 0,
      sessionId: void 0,
    };
  const sessionId = await getSessionId({
    canTrack,
  });
  const visitorId = getVisitorId({
    canTrack,
  });
  return {
    sessionId,
    visitorId,
  };
};
const createEvent = async ({ type: eventType, canTrack, apiKey, metadata, ...properties }) => ({
  type: eventType,
  data: {
    ...properties,
    metadata: {
      url: location.href,
      ...metadata,
    },
    ...(await getTrackingEventData({
      canTrack,
    })),
    userAttributes: getUserAttributes(),
    ownerId: apiKey,
  },
});
async function _track(eventProps) {
  if (!eventProps.apiKey) {
    console.error('[Builder.io]: Missing API key for track call. Please provide your API key.');
    return;
  }
  if (!eventProps.canTrack) return;
  if (isEditing()) return;
  if (!(isBrowser() || TARGET === 'reactNative')) return;
  return fetch(`https://builder.io/api/v1/track`, {
    method: 'POST',
    body: JSON.stringify({
      events: [await createEvent(eventProps)],
    }),
    headers: {
      'content-type': 'application/json',
    },
    mode: 'cors',
  }).catch((err) => {
    console.error('Failed to track: ', err);
  });
}
const track = (args) =>
  _track({
    ...args,
    canTrack: true,
  });
function round(num) {
  return Math.round(num * 1e3) / 1e3;
}
const findParentElement = (target, callback, checkElement = true) => {
  if (!(target instanceof HTMLElement)) return null;
  let parent2 = checkElement ? target : target.parentElement;
  do {
    if (!parent2) return null;
    const matches = callback(parent2);
    if (matches) return parent2;
  } while ((parent2 = parent2.parentElement));
  return null;
};
const findBuilderParent = (target) =>
  findParentElement(target, (el) => {
    const id = el.getAttribute('builder-id') || el.id;
    return Boolean(id?.indexOf('builder-') === 0);
  });
const computeOffset = ({ event, target }) => {
  const targetRect = target.getBoundingClientRect();
  const xOffset = event.clientX - targetRect.left;
  const yOffset = event.clientY - targetRect.top;
  const xRatio = round(xOffset / targetRect.width);
  const yRatio = round(yOffset / targetRect.height);
  return {
    x: xRatio,
    y: yRatio,
  };
};
const getInteractionPropertiesForEvent = (event) => {
  const target = event.target;
  const targetBuilderElement = target && findBuilderParent(target);
  const builderId = targetBuilderElement?.getAttribute('builder-id') || targetBuilderElement?.id;
  return {
    targetBuilderElement: builderId || void 0,
    metadata: {
      targetOffset: target
        ? computeOffset({
            event,
            target,
          })
        : void 0,
      builderTargetOffset: targetBuilderElement
        ? computeOffset({
            event,
            target: targetBuilderElement,
          })
        : void 0,
      builderElementIndex:
        targetBuilderElement && builderId
          ? [].slice.call(document.getElementsByClassName(builderId)).indexOf(targetBuilderElement)
          : void 0,
    },
  };
};
const registry = {};
function register(type, info) {
  let typeList = registry[type];
  if (!typeList) typeList = registry[type] = [];
  typeList.push(info);
  if (isBrowser()) {
    const message = {
      type: 'builder.register',
      data: {
        type,
        info,
      },
    };
    try {
      parent.postMessage(message, '*');
      if (parent !== window) window.postMessage(message, '*');
    } catch (err) {
      console.debug('Could not postmessage', err);
    }
  }
}
const registerInsertMenu = () => {
  register('insertMenu', {
    name: '_default',
    default: true,
    items: [
      {
        name: 'Box',
      },
      {
        name: 'Text',
      },
      {
        name: 'Image',
      },
      {
        name: 'Columns',
      },
      ...[
        {
          name: 'Core:Section',
        },
        {
          name: 'Core:Button',
        },
        {
          name: 'Embed',
        },
        {
          name: 'Custom Code',
        },
      ],
    ],
  });
};
let isSetupForEditing = false;
const setupBrowserForEditing = (options = {}) => {
  if (isSetupForEditing) return;
  isSetupForEditing = true;
  if (isBrowser()) {
    window.parent?.postMessage(
      {
        type: 'builder.sdkInfo',
        data: {
          target: TARGET,
          supportsPatchUpdates: false,
          supportsAddBlockScoping: true,
          supportsCustomBreakpoints: true,
        },
      },
      '*'
    );
    window.parent?.postMessage(
      {
        type: 'builder.updateContent',
        data: {
          options,
        },
      },
      '*'
    );
    window.addEventListener('message', ({ data }) => {
      if (!data?.type) return;
      switch (data.type) {
        case 'builder.evaluate': {
          const text = data.data.text;
          const args = data.data.arguments || [];
          const id = data.data.id;
          const fn = new Function(text);
          let result;
          let error = null;
          try {
            result = fn.apply(null, args);
          } catch (err) {
            error = err;
          }
          if (error)
            window.parent?.postMessage(
              {
                type: 'builder.evaluateError',
                data: {
                  id,
                  error: error.message,
                },
              },
              '*'
            );
          else if (result && typeof result.then === 'function')
            result
              .then((finalResult) => {
                window.parent?.postMessage(
                  {
                    type: 'builder.evaluateResult',
                    data: {
                      id,
                      result: finalResult,
                    },
                  },
                  '*'
                );
              })
              .catch(console.error);
          else
            window.parent?.postMessage(
              {
                type: 'builder.evaluateResult',
                data: {
                  result,
                  id,
                },
              },
              '*'
            );
          break;
        }
      }
    });
  }
};
const getCssFromFont = (font) => {
  const family = font.family + (font.kind && !font.kind.includes('#') ? ', ' + font.kind : '');
  const name = family.split(',')[0];
  const url = font.fileUrl ?? font?.files?.regular;
  let str = '';
  if (url && family && name)
    str += `
@font-face {
font-family: "${family}";
src: local("${name}"), url('${url}') format('woff2');
font-display: fallback;
font-weight: 400;
}
      `.trim();
  if (font.files)
    for (const weight in font.files) {
      const isNumber = String(Number(weight)) === weight;
      if (!isNumber) continue;
      const weightUrl = font.files[weight];
      if (weightUrl && weightUrl !== url)
        str += `
@font-face {
font-family: "${family}";
src: url('${weightUrl}') format('woff2');
font-display: fallback;
font-weight: ${weight};
}
        `.trim();
    }
  return str;
};
const getFontCss = ({ customFonts }) => {
  return customFonts?.map((font) => getCssFromFont(font))?.join(' ') || '';
};
const getCss = ({ cssCode, contentId }) => {
  if (!cssCode) return '';
  if (!contentId) return cssCode;
  return cssCode?.replace(/&/g, `div[builder-content-id="${contentId}"]`) || '';
};
const RenderContentStyles = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    const state = useStore({
      injectedStyles: `
${getCss({
  cssCode: props.cssCode,
  contentId: props.contentId,
})}
${getFontCss({
  customFonts: props.customFonts,
})}

.builder-text > p:first-of-type, .builder-text > .builder-paragraph:first-of-type {
  margin: 0;
}
.builder-text > p, .builder-text > .builder-paragraph {
  color: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  font-weight: inherit;
  font-size: inherit;
  text-align: inherit;
  font-family: inherit;
}
`,
    });
    return /* @__PURE__ */ jsx(
      RenderInlinedStyles,
      {
        get styles() {
          return state.injectedStyles;
        },
        [_IMMUTABLE]: {
          styles: _wrapSignal(state, 'injectedStyles'),
        },
      },
      'V0_0'
    );
  }, 'RenderContentStyles_component_Og0xL34Zbvc')
);
const getContextStateInitialValue = ({ content, data, locale }) => {
  const defaultValues = {};
  content?.data?.inputs?.forEach((input) => {
    if (
      input.name &&
      input.defaultValue !== void 0 &&
      content?.data?.state &&
      content.data.state[input.name] === void 0
    )
      defaultValues[input.name] = input.defaultValue;
  });
  const stateToUse = {
    ...content?.data?.state,
    ...data,
    ...(locale
      ? {
          locale,
        }
      : {}),
  };
  return {
    ...defaultValues,
    ...stateToUse,
  };
};
const getContentInitialValue = ({ content, data }) => {
  return !content
    ? void 0
    : {
        ...content,
        data: {
          ...content?.data,
          ...data,
        },
        meta: content?.meta,
      };
};
const mergeNewContent = function mergeNewContent2(props, state, elementRef, newContent) {
  state.useContent = {
    ...state.useContent,
    ...newContent,
    data: {
      ...state.useContent?.data,
      ...newContent?.data,
    },
    meta: {
      ...state.useContent?.meta,
      ...newContent?.meta,
      breakpoints: newContent?.meta?.breakpoints || state.useContent?.meta?.breakpoints,
    },
  };
};
const setBreakpoints = function setBreakpoints2(props, state, elementRef, breakpoints) {
  state.useContent = {
    ...state.useContent,
    meta: {
      ...state.useContent?.meta,
      breakpoints,
    },
  };
};
const setContextState = function setContextState2(props, state, elementRef, newState) {
  state.contentState = newState;
};
const processMessage = function processMessage2(props, state, elementRef, event) {
  const { data } = event;
  if (data)
    switch (data.type) {
      case 'builder.configureSdk': {
        const messageContent = data.data;
        const { breakpoints, contentId } = messageContent;
        if (!contentId || contentId !== state.useContent?.id) return;
        if (breakpoints) setBreakpoints(props, state, elementRef, breakpoints);
        state.forceReRenderCount = state.forceReRenderCount + 1;
        break;
      }
      case 'builder.contentUpdate': {
        const messageContent1 = data.data;
        const key =
          messageContent1.key ||
          messageContent1.alias ||
          messageContent1.entry ||
          messageContent1.modelName;
        const contentData = messageContent1.data;
        if (key === props.model) {
          mergeNewContent(props, state, elementRef, contentData);
          state.forceReRenderCount = state.forceReRenderCount + 1;
        }
        break;
      }
    }
};
const evaluateJsCode = function evaluateJsCode2(props, state, elementRef) {
  const jsCode = state.useContent?.data?.jsCode;
  if (jsCode)
    evaluate({
      code: jsCode,
      context: props.context || {},
      state: state.contentState,
    });
};
const onClick = function onClick22(props, state, elementRef, event) {
  if (state.useContent) {
    const variationId = state.useContent?.testVariationId;
    const contentId = state.useContent?.id;
    _track({
      type: 'click',
      canTrack: state.canTrackToUse,
      contentId,
      apiKey: props.apiKey,
      variationId: variationId !== contentId ? variationId : void 0,
      ...getInteractionPropertiesForEvent(event),
      unique: !state.clicked,
    });
  }
  if (!state.clicked) state.clicked = true;
};
const evalExpression = function evalExpression2(props, state, elementRef, expression) {
  return expression.replace(/{{([^}]+)}}/g, (_match, group) =>
    evaluate({
      code: group,
      context: props.context || {},
      state: state.contentState,
    })
  );
};
const handleRequest = function handleRequest2(props, state, elementRef, { url, key }) {
  fetch$1(url)
    .then((response) => response.json())
    .then((json) => {
      const newState = {
        ...state.contentState,
        [key]: json,
      };
      setContextState(props, state, elementRef, newState);
    })
    .catch((err) => {
      console.log('error fetching dynamic data', url, err);
    });
};
const runHttpRequests = function runHttpRequests2(props, state, elementRef) {
  const requests = state.useContent?.data?.httpRequests ?? {};
  Object.entries(requests).forEach(([key, url]) => {
    if (url && (!state.httpReqsData[key] || isEditing())) {
      const evaluatedUrl = evalExpression(props, state, elementRef, url);
      handleRequest(props, state, elementRef, {
        url: evaluatedUrl,
        key,
      });
    }
  });
};
const emitStateUpdate = function emitStateUpdate2(props, state, elementRef) {
  if (isEditing())
    window.dispatchEvent(
      new CustomEvent('builder:component:stateChange', {
        detail: {
          state: state.contentState,
          ref: {
            name: props.model,
          },
        },
      })
    );
};
const RenderContent = /* @__PURE__ */ componentQrl(
  inlinedQrl((props) => {
    const elementRef = useRef();
    const state = useStore({
      allRegisteredComponents: [
        ...getDefaultRegisteredComponents(),
        ...components,
        ...(props.customComponents || []),
      ].reduce(
        (acc, curr) => ({
          ...acc,
          [curr.name]: curr,
        }),
        {}
      ),
      canTrackToUse: checkIsDefined(props.canTrack) ? props.canTrack : true,
      clicked: false,
      contentState: getContextStateInitialValue({
        content: props.content,
        data: props.data,
        locale: props.locale,
      }),
      forceReRenderCount: 0,
      httpReqsData: {},
      overrideContent: null,
      update: 0,
      useContent: getContentInitialValue({
        content: props.content,
        data: props.data,
      }),
    });
    useContextProvider(
      builderContext,
      useStore({
        content: state.useContent,
        state: state.contentState,
        context: props.context || {},
        apiKey: props.apiKey,
        registeredComponents: state.allRegisteredComponents,
      })
    );
    useClientEffectQrl(
      inlinedQrl(
        () => {
          const [elementRef2, props2, state2] = useLexicalScope();
          if (!props2.apiKey)
            console.error(
              '[Builder.io]: No API key provided to `RenderContent` component. This can cause issues. Please provide an API key using the `apiKey` prop.'
            );
          if (isBrowser()) {
            if (isEditing()) {
              state2.forceReRenderCount = state2.forceReRenderCount + 1;
              registerInsertMenu();
              setupBrowserForEditing({
                ...(props2.locale
                  ? {
                      locale: props2.locale,
                    }
                  : {}),
                ...(props2.includeRefs
                  ? {
                      includeRefs: props2.includeRefs,
                    }
                  : {}),
              });
              Object.values(state2.allRegisteredComponents).forEach((registeredComponent) => {
                const message = createRegisterComponentMessage(registeredComponent);
                window.parent?.postMessage(message, '*');
              });
              window.addEventListener(
                'message',
                processMessage.bind(null, props2, state2, elementRef2)
              );
              window.addEventListener(
                'builder:component:stateChangeListenerActivated',
                emitStateUpdate.bind(null, props2, state2, elementRef2)
              );
            }
            if (state2.useContent) {
              const variationId = state2.useContent?.testVariationId;
              const contentId = state2.useContent?.id;
              _track({
                type: 'impression',
                canTrack: state2.canTrackToUse,
                contentId,
                apiKey: props2.apiKey,
                variationId: variationId !== contentId ? variationId : void 0,
              });
            }
            if (isPreviewing()) {
              const searchParams = new URL(location.href).searchParams;
              const searchParamPreview = searchParams.get('builder.preview');
              const previewApiKey = searchParams.get('apiKey') || searchParams.get('builder.space');
              if (searchParamPreview === props2.model && previewApiKey === props2.apiKey)
                getContent({
                  model: props2.model,
                  apiKey: props2.apiKey,
                }).then((content) => {
                  if (content) mergeNewContent(props2, state2, elementRef2, content);
                });
            }
            evaluateJsCode(props2, state2);
            runHttpRequests(props2, state2, elementRef2);
            emitStateUpdate(props2, state2);
          }
        },
        'RenderContent_component_useClientEffect_cA0sVHIkr5g',
        [elementRef, props, state]
      )
    );
    useTaskQrl(
      inlinedQrl(
        ({ track: track2 }) => {
          const [elementRef2, props2, state2] = useLexicalScope();
          track2(() => state2.useContent?.data?.jsCode);
          track2(() => state2.contentState);
          evaluateJsCode(props2, state2);
        },
        'RenderContent_component_useTask_Kulmlf9pM08',
        [elementRef, props, state]
      )
    );
    useTaskQrl(
      inlinedQrl(
        ({ track: track2 }) => {
          const [elementRef2, props2, state2] = useLexicalScope();
          track2(() => state2.useContent?.data?.httpRequests);
          runHttpRequests(props2, state2, elementRef2);
        },
        'RenderContent_component_useTask_1_X59YMGOetns',
        [elementRef, props, state]
      )
    );
    useTaskQrl(
      inlinedQrl(
        ({ track: track2 }) => {
          const [elementRef2, props2, state2] = useLexicalScope();
          track2(() => state2.contentState);
          emitStateUpdate(props2, state2);
        },
        'RenderContent_component_useTask_2_u3gn3Pj2b2s',
        [elementRef, props, state]
      )
    );
    useCleanupQrl(
      inlinedQrl(
        () => {
          const [elementRef2, props2, state2] = useLexicalScope();
          if (isBrowser()) {
            window.removeEventListener(
              'message',
              processMessage.bind(null, props2, state2, elementRef2)
            );
            window.removeEventListener(
              'builder:component:stateChangeListenerActivated',
              emitStateUpdate.bind(null, props2, state2, elementRef2)
            );
          }
        },
        'RenderContent_component_useCleanup_FwcO310HVAI',
        [elementRef, props, state]
      )
    );
    return /* @__PURE__ */ jsx(
      Fragment,
      {
        children: state.useContent
          ? /* @__PURE__ */ jsxs('div', {
              ref: elementRef,
              onClick$: inlinedQrl(
                (event) => {
                  const [elementRef2, props2, state2] = useLexicalScope();
                  return onClick(props2, state2, elementRef2, event);
                },
                'RenderContent_component__Fragment_div_onClick_wLg5o3ZkpC0',
                [elementRef, props, state]
              ),
              'builder-content-id': state.useContent?.id,
              get 'builder-model'() {
                return props.model;
              },
              children: [
                /* @__PURE__ */ jsx(
                  RenderContentStyles,
                  {
                    contentId: state.useContent?.id,
                    cssCode: state.useContent?.data?.cssCode,
                    customFonts: state.useContent?.data?.customFonts,
                  },
                  '03_0'
                ),
                /* @__PURE__ */ jsx(
                  RenderBlocks,
                  {
                    blocks: state.useContent?.data?.blocks,
                  },
                  state.forceReRenderCount
                ),
              ],
              [_IMMUTABLE]: {
                'builder-model': _wrapSignal(props, 'model'),
                children: false,
              },
            })
          : null,
        [_IMMUTABLE]: {
          children: false,
        },
      },
      '03_1'
    );
  }, 'RenderContent_component_hEAI0ahViXM')
);
const RenderContent$1 = RenderContent;
const settings = {};
function setEditorSettings(newSettings) {
  if (isBrowser()) {
    Object.assign(settings, newSettings);
    const message = {
      type: 'builder.settingsChange',
      data: settings,
    };
    parent.postMessage(message, '*');
  }
}
export {
  Button,
  Columns,
  FragmentComponent as Fragment,
  Image,
  RenderBlocks,
  RenderContent$1 as RenderContent,
  SectionComponent as Section,
  Symbol$1 as Symbol,
  Text,
  Video,
  components,
  convertSearchParamsToQueryObject,
  createRegisterComponentMessage,
  getAllContent,
  getBuilderSearchParams,
  getBuilderSearchParamsFromWindow,
  getContent,
  isEditing,
  isPreviewing,
  normalizeSearchParams,
  register,
  registerComponent,
  setEditorSettings,
  track,
};
