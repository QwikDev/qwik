/**
 * @license
 * @builder.io/qwik
 * Copyright Builder.io, Inc. All Rights Reserved.
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
 'use strict';


 if (typeof globalThis == 'undefined') {
   const g = 'undefined' != typeof global ? global : 'undefined' != typeof window ? window : 'undefined' != typeof self ? self : {};
   g.globalThis = g;
 }
 globalThis.qwikCore = (function (exports) {
 
 Object.defineProperty(exports, '__esModule', { value: true });
 
 function _interopNamespace(e) {
     if (e && e.__esModule) return e;
     var n = Object.create(null);
     if (e) {
         Object.keys(e).forEach(function (k) {
             if (k !== 'default') {
                 var d = Object.getOwnPropertyDescriptor(e, k);
                 Object.defineProperty(n, k, d.get ? d : {
                     enumerable: true,
                     get: function () { return e[k]; }
                 });
             }
         });
     }
     n["default"] = e;
     return Object.freeze(n);
 }
 
 // minification can replace the `globalThis.qDev` with `false`
 // which will remove all dev code within from the build
 const qDev = true;
 const qTest = globalThis.describe !== undefined;
 
 const EMPTY_ARRAY = [];
 const EMPTY_OBJ = {};
 if (qDev) {
     Object.freeze(EMPTY_ARRAY);
     Object.freeze(EMPTY_OBJ);
 }
 
 const STYLE = qDev
     ? `background: #564CE0; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;`
     : '';
 const logError = (message, ...optionalParams) => {
     // eslint-disable-next-line no-console
     console.error('%cQWIK ERROR', STYLE, message, ...optionalParams);
 };
 const logWarn = (message, ...optionalParams) => {
     // eslint-disable-next-line no-console
     console.warn('%cQWIK WARN', STYLE, message, ...optionalParams);
 };
 const logDebug = (message, ...optionalParams) => {
     if (qDev) {
         // eslint-disable-next-line no-console
         console.debug('%cQWIK', STYLE, message, ...optionalParams);
     }
 };
 
 function assertDefined(value, text) {
     if (qDev) {
         if (value != null)
             return;
         throw newError(text || 'Expected defined value.');
     }
 }
 function assertEqual(value1, value2, text) {
     if (qDev) {
         if (value1 === value2)
             return;
         throw newError(text || `Expected '${value1}' === '${value2}'.`);
     }
 }
 function newError(text) {
     debugger; // eslint-disable-line no-debugger
     const error = new Error(text);
     logError(error); // eslint-disable-line no-console
     return error;
 }
 
 /**
  * State factory of the component.
  */
 /**
  * State factory of the component.
  */
 const QHostAttr = 'q:host';
 const OnRenderProp = 'q:renderFn';
 /**
  * Component Styles.
  */
 const ComponentScopedStyles = 'q:sstyle';
 /**
  * Component style host prefix
  */
 const ComponentStylesPrefixHost = '💎';
 /**
  * Component style content prefix
  */
 const ComponentStylesPrefixContent = '⭐️';
 /**
  * `<some-element q:slot="...">`
  */
 const QSlotAttr = 'q:slot';
 const QObjAttr = 'q:obj';
 const QSeqAttr = 'q:seq';
 const QContainerAttr = 'q:container';
 const QContainerSelector = '[q\\:container]';
 const RenderEvent = 'qRender';
 const ELEMENT_ID = 'q:id';
 const ELEMENT_ID_PREFIX = '#';
 
 function getDocument(node) {
     if (typeof document !== 'undefined') {
         return document;
     }
     if (node.nodeType === 9) {
         return node;
     }
     let doc = node.ownerDocument;
     while (doc && doc.nodeType !== 9) {
         doc = doc.parentNode;
     }
     assertDefined(doc);
     return doc;
 }
 
 const CONTAINER = Symbol('container');
 function isStyleTask(obj) {
     return obj && typeof obj === 'object' && obj.type === 'style';
 }
 let _context;
 function tryGetInvokeContext() {
     if (!_context) {
         const context = typeof document !== 'undefined' && document && document.__q_context__;
         if (!context) {
             return undefined;
         }
         if (Array.isArray(context)) {
             const element = context[0];
             const hostElement = getHostElement(element);
             assertDefined(element);
             return (document.__q_context__ = newInvokeContext(getDocument(element), hostElement, element, context[1], context[2]));
         }
         return context;
     }
     return _context;
 }
 function getInvokeContext() {
     const ctx = tryGetInvokeContext();
     if (!ctx) {
         throw new Error("Q-ERROR: invoking 'use*()' method outside of invocation context.");
     }
     return ctx;
 }
 function useInvoke(context, fn, ...args) {
     const previousContext = _context;
     let returnValue;
     try {
         _context = context;
         returnValue = fn.apply(null, args);
     }
     finally {
         const currentCtx = _context;
         _context = previousContext;
         if (currentCtx.waitOn && currentCtx.waitOn.length > 0) {
             // eslint-disable-next-line no-unsafe-finally
             return Promise.all(currentCtx.waitOn).then(() => returnValue);
         }
     }
     return returnValue;
 }
 function newInvokeContext(doc, hostElement, element, event, url) {
     return {
         seq: 0,
         doc,
         hostElement,
         element,
         event: event,
         url: url || null,
         qrl: undefined,
     };
 }
 /**
  * @private
  */
 function useWaitOn(promise) {
     const ctx = getInvokeContext();
     (ctx.waitOn || (ctx.waitOn = [])).push(promise);
 }
 function getHostElement(el) {
     let foundSlot = false;
     let node = el;
     while (node) {
         const isHost = node.hasAttribute(QHostAttr);
         const isSlot = node.tagName === 'Q:SLOT';
         if (isHost) {
             if (!foundSlot) {
                 break;
             }
             else {
                 foundSlot = false;
             }
         }
         if (isSlot) {
             foundSlot = true;
         }
         node = node.parentElement;
     }
     return node;
 }
 function getContainer(el) {
     let container = el[CONTAINER];
     if (!container) {
         container = el.closest(QContainerSelector);
         el[CONTAINER] = container;
     }
     return container;
 }
 
 function flattenArray(array, dst) {
     // Yes this function is just Array.flat, but we need to run on old versions of Node.
     if (!dst)
         dst = [];
     for (const item of array) {
         if (Array.isArray(item)) {
             flattenArray(item, dst);
         }
         else {
             dst.push(item);
         }
     }
     return dst;
 }
 
 function isPromise(value) {
     return value instanceof Promise;
 }
 const then = (promise, thenFn) => {
     return isPromise(promise) ? promise.then(thenFn) : thenFn(promise);
 };
 const promiseAll = (promises) => {
     const hasPromise = promises.some(isPromise);
     if (hasPromise) {
         return Promise.all(promises);
     }
     return promises;
 };
 
 function isQrl(value) {
     return value instanceof QRLInternal;
 }
 class QRL {
     constructor(chunk, symbol, symbolRef, symbolFn, capture, captureRef) {
         this.chunk = chunk;
         this.symbol = symbol;
         this.symbolRef = symbolRef;
         this.symbolFn = symbolFn;
         this.capture = capture;
         this.captureRef = captureRef;
         this.canonicalChunk = chunk.replace(FIND_EXT, '');
     }
     setContainer(el) {
         if (!this.el) {
             this.el = el;
         }
     }
     async resolve(el) {
         if (el) {
             this.setContainer(el);
         }
         return qrlImport(this.el, this);
     }
     invokeFn(el, currentCtx) {
         return ((...args) => {
             const fn = (typeof this.symbolRef === 'function' ? this.symbolRef : this.resolve(el));
             return then(fn, (fn) => {
                 if (typeof fn === 'function') {
                     const baseContext = currentCtx ?? newInvokeContext();
                     const context = {
                         ...baseContext,
                         qrl: this,
                     };
                     return useInvoke(context, fn, ...args);
                 }
                 throw new Error('QRL is not a function');
             });
         });
     }
     copy() {
         return new QRLInternal(this.chunk, this.symbol, this.symbolRef, this.symbolFn, null, this.captureRef);
     }
     invoke(...args) {
         const fn = this.invokeFn();
         return fn(...args);
     }
     serialize(options) {
         return stringifyQRL(this, options);
     }
 }
 const QRLInternal = QRL;
 // https://regexr.com/6enjv
 const FIND_EXT = /\?[\w=&]+$/;
 
 const createPlatform = (doc) => {
     const moduleCache = new Map();
     return {
         importSymbol(element, url, symbolName) {
             const urlDoc = toUrl(doc, element, url).toString();
             const urlCopy = new URL(urlDoc);
             urlCopy.hash = '';
             urlCopy.search = '';
             const importURL = urlCopy.href;
             const mod = moduleCache.get(importURL);
             if (mod) {
                 return mod[symbolName];
             }
             return (function (t) { return Promise.resolve().then(function () { return /*#__PURE__*/_interopNamespace(require(t)); }); })(/* @vite-ignore */ importURL).then((mod) => {
                 moduleCache.set(importURL, mod);
                 return mod[symbolName];
             });
         },
         raf: (fn) => {
             return new Promise((resolve) => {
                 requestAnimationFrame(() => {
                     resolve(fn());
                 });
             });
         },
         nextTick: (fn) => {
             return new Promise((resolve) => {
                 setTimeout(() => {
                     resolve(fn());
                 });
             });
         },
         chunkForSymbol() {
             return undefined;
         },
     };
 };
 /**
  * Convert relative base URI and relative URL into a fully qualified URL.
  *
  * @param base -`QRL`s are relative, and therefore they need a base for resolution.
  *    - `Element` use `base.ownerDocument.baseURI`
  *    - `Document` use `base.baseURI`
  *    - `string` use `base` as is
  *    - `QConfig` use `base.baseURI`
  * @param url - relative URL
  * @returns fully qualified URL.
  */
 function toUrl(doc, element, url) {
     const containerEl = getContainer(element);
     const base = new URL(containerEl?.getAttribute('q:base') ?? doc.baseURI, doc.baseURI);
     return new URL(url, base);
 }
 /**
  * @public
  */
 const setPlatform = (doc, plt) => (doc[DocumentPlatform] = plt);
 /**
  * @public
  */
 const getPlatform = (docOrNode) => {
     const doc = getDocument(docOrNode);
     return doc[DocumentPlatform] || (doc[DocumentPlatform] = createPlatform(doc));
 };
 const DocumentPlatform = /*@__PURE__*/ Symbol();
 
 /**
  * @private
  */
 function isHtmlElement(node) {
     return node ? node.nodeType === NodeType.ELEMENT_NODE : false;
 }
 /**
  * `Node.type` enumeration
  */
 var NodeType;
 (function (NodeType) {
     NodeType[NodeType["ELEMENT_NODE"] = 1] = "ELEMENT_NODE";
     NodeType[NodeType["ATTRIBUTE_NODE"] = 2] = "ATTRIBUTE_NODE";
     NodeType[NodeType["TEXT_NODE"] = 3] = "TEXT_NODE";
     NodeType[NodeType["CDATA_SECTION_NODE"] = 4] = "CDATA_SECTION_NODE";
     NodeType[NodeType["PROCESSING_INSTRUCTION_NODE"] = 7] = "PROCESSING_INSTRUCTION_NODE";
     // document, such as <?xml-stylesheet … ?>.
     NodeType[NodeType["COMMENT_NODE"] = 8] = "COMMENT_NODE";
     NodeType[NodeType["DOCUMENT_NODE"] = 9] = "DOCUMENT_NODE";
     NodeType[NodeType["DOCUMENT_TYPE_NODE"] = 10] = "DOCUMENT_TYPE_NODE";
     NodeType[NodeType["DOCUMENT_FRAGMENT_NODE"] = 11] = "DOCUMENT_FRAGMENT_NODE";
 })(NodeType || (NodeType = {}));
 
 function stringifyDebug(value) {
     if (value == null)
         return String(value);
     if (typeof value === 'function')
         return value.name;
     if (isHtmlElement(value))
         return stringifyElement(value);
     if (value instanceof URL)
         return String(value);
     if (typeof value === 'object')
         return JSON.stringify(value, function (key, value) {
             if (isHtmlElement(value))
                 return stringifyElement(value);
             return value;
         });
     return String(value);
 }
 function stringifyElement(element) {
     let html = '<' + element.localName;
     const attributes = element.attributes;
     const names = [];
     for (let i = 0; i < attributes.length; i++) {
         names.push(attributes[i].name);
     }
     names.sort();
     for (let i = 0; i < names.length; i++) {
         const name = names[i];
         let value = element.getAttribute(name);
         if (value?.startsWith('file:/')) {
             value = value.replace(/(file:\/\/).*(\/.*)$/, (all, protocol, file) => protocol + '...' + file);
         }
         html +=
             ' ' + name + (value == null || value == '' ? '' : "='" + value.replace("'", '&apos;') + "'");
     }
     return html + '>';
 }
 
 var QError;
 (function (QError) {
     // core 000-099
     QError[QError["TODO"] = 0] = "TODO";
     QError[QError["Core_qConfigNotFound_path"] = 1] = "Core_qConfigNotFound_path";
     QError[QError["Core_unrecognizedStack_frame"] = 2] = "Core_unrecognizedStack_frame";
     QError[QError["Core_noAttribute_atr1_element"] = 3] = "Core_noAttribute_atr1_element";
     QError[QError["Core_noAttribute_atr1_attr2_element"] = 4] = "Core_noAttribute_atr1_attr2_element";
     QError[QError["Core_missingProperty_name_props"] = 5] = "Core_missingProperty_name_props";
     QError[QError["Core_missingExport_name_url_props"] = 6] = "Core_missingExport_name_url_props";
     // QRL 100-199
     QError[QError["QRL_expectFunction_url_actual"] = 100] = "QRL_expectFunction_url_actual";
     // Injection 200-299
     QError[QError["Injector_noHost_element"] = 200] = "Injector_noHost_element";
     QError[QError["Injector_expectedSpecificInjector_expected_actual"] = 201] = "Injector_expectedSpecificInjector_expected_actual";
     QError[QError["Injector_notElement_arg"] = 202] = "Injector_notElement_arg";
     QError[QError["Injector_wrongMethodThis_expected_actual"] = 203] = "Injector_wrongMethodThis_expected_actual";
     QError[QError["Injector_missingSerializedState_entityKey_element"] = 204] = "Injector_missingSerializedState_entityKey_element";
     QError[QError["Injector_notFound_element"] = 206] = "Injector_notFound_element";
     QError[QError["Injector_eventInjectorNotSerializable"] = 207] = "Injector_eventInjectorNotSerializable";
     // Entities 300-399
     QError[QError["Entity_notValidKey_key"] = 300] = "Entity_notValidKey_key";
     QError[QError["Entity_keyAlreadyExists_key"] = 301] = "Entity_keyAlreadyExists_key";
     QError[QError["Entity_invalidAttribute_name"] = 303] = "Entity_invalidAttribute_name";
     QError[QError["Entity_missingExpandoOrState_attrName"] = 304] = "Entity_missingExpandoOrState_attrName";
     QError[QError["Entity_elementMissingEntityAttr_element_attr"] = 305] = "Entity_elementMissingEntityAttr_element_attr";
     QError[QError["Entity_noState_entity_props"] = 306] = "Entity_noState_entity_props";
     QError[QError["Entity_expected_obj"] = 307] = "Entity_expected_obj";
     QError[QError["Entity_overridesConstructor_entity"] = 308] = "Entity_overridesConstructor_entity";
     QError[QError["Entity_keyMissingParts_key_key"] = 309] = "Entity_keyMissingParts_key_key";
     QError[QError["Entity_no$type_entity"] = 310] = "Entity_no$type_entity";
     QError[QError["Entity_no$keyProps_entity"] = 311] = "Entity_no$keyProps_entity";
     QError[QError["Entity_no$qrl_entity"] = 312] = "Entity_no$qrl_entity";
     QError[QError["Entity_nameCollision_name_currentQrl_expectedQrl"] = 313] = "Entity_nameCollision_name_currentQrl_expectedQrl";
     QError[QError["Entity_keyTooManyParts_entity_parts_key"] = 314] = "Entity_keyTooManyParts_entity_parts_key";
     QError[QError["Entity_keyNameMismatch_key_name_entity_name"] = 315] = "Entity_keyNameMismatch_key_name_entity_name";
     QError[QError["Entity_stateMissingKey_state"] = 316] = "Entity_stateMissingKey_state";
     // Component 400-499
     QError[QError["Component_bindNeedsKey"] = 400] = "Component_bindNeedsKey";
     QError[QError["Component_bindNeedsValue"] = 401] = "Component_bindNeedsValue";
     QError[QError["Component_needsState"] = 402] = "Component_needsState";
     QError[QError["Component_needsInjectionContext_constructor"] = 403] = "Component_needsInjectionContext_constructor";
     QError[QError["Component_noProperty_propName_props_host"] = 404] = "Component_noProperty_propName_props_host";
     QError[QError["Component_notFound_component"] = 405] = "Component_notFound_component";
     QError[QError["Component_doesNotMatch_component_actual"] = 406] = "Component_doesNotMatch_component_actual";
     QError[QError["Component_noState_component_props"] = 408] = "Component_noState_component_props";
     // Provider 500-599
     QError[QError["Provider_unrecognizedFormat_value"] = 500] = "Provider_unrecognizedFormat_value";
     // Render 600-699
     QError[QError["Render_unexpectedJSXNodeType_type"] = 600] = "Render_unexpectedJSXNodeType_type";
     QError[QError["Render_unsupportedFormat_obj_attr"] = 601] = "Render_unsupportedFormat_obj_attr";
     QError[QError["Render_expectingEntity_entity"] = 602] = "Render_expectingEntity_entity";
     QError[QError["Render_expectingEntityArray_obj"] = 603] = "Render_expectingEntityArray_obj";
     QError[QError["Render_expectingEntityOrComponent_obj"] = 604] = "Render_expectingEntityOrComponent_obj";
     QError[QError["Render_stateMachineStuck"] = 699] = "Render_stateMachineStuck";
     // Event
     QError[QError["Event_emitEventRequiresName_url"] = 700] = "Event_emitEventRequiresName_url";
     QError[QError["Event_emitEventCouldNotFindListener_event_element"] = 701] = "Event_emitEventCouldNotFindListener_event_element";
 })(QError || (QError = {}));
 function qError(code, ...args) {
     if (qDev) {
         const text = codeToText(code);
         const parts = text.split('{}');
         const error = parts
             .map((value, index) => {
             return value + (index === parts.length - 1 ? '' : stringifyDebug(args[index]));
         })
             .join('');
         debugger; // eslint-disable-line no-debugger
         return new Error(error);
     }
     else {
         return new Error(`QError ` + code);
     }
 }
 function codeToText(code) {
     const area = {
         0: 'ERROR',
         1: 'QRL-ERROR',
         2: 'INJECTOR-ERROR',
         3: 'SERVICE-ERROR',
         4: 'COMPONENT-ERROR',
         5: 'PROVIDER-ERROR',
         6: 'RENDER-ERROR',
         7: 'EVENT-ERROR',
     }[Math.floor(code / 100)];
     const text = {
         [QError.TODO]: '{}',
         [QError.Core_qConfigNotFound_path]: "QConfig not found in path '{}'.",
         [QError.Core_unrecognizedStack_frame]: "Unrecognized stack format '{}'",
         [QError.Core_noAttribute_atr1_element]: "Could not find entity state '{}' at '{}' or any of it's parents.",
         [QError.Core_noAttribute_atr1_attr2_element]: "Could not find entity state '{}' ( or entity provider '{}') at '{}' or any of it's parents.",
         [QError.Core_missingProperty_name_props]: "Missing property '{}' in props '{}'.",
         [QError.Core_missingExport_name_url_props]: "Missing export '{}' from '{}'. Exported symbols are: {}",
         //////////////
         [QError.QRL_expectFunction_url_actual]: "QRL '${}' should point to function, was '{}'.",
         //////////////
         [QError.Injector_noHost_element]: "Can't find host element above '{}'.",
         [QError.Injector_expectedSpecificInjector_expected_actual]: "Provider is expecting '{}' but got '{}'.",
         [QError.Injector_notElement_arg]: "Expected 'Element' was '{}'.",
         [QError.Injector_wrongMethodThis_expected_actual]: "Expected injection 'this' to be of type '{}', but was of type '{}'.",
         [QError.Injector_missingSerializedState_entityKey_element]: "Entity key '{}' is found on '{}' but does not contain state. Was 'serializeState()' not run during dehydration?",
         [QError.Injector_notFound_element]: "No injector can be found starting at '{}'.",
         [QError.Injector_eventInjectorNotSerializable]: 'EventInjector does not support serialization.',
         //////////////
         [QError.Entity_notValidKey_key]: "Data key '{}' is not a valid key.\n" +
             '  - Data key can only contain characters (preferably lowercase) or number\n' +
             '  - Data key is prefixed with entity name\n' +
             "  - Data key is made up from parts that are separated with ':'.",
         [QError.Entity_keyAlreadyExists_key]: "A entity with key '{}' already exists.",
         [QError.Entity_invalidAttribute_name]: "'{}' is not a valid attribute. " +
             "Attributes can only contain 'a-z' (lowercase), '0-9', '-' and '_'.",
         [QError.Entity_missingExpandoOrState_attrName]: "Found '{}' but expando did not have entity and attribute did not have state.",
         [QError.Entity_elementMissingEntityAttr_element_attr]: "Element '{}' is missing entity attribute definition '{}'.",
         [QError.Entity_noState_entity_props]: "Unable to create state for entity '{}' with props '{}' because no state found and '$newState()' method was not defined on entity.",
         [QError.Entity_expected_obj]: "'{}' is not an instance of 'Entity'.",
         [QError.Entity_overridesConstructor_entity]: "'{}' overrides 'constructor' property preventing 'EntityType' retrieval.",
         [QError.Entity_no$keyProps_entity]: "Entity '{}' does not define '$keyProps'.",
         [QError.Entity_no$type_entity]: "Entity '{}' must have static '$type' property defining the name of the entity.",
         [QError.Entity_no$qrl_entity]: "Entity '{}' must have static '$qrl' property defining the import location of the entity.",
         [QError.Entity_nameCollision_name_currentQrl_expectedQrl]: "Name collision. Already have entity named '{}' with QRL '{}' but expected QRL '{}'.",
         [QError.Entity_keyMissingParts_key_key]: "Entity key '{}' is missing values. Expecting '{}:someValue'.",
         [QError.Entity_keyTooManyParts_entity_parts_key]: "Entity '{}' defines '$keyProps' as  '{}'. Actual key '{}' has more parts than entity defines.",
         [QError.Entity_keyNameMismatch_key_name_entity_name]: "Key '{}' belongs to entity named '{}', but expected entity '{}' with name '{}'.",
         [QError.Entity_stateMissingKey_state]: "Entity state is missing '$key'. Are you sure you passed in state? Got '{}'.",
         //////////////
         [QError.Component_bindNeedsKey]: "'bind:' must have an key. (Example: 'bind:key=\"propertyName\"').",
         [QError.Component_bindNeedsValue]: "'bind:id' must have a property name. (Example: 'bind:key=\"propertyName\"').",
         [QError.Component_needsState]: "Can't find state on host element.",
         [QError.Component_needsInjectionContext_constructor]: "Components must be instantiated inside an injection context. Use '{}.new(...)' for creation.",
         [QError.Component_noProperty_propName_props_host]: "Property '{}' not found in '{}' on component '{}'.",
         [QError.Component_notFound_component]: "Unable to find '{}' component.",
         [QError.Component_doesNotMatch_component_actual]: "Requesting component type '{}' does not match existing component instance '{}'.",
         [QError.Component_noState_component_props]: "Unable to create state for component '{}' with props '{}' because no state found and '$newState()' method was not defined on component.",
         //////////////
         [QError.Provider_unrecognizedFormat_value]: "Unrecognized expression format '{}'.",
         //////////////
         [QError.Render_unexpectedJSXNodeType_type]: 'Unexpected JSXNode<{}> type.',
         [QError.Render_unsupportedFormat_obj_attr]: "Value '{}' can't be written into '{}' attribute.",
         [QError.Render_expectingEntity_entity]: "Expecting entity object, got '{}'.",
         [QError.Render_expectingEntityArray_obj]: "Expecting array of entities, got '{}'.",
         [QError.Render_expectingEntityOrComponent_obj]: "Expecting Entity or Component got '{}'.",
         [QError.Render_stateMachineStuck]: 'Render state machine did not advance.',
         //////////////
         [QError.Event_emitEventRequiresName_url]: "Missing '$type' attribute in the '{}' url.",
         [QError.Event_emitEventCouldNotFindListener_event_element]: "Re-emitting event '{}' but no listener found at '{}' or any of its parents.",
     }[code];
     let textCode = '000' + code;
     textCode = textCode.slice(-3);
     return `${area}(Q-${textCode}): ${text}`;
 }
 
 function isNode$1(value) {
     return value && typeof value.nodeType == 'number';
 }
 function isDocument(value) {
     return value && value.nodeType == NodeType.DOCUMENT_NODE;
 }
 function isElement(value) {
     return isNode$1(value) && value.nodeType == NodeType.ELEMENT_NODE;
 }
 
 const UNDEFINED_PREFIX = '\u0010';
 const QRL_PREFIX = '\u0011';
 function resumeContainer(containerEl) {
     if (!isContainer(containerEl)) {
         logWarn('Skipping hydration because parent element is not q:container');
         return;
     }
     const doc = getDocument(containerEl);
     const isDocElement = containerEl === doc.documentElement;
     const parentJSON = isDocElement ? doc.body : containerEl;
     const script = getQwikJSON(parentJSON);
     if (!script) {
         logWarn('Skipping hydration qwik/json metadata was not found.');
         return;
     }
     script.remove();
     const map = getProxyMap(doc);
     const meta = JSON.parse(script.textContent || '{}');
     // Collect all elements
     const elements = new Map();
     getNodesInScope(containerEl, hasQId).forEach((el) => {
         const id = el.getAttribute(ELEMENT_ID);
         elements.set(ELEMENT_ID_PREFIX + id, el);
     });
     const getObject = (id) => {
         return getObjectImpl(id, elements, meta.objs, map);
     };
     // Revive proxies with subscriptions into the proxymap
     reviveValues(meta.objs, meta.subs, getObject, map, parentJSON);
     // Rebuild target objects
     for (const obj of meta.objs) {
         reviveNestedObjects(obj, getObject);
     }
     // Walk all elements with q:obj and resume their state
     getNodesInScope(containerEl, hasQObj).forEach((el) => {
         const qobj = el.getAttribute(QObjAttr);
         const seq = el.getAttribute(QSeqAttr);
         const host = el.getAttribute(QHostAttr);
         const ctx = getContext(el);
         // Restore captured objets
         qobj.split(' ').forEach((part) => {
             if (part !== '') {
                 const obj = getObject(part);
                 ctx.refMap.add(obj);
             }
             else if (qDev) {
                 logError('QObj contains empty ref');
             }
         });
         // Restore sequence scoping
         ctx.seq = seq.split(' ').map((part) => strToInt(part));
         if (host) {
             const [props, renderQrl] = host.split(' ').map(strToInt);
             assertDefined(props);
             assertDefined(renderQrl);
             ctx.props = ctx.refMap.get(props);
             ctx.renderQrl = ctx.refMap.get(renderQrl);
         }
     });
     containerEl.setAttribute(QContainerAttr, 'resumed');
     logDebug('Container resumed');
 }
 function snapshotState(containerEl) {
     const doc = getDocument(containerEl);
     const proxyMap = getProxyMap(doc);
     const objSet = new Set();
     const platform = getPlatform(doc);
     const elementToIndex = new Map();
     // Collect all qObjected around the DOM
     const elements = getNodesInScope(containerEl, hasQObj);
     elements.forEach((node) => {
         const props = getContext(node);
         const qMap = props.refMap;
         qMap.array.forEach((v) => {
             collectValue(v, objSet);
         });
     });
     // Convert objSet to array
     const objs = Array.from(objSet);
     objs.sort((a, b) => {
         const isProxyA = proxyMap.has(a) ? 0 : 1;
         const isProxyB = proxyMap.has(b) ? 0 : 1;
         return isProxyA - isProxyB;
     });
     const objToId = new Map();
     let count = 0;
     for (const obj of objs) {
         objToId.set(obj, count);
         count++;
     }
     function getElementID(el) {
         let id = elementToIndex.get(el);
         if (id === undefined) {
             if (el.isConnected) {
                 id = intToStr(elementToIndex.size);
                 el.setAttribute(ELEMENT_ID, id);
                 id = ELEMENT_ID_PREFIX + id;
             }
             else {
                 id = null;
             }
             elementToIndex.set(el, id);
         }
         return id;
     }
     function getObjId(obj) {
         if (obj !== null && typeof obj === 'object') {
             const target = obj[QOjectTargetSymbol];
             const id = objToId.get(normalizeObj(target ?? obj));
             if (id !== undefined) {
                 const proxySuffix = target ? '!' : '';
                 return intToStr(id) + proxySuffix;
             }
             if (!target && isElement(obj)) {
                 return getElementID(obj);
             }
         }
         else {
             const id = objToId.get(normalizeObj(obj));
             if (id !== undefined) {
                 return intToStr(id);
             }
         }
         return null;
     }
     const subs = objs
         .map((obj) => {
         const subs = proxyMap.get(obj)?.[QOjectSubsSymbol];
         if (subs) {
             return Object.fromEntries(Array.from(subs.entries()).map(([sub, set]) => {
                 const id = getObjId(sub);
                 if (id !== null) {
                     return [id, Array.from(set)];
                 }
                 else {
                     return [undefined, undefined];
                 }
             }));
         }
         else {
             return null;
         }
     })
         .filter((a) => !!a);
     const serialize = (value) => {
         return getObjId(value) ?? value;
     };
     const qrlSerializeOptions = {
         platform,
         getObjId,
     };
     const convertedObjs = objs.map((obj) => {
         if (Array.isArray(obj)) {
             return obj.map(serialize);
         }
         else if (obj && typeof obj === 'object') {
             if (isQrl(obj)) {
                 return QRL_PREFIX + stringifyQRL(obj, qrlSerializeOptions);
             }
             const output = {};
             Object.entries(obj).forEach(([key, value]) => {
                 output[key] = serialize(value);
             });
             return output;
         }
         return obj;
     });
     // Write back to the dom
     elements.forEach((node) => {
         const ctx = getContext(node);
         const props = ctx.props;
         const renderQrl = ctx.renderQrl;
         const attribute = ctx.refMap.array
             .map((obj) => {
             const id = getObjId(obj);
             assertDefined(id);
             return id;
         })
             .join(' ');
         node.setAttribute(QObjAttr, attribute);
         const seq = ctx.seq.map((index) => intToStr(index)).join(' ');
         node.setAttribute(QSeqAttr, seq);
         if (props) {
             const objs = [props];
             if (renderQrl) {
                 objs.push(renderQrl);
             }
             node.setAttribute(QHostAttr, objs.map((obj) => ctx.refMap.indexOf(obj)).join(' '));
         }
     });
     // Sanity check of serialized element
     if (qDev) {
         elementToIndex.forEach((value, el) => {
             if (getDocument(el) !== doc) {
                 logWarn('element from different document', value, el.tagName);
             }
             if (!value) {
                 logWarn('unconnected element', el.tagName, '\n');
             }
         });
     }
     return {
         objs: convertedObjs,
         subs,
     };
 }
 function getQwikJSON(parentElm) {
     let child = parentElm.lastElementChild;
     while (child) {
         if (child.tagName === 'SCRIPT' && child.getAttribute('type') === 'qwik/json') {
             return child;
         }
         child = child.previousElementSibling;
     }
     return undefined;
 }
 function getNodesInScope(parent, predicate) {
     const nodes = [];
     walkNodes(nodes, parent, predicate);
     return nodes;
 }
 function walkNodes(nodes, parent, predicate) {
     let child = parent.firstElementChild;
     while (child) {
         if (!isContainer(child)) {
             if (predicate(child)) {
                 nodes.push(child);
             }
             walkNodes(nodes, child, predicate);
         }
         child = child.nextElementSibling;
     }
 }
 function reviveValues(objs, subs, getObject, map, containerEl) {
     for (let i = 0; i < objs.length; i++) {
         const value = objs[i];
         if (typeof value === 'string') {
             if (value === UNDEFINED_PREFIX) {
                 objs[i] = undefined;
             }
             else if (value.startsWith(QRL_PREFIX)) {
                 objs[i] = parseQRL(value.slice(1), containerEl);
             }
         }
         else {
             const sub = subs[i];
             if (sub) {
                 const converted = new Map();
                 Object.entries(sub).forEach((entry) => {
                     const el = getObject(entry[0]);
                     if (!el) {
                         logWarn('QWIK can not revive subscriptions because of missing element ID', entry, value);
                         return;
                     }
                     const set = new Set(entry[1]);
                     converted.set(el, set);
                 });
                 _restoreQObject(value, map, converted);
             }
         }
     }
 }
 function reviveNestedObjects(obj, getObject) {
     if (obj && typeof obj == 'object') {
         if (isQrl(obj)) {
             if (obj.capture && obj.capture.length > 0) {
                 obj.captureRef = obj.capture.map(getObject);
                 obj.capture = null;
             }
             return;
         }
         else if (Array.isArray(obj)) {
             for (let i = 0; i < obj.length; i++) {
                 const value = obj[i];
                 if (typeof value == 'string') {
                     obj[i] = getObject(value);
                 }
                 else {
                     reviveNestedObjects(value, getObject);
                 }
             }
         }
         else if (Object.getPrototypeOf(obj) === Object.prototype) {
             for (const key in obj) {
                 if (Object.prototype.hasOwnProperty.call(obj, key)) {
                     const value = obj[key];
                     if (typeof value == 'string') {
                         obj[key] = getObject(value);
                     }
                     else {
                         reviveNestedObjects(value, getObject);
                     }
                 }
             }
         }
     }
 }
 function getObjectImpl(id, elements, objs, map) {
     if (id.startsWith(ELEMENT_ID_PREFIX)) {
         assertEqual(elements.has(id), true);
         return elements.get(id);
     }
     const index = strToInt(id);
     assertEqual(objs.length > index, true);
     const obj = objs[index];
     const needsProxy = id.endsWith('!');
     if (needsProxy) {
         const finalObj = map.get(obj);
         assertDefined(finalObj);
         return finalObj;
     }
     return obj;
 }
 function normalizeObj(obj) {
     if (obj === undefined || !shouldSerialize(obj)) {
         return UNDEFINED_PREFIX;
     }
     if (obj && typeof obj === 'object') {
         const value = obj[QOjectTargetSymbol] ?? obj;
         return value;
     }
     return obj;
 }
 function collectValue(obj, seen) {
     collectQObjects(obj, seen);
     seen.add(normalizeObj(obj));
 }
 function collectQrl(obj, seen) {
     seen.add(normalizeObj(obj));
     if (obj.captureRef) {
         obj.captureRef.forEach((obj) => collectValue(obj, seen));
     }
 }
 function collectQObjects(obj, seen) {
     if (obj != null) {
         if (typeof obj === 'object') {
             if (!obj[QOjectTargetSymbol] && isElement(obj)) {
                 return;
             }
             if (isQrl(obj)) {
                 collectQrl(obj, seen);
                 return;
             }
             obj = normalizeObj(obj);
         }
         if (typeof obj === 'object') {
             if (seen.has(obj))
                 return;
             seen.add(obj);
             if (Array.isArray(obj)) {
                 for (let i = 0; i < obj.length; i++) {
                     collectQObjects(obj[i], seen);
                 }
             }
             else {
                 for (const key in obj) {
                     if (Object.prototype.hasOwnProperty.call(obj, key)) {
                         collectQObjects(obj[key], seen);
                     }
                 }
             }
         }
         if (typeof obj === 'string') {
             seen.add(obj);
         }
     }
 }
 function isContainer(el) {
     return el.hasAttribute(QContainerAttr);
 }
 function hasQObj(el) {
     return el.hasAttribute(QObjAttr);
 }
 function hasQId(el) {
     return el.hasAttribute(ELEMENT_ID);
 }
 const intToStr = (nu) => {
     return nu.toString(36);
 };
 const strToInt = (nu) => {
     return parseInt(nu, 36);
 };
 
 function newQObjectMap(element) {
     const array = [];
     let added = element.hasAttribute(QObjAttr);
     return {
         array,
         get(index) {
             return array[index];
         },
         indexOf(obj) {
             const index = array.indexOf(obj);
             return index === -1 ? undefined : index;
         },
         add(object) {
             const index = array.indexOf(object);
             if (index === -1) {
                 array.push(object);
                 if (!added) {
                     element.setAttribute(QObjAttr, '');
                     added = true;
                 }
                 return array.length - 1;
             }
             return index;
         },
     };
 }
 
 // TODO(misko): need full object parsing /serializing
 function qDeflate(obj, hostCtx) {
     return String(hostCtx.refMap.add(obj));
 }
 function qInflate(ref, hostCtx) {
     const int = parseInt(ref, 10);
     const obj = hostCtx.refMap.get(int);
     assertEqual(hostCtx.refMap.array.length > int, true);
     return obj;
 }
 
 function fromCamelToKebabCase(text) {
     return text.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
 }
 
 function debugStringify(value) {
     if (value != null && typeof value == 'object') {
         return String(value.constructor.name) + '\n' + safeJSONStringify(value);
     }
     return String(value);
 }
 function safeJSONStringify(value) {
     try {
         return JSON.stringify(value, null, '  ');
     }
     catch (e) {
         return String(e);
     }
 }
 
 const ON_PROP_REGEX = /^on([A-Z]|-.).*Qrl$/;
 const ON$_PROP_REGEX = /^on([A-Z]|-.).*\$$/;
 function isOnProp(prop) {
     return ON_PROP_REGEX.test(prop);
 }
 function isOn$Prop(prop) {
     return ON$_PROP_REGEX.test(prop);
 }
 function qPropWriteQRL(rctx, ctx, prop, value) {
     if (!value) {
         return;
     }
     if (typeof value == 'string') {
         value = parseQRL(value, ctx.element);
     }
     const existingQRLs = getExistingQRLs(ctx, prop);
     if (Array.isArray(value)) {
         value.forEach((value) => qPropWriteQRL(rctx, ctx, prop, value));
     }
     else if (isQrl(value)) {
         const cp = value.copy();
         cp.setContainer(ctx.element);
         const capture = cp.capture;
         if (capture == null) {
             // we need to serialize the lexical scope references
             const captureRef = cp.captureRef;
             cp.capture =
                 captureRef && captureRef.length ? captureRef.map((ref) => qDeflate(ref, ctx)) : EMPTY_ARRAY;
         }
         // Important we modify the array as it is cached.
         for (let i = 0; i < existingQRLs.length; i++) {
             const qrl = existingQRLs[i];
             if (!isPromise(qrl) && qrl.canonicalChunk === cp.canonicalChunk && qrl.symbol === cp.symbol) {
                 existingQRLs.splice(i, 1);
                 i--;
             }
         }
         existingQRLs.push(cp);
     }
     else if (isPromise(value)) {
         const writePromise = value.then((qrl) => {
             existingQRLs.splice(existingQRLs.indexOf(writePromise), 1);
             qPropWriteQRL(rctx, ctx, prop, qrl);
             return qrl;
         });
         existingQRLs.push(writePromise);
     }
     else {
         // TODO(misko): Test/better text
         throw qError(QError.TODO, `Not QRLInternal: prop: ${prop}; value: ` + value);
     }
     const kebabProp = fromCamelToKebabCase(prop);
     const newValue = serializeQRLs(existingQRLs, ctx);
     if (ctx.element.getAttribute(kebabProp) !== newValue) {
         if (rctx) {
             setAttribute(rctx, ctx.element, kebabProp, newValue);
         }
         else {
             ctx.element.setAttribute(kebabProp, newValue);
         }
     }
 }
 function getExistingQRLs(ctx, prop) {
     const key = 'event:' + prop;
     let parts = ctx.cache.get(key);
     if (!parts) {
         const attrName = fromCamelToKebabCase(prop);
         parts = [];
         (ctx.element.getAttribute(attrName) || '').split('\n').forEach((qrl) => {
             if (qrl) {
                 parts.push(parseQRL(qrl, ctx.element));
             }
         });
         ctx.cache.set(key, parts);
     }
     return parts;
 }
 function serializeQRLs(existingQRLs, ctx) {
     const platform = getPlatform(getDocument(ctx.element));
     const element = ctx.element;
     const opts = {
         platform,
         element,
     };
     return existingQRLs
         .map((qrl) => (isPromise(qrl) ? '' : stringifyQRL(qrl, opts)))
         .filter((v) => !!v)
         .join('\n');
 }
 
 Error.stackTraceLimit = 9999;
 const Q_CTX = '__ctx__';
 function resumeIfNeeded(containerEl) {
     const isResumed = containerEl.getAttribute(QContainerAttr);
     if (isResumed === 'paused') {
         resumeContainer(containerEl);
     }
 }
 function getContext(element) {
     let ctx = element[Q_CTX];
     if (!ctx) {
         const cache = new Map();
         element[Q_CTX] = ctx = {
             element,
             cache,
             refMap: newQObjectMap(element),
             dirty: false,
             seq: [],
             props: undefined,
             renderQrl: undefined,
             component: undefined,
         };
     }
     return ctx;
 }
 const PREFIXES = ['onWindow', 'onWindow', 'on'];
 function normalizeOnProp(prop) {
     let scope = 'on';
     for (const prefix of PREFIXES) {
         if (prop.startsWith(prefix)) {
             scope = prefix;
             prop = prop.slice(prefix.length);
         }
     }
     if (prop.startsWith('-')) {
         prop = prop.slice(1);
     }
     else {
         prop = prop.toLowerCase();
     }
     return `${scope}:${prop}`;
 }
 function setEvent(rctx, ctx, prop, value) {
     qPropWriteQRL(rctx, ctx, normalizeOnProp(prop), value);
 }
 function getProps(ctx) {
     if (!ctx.props) {
         ctx.props = readWriteProxy({}, getProxyMap(getDocument(ctx.element)));
         ctx.refMap.add(ctx.props);
     }
     return ctx.props;
 }
 
 /**
  * Place at the root of the component View to allow binding of attributes on the Host element.
  *
  * ```
  * <Host someAttr={someExpr} someAttrStatic="value">
  *   View content implementation.
  * </Host>
  * ```
  *
  * Qwik requires that components have [docs/HOST_ELEMENTS.ts] so that it is possible to have
  * asynchronous loading point. Host element is not owned by the component. At times it is
  * desirable for the component to render additional attributes on the host element. `<Host>`
  * servers that purpose.
  * @public
  */
 const Host = { __brand__: 'host' };
 /**
  * @public
  */
 const SkipRerender = { __brand__: 'skip' };
 
 // <docs markdown="https://hackmd.io/m5DzCi5MTa26LuUj5t3HpQ#$">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fm5DzCi5MTa26LuUj5t3HpQ%3Fboth#$ instead)
 /**
  * Qwik Optimizer marker function.
  *
  * Use `$(...)` to tell Qwik Optimizer to extract the expression in `$(...)` into a lazy-loadable
  * resource referenced by `QRL`.
  *
  * See: `implicit$FirstArg` for additional `____$(...)` rules.
  *
  * In this example `$(...)` is used to capture the callback function of `onmousemove` into
  * lazy-loadable reference. This allows the code to refer to the function without actually
  * loading the function. In this example, the callback function does not get loaded until
  * `mousemove` event fires.
  *
  * ```typescript
  * onDocument(
  *   'mousemove',
  *   $(() => console.log('mousemove'))
  * );
  * ```
  *
  * In this code the Qwik Optimizer detects `$(...)` and transforms the code into:
  *
  * ```typescript
  * // FILE: <current file>
  * onDocument('mousemove', qrl('./chunk-abc.js', 'onMousemove'));
  *
  * // FILE: chunk-abc.js
  * export const onMousemove = () => console.log('mousemove');
  * ```
  *
  * ## Special Rules
  *
  * The Qwik Optimizer places special rules on functions that can be lazy-loaded.
  *
  * 1. The expression of the `$(expression)` function must be importable by the system.
  * (expression shows up in `import` or has `export`)
  * 2. If inlined function then all lexically captured values must be:
  *    - importable (vars shows up in `import` or has `export`)
  *    - const (The capturing process differs from JS capturing in that writing to captured
  * variables does not update them, and therefore writes are forbidden. The best practice is that
  * all captured variables are constants.)
  *    - Must be runtime serializable.
  *
  * ```typescript
  * import { importedFn } from './example';
  *
  * export const greet = () => console.log('greet');
  * function topLevelFn() {}
  *
  * function myCode() {
  *   const store = useStore({});
  *   function localFn() {}
  *   // Valid Examples
  *   $(greet); // greet is importable
  *   $(importedFn); // importedFn is importable
  *   $(() => greet()); // greet is importable;
  *   $(() => importedFn()); // importedFn is importable
  *   $(() => console.log(store)); // store is serializable.
  *
  *   // Compile time errors
  *   $(topLevelFn); // ERROR: `topLevelFn` not importable
  *   $(() => topLevelFn()); // ERROR: `topLevelFn` not importable
  *
  *   // Runtime errors
  *   $(localFn); // ERROR: `localFn` fails serialization
  *   $(() => localFn()); // ERROR: `localFn` fails serialization
  * }
  *
  * ```
  *
  * @param expression - Expression which should be lazy loaded
  * @public
  */
 // </docs>
 function $(expression) {
     return runtimeQrl(expression);
 }
 // <docs markdown="https://hackmd.io/m5DzCi5MTa26LuUj5t3HpQ#implicit$FirstArg">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fm5DzCi5MTa26LuUj5t3HpQ%3Fboth#implicit$FirstArg instead)
 /**
  * Create a `____$(...)` convenience method from `___(...)`.
  *
  * It is very common for functions to take a lazy-loadable resource as a first argument. For this
  * reason, the Qwik Optimizer automatically extracts the first argument from any function which
  * ends in `$`.
  *
  * This means that `foo$(arg0)` and `foo($(arg0))` are equivalent with respect to Qwik Optimizer.
  * The former is just a shorthand for the latter.
  *
  * For example these function call are equivalent:
  *
  * - `component$(() => {...})` is same as `onRender($(() => {...}))`
  *
  * ```typescript
  * export function myApi(callback: QRL<() => void>): void {
  *   // ...
  * }
  *
  * export const myApi$ = implicit$FirstArg(myApi);
  * // type of myApi$: (callback: () => void): void
  *
  * // can be used as:
  * myApi$(() => console.log('callback'));
  *
  * // will be transpiled to:
  * // FILE: <current file>
  * myApi(qrl('./chunk-abc.js', 'callback'));
  *
  * // FILE: chunk-abc.js
  * export const callback = () => console.log('callback');
  * ```
  *
  * @param fn - function that should have its first argument automatically `$`.
  * @public
  */
 // </docs>
 function implicit$FirstArg(fn) {
     return function (first, ...rest) {
         return fn.call(null, $(first), ...rest);
     };
 }
 
 function visitJsxNode(ctx, elm, jsxNode, isSvg) {
     if (jsxNode === undefined) {
         return smartUpdateChildren(ctx, elm, [], 'root', isSvg);
     }
     if (Array.isArray(jsxNode)) {
         return smartUpdateChildren(ctx, elm, jsxNode.flat(), 'root', isSvg);
     }
     else if (jsxNode.type === Host) {
         updateProperties(ctx, getContext(elm), jsxNode.props, isSvg);
         return smartUpdateChildren(ctx, elm, jsxNode.children || [], 'root', isSvg);
     }
     else {
         return smartUpdateChildren(ctx, elm, [jsxNode], 'root', isSvg);
     }
 }
 
 function hashCode(text, hash = 0) {
     if (text.length === 0)
         return hash;
     for (let i = 0; i < text.length; i++) {
         const chr = text.charCodeAt(i);
         hash = (hash << 5) - hash + chr;
         hash |= 0; // Convert to 32bit integer
     }
     return Number(Math.abs(hash)).toString(36);
 }
 
 function styleKey(qStyles) {
     return qStyles && String(hashCode(qStyles.symbol));
 }
 function styleHost(styleId) {
     return styleId && ComponentStylesPrefixHost + styleId;
 }
 function styleContent(styleId) {
     return styleId && ComponentStylesPrefixContent + styleId;
 }
 
 /**
  * @public
  */
 function jsx(type, props, key) {
     return new JSXNodeImpl(type, props, key);
 }
 class JSXNodeImpl {
     constructor(type, props, key = null) {
         this.type = type;
         this.props = props;
         this.children = EMPTY_ARRAY;
         this.text = undefined;
         this.key = null;
         if (key != null) {
             this.key = String(key);
         }
         if (props) {
             const children = processNode(props.children);
             if (children !== undefined) {
                 if (Array.isArray(children)) {
                     this.children = children;
                 }
                 else {
                     this.children = [children];
                 }
             }
         }
     }
 }
 function processNode(node) {
     if (node == null || typeof node === 'boolean') {
         return undefined;
     }
     if (isJSXNode(node)) {
         if (node.type === Host || node.type === SkipRerender) {
             return node;
         }
         else if (typeof node.type === 'function') {
             return processNode(node.type({ ...node.props, children: node.children }, node.key));
         }
         else {
             return node;
         }
     }
     else if (Array.isArray(node)) {
         return node.flatMap(processNode).filter((e) => e != null);
     }
     else if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
         const newNode = new JSXNodeImpl('#text', null, null);
         newNode.text = String(node);
         return newNode;
     }
     else {
         logWarn('Unvalid node, skipping');
         return undefined;
     }
 }
 const isJSXNode = (n) => {
     if (qDev) {
         if (n instanceof JSXNodeImpl) {
             return true;
         }
         if (n && typeof n === 'object' && n.constructor.name === JSXNodeImpl.name) {
             throw new Error(`Duplicate implementations of "JSXNodeImpl" found`);
         }
         return false;
     }
     else {
         return n instanceof JSXNodeImpl;
     }
 };
 /**
  * @public
  */
 const Fragment = (props) => props.children;
 
 const firstRenderComponent = (rctx, ctx) => {
     ctx.element.setAttribute(QHostAttr, '');
     return renderComponent(rctx, ctx);
 };
 const renderComponent = (rctx, ctx) => {
     const hostElement = ctx.element;
     const onRenderQRL = ctx.renderQrl;
     assertDefined(onRenderQRL);
     // Component is not dirty any more
     ctx.dirty = false;
     rctx.globalState.hostsStaging.delete(hostElement);
     // Invoke render hook
     const invocatinContext = newInvokeContext(rctx.doc, hostElement, hostElement, RenderEvent);
     invocatinContext.subscriber = hostElement;
     const waitOn = (invocatinContext.waitOn = []);
     // Clean current subscription before render
     ctx.refMap.array.forEach((obj) => {
         removeSub(obj, hostElement);
     });
     const onRenderFn = onRenderQRL.invokeFn(rctx.containerEl, invocatinContext);
     // Execution of the render function
     const renderPromise = onRenderFn(wrapSubscriber(getProps(ctx), hostElement));
     // Wait for results
     return then(renderPromise, (jsxNode) => {
         rctx.hostElements.add(hostElement);
         const waitOnPromise = promiseAll(waitOn);
         return then(waitOnPromise, (waitOnResolved) => {
             waitOnResolved.forEach((task) => {
                 if (isStyleTask(task)) {
                     appendStyle(rctx, hostElement, task);
                 }
             });
             if (ctx.dirty) {
                 logDebug('Dropping render. State changed during render.');
                 return renderComponent(rctx, ctx);
             }
             let componentCtx = ctx.component;
             if (!componentCtx) {
                 componentCtx = ctx.component = {
                     hostElement,
                     slots: [],
                     styleHostClass: undefined,
                     styleClass: undefined,
                     styleId: undefined,
                 };
                 const scopedStyleId = hostElement.getAttribute(ComponentScopedStyles) ?? undefined;
                 if (scopedStyleId) {
                     componentCtx.styleId = scopedStyleId;
                     componentCtx.styleHostClass = styleHost(scopedStyleId);
                     componentCtx.styleClass = styleContent(scopedStyleId);
                     hostElement.classList.add(componentCtx.styleHostClass);
                 }
             }
             componentCtx.slots = [];
             const newCtx = {
                 ...rctx,
                 component: componentCtx,
             };
             return visitJsxNode(newCtx, hostElement, processNode(jsxNode), false);
         });
     });
 };
 
 const SVG_NS = 'http://www.w3.org/2000/svg';
 function smartUpdateChildren(ctx, elm, ch, mode, isSvg) {
     if (ch.length === 1 && ch[0].type === SkipRerender) {
         if (elm.firstChild !== null) {
             return;
         }
         ch = ch[0].children;
     }
     const oldCh = getChildren(elm, mode);
     if (oldCh.length > 0 && ch.length > 0) {
         return updateChildren(ctx, elm, oldCh, ch, isSvg);
     }
     else if (ch.length > 0) {
         return addVnodes(ctx, elm, undefined, ch, 0, ch.length - 1, isSvg);
     }
     else if (oldCh.length > 0) {
         return removeVnodes(ctx, elm, oldCh, 0, oldCh.length - 1);
     }
 }
 function updateChildren(ctx, parentElm, oldCh, newCh, isSvg) {
     let oldStartIdx = 0;
     let newStartIdx = 0;
     let oldEndIdx = oldCh.length - 1;
     let oldStartVnode = oldCh[0];
     let oldEndVnode = oldCh[oldEndIdx];
     let newEndIdx = newCh.length - 1;
     let newStartVnode = newCh[0];
     let newEndVnode = newCh[newEndIdx];
     let oldKeyToIdx;
     let idxInOld;
     let elmToMove;
     const results = [];
     while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
         if (oldStartVnode == null) {
             oldStartVnode = oldCh[++oldStartIdx]; // Vnode might have been moved left
         }
         else if (oldEndVnode == null) {
             oldEndVnode = oldCh[--oldEndIdx];
         }
         else if (newStartVnode == null) {
             newStartVnode = newCh[++newStartIdx];
         }
         else if (newEndVnode == null) {
             newEndVnode = newCh[--newEndIdx];
         }
         else if (sameVnode(oldStartVnode, newStartVnode)) {
             results.push(patchVnode(ctx, oldStartVnode, newStartVnode, isSvg));
             oldStartVnode = oldCh[++oldStartIdx];
             newStartVnode = newCh[++newStartIdx];
         }
         else if (sameVnode(oldEndVnode, newEndVnode)) {
             results.push(patchVnode(ctx, oldEndVnode, newEndVnode, isSvg));
             oldEndVnode = oldCh[--oldEndIdx];
             newEndVnode = newCh[--newEndIdx];
         }
         else if (sameVnode(oldStartVnode, newEndVnode)) {
             // Vnode moved right
             results.push(patchVnode(ctx, oldStartVnode, newEndVnode, isSvg));
             insertBefore(ctx, parentElm, oldStartVnode, oldEndVnode.nextSibling);
             oldStartVnode = oldCh[++oldStartIdx];
             newEndVnode = newCh[--newEndIdx];
         }
         else if (sameVnode(oldEndVnode, newStartVnode)) {
             // Vnode moved left
             results.push(patchVnode(ctx, oldEndVnode, newStartVnode, isSvg));
             insertBefore(ctx, parentElm, oldEndVnode, oldStartVnode);
             oldEndVnode = oldCh[--oldEndIdx];
             newStartVnode = newCh[++newStartIdx];
         }
         else {
             if (oldKeyToIdx === undefined) {
                 oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
             }
             idxInOld = oldKeyToIdx[newStartVnode.key];
             if (idxInOld === undefined) {
                 // New element
                 const newElm = createElm(ctx, newStartVnode, isSvg);
                 results.push(then(newElm, (newElm) => {
                     insertBefore(ctx, parentElm, newElm, oldStartVnode);
                 }));
             }
             else {
                 elmToMove = oldCh[idxInOld];
                 if (elmToMove.nodeName !== newStartVnode.type) {
                     const newElm = createElm(ctx, newStartVnode, isSvg);
                     results.push(then(newElm, (newElm) => {
                         insertBefore(ctx, parentElm, newElm, oldStartVnode);
                     }));
                 }
                 else {
                     results.push(patchVnode(ctx, elmToMove, newStartVnode, isSvg));
                     oldCh[idxInOld] = undefined;
                     insertBefore(ctx, parentElm, elmToMove, oldStartVnode);
                 }
             }
             newStartVnode = newCh[++newStartIdx];
         }
     }
     if (newStartIdx <= newEndIdx) {
         const before = newCh[newEndIdx + 1] == null ? undefined : newCh[newEndIdx + 1].elm;
         results.push(addVnodes(ctx, parentElm, before, newCh, newStartIdx, newEndIdx, isSvg));
     }
     let wait = promiseAll(results);
     if (oldStartIdx <= oldEndIdx) {
         wait = then(wait, () => {
             removeVnodes(ctx, parentElm, oldCh, oldStartIdx, oldEndIdx);
         });
     }
     return wait;
 }
 function isComponentNode(node) {
     return node.props && OnRenderProp in node.props;
 }
 function getCh(elm) {
     return Array.from(elm.childNodes).filter(isNode);
 }
 function getChildren(elm, mode) {
     switch (mode) {
         case 'default':
             return getCh(elm);
         case 'slot':
             return getCh(elm).filter(isChildSlot);
         case 'root':
             return getCh(elm).filter(isChildComponent);
         case 'fallback':
             return getCh(elm).filter(isFallback);
     }
 }
 function isNode(elm) {
     return elm.nodeType === 1 || elm.nodeType === 3;
 }
 function isFallback(node) {
     return node.nodeName === 'Q:FALLBACK';
 }
 function isChildSlot(node) {
     return node.nodeName !== 'Q:FALLBACK' && isChildComponent(node);
 }
 function isSlotTemplate(node) {
     return node.nodeName === 'TEMPLATE' && node.hasAttribute(QSlotAttr);
 }
 function isChildComponent(node) {
     return node.nodeName !== 'TEMPLATE' || !node.hasAttribute(QSlotAttr);
 }
 function splitBy(input, condition) {
     const output = {};
     for (const item of input) {
         const key = condition(item);
         const array = output[key] ?? (output[key] = []);
         array.push(item);
     }
     return output;
 }
 function patchVnode(rctx, elm, vnode, isSvg) {
     rctx.perf.visited++;
     vnode.elm = elm;
     const tag = vnode.type;
     if (tag === '#text') {
         if (elm.data !== vnode.text) {
             setProperty(rctx, elm, 'data', vnode.text);
         }
         return;
     }
     if (tag === Host || tag === SkipRerender) {
         return;
     }
     if (!isSvg) {
         isSvg = tag === 'svg';
     }
     let promise;
     const props = vnode.props;
     const ctx = getContext(elm);
     const dirty = updateProperties(rctx, ctx, props, isSvg);
     const isSlot = tag === 'q:slot';
     if (isSvg && vnode.type === 'foreignObject') {
         isSvg = false;
     }
     else if (isSlot) {
         rctx.component.slots.push(vnode);
     }
     const isComponent = isComponentNode(vnode);
     if (dirty) {
         promise = renderComponent(rctx, ctx);
     }
     const ch = vnode.children;
     if (isComponent) {
         return then(promise, () => {
             const slotMaps = getSlots(ctx.component, elm);
             const splittedChidren = splitBy(ch, getSlotName);
             const promises = [];
             // Mark empty slots and remove content
             Object.entries(slotMaps.slots).forEach(([key, slotEl]) => {
                 if (slotEl && !splittedChidren[key]) {
                     const oldCh = getChildren(slotEl, 'slot');
                     if (oldCh.length > 0) {
                         removeVnodes(rctx, slotEl, oldCh, 0, oldCh.length - 1);
                     }
                 }
             });
             // Render into slots
             Object.entries(splittedChidren).forEach(([key, ch]) => {
                 const slotElm = getSlotElement(rctx, slotMaps, elm, key);
                 promises.push(smartUpdateChildren(rctx, slotElm, ch, 'slot', isSvg));
             });
             return then(promiseAll(promises), () => {
                 removeTemplates(rctx, slotMaps);
             });
         });
     }
     const setsInnerHTML = checkInnerHTML(props);
     if (setsInnerHTML) {
         if (qDev && ch.length > 0) {
             logWarn('Node can not have children when innerHTML is set');
         }
         return;
     }
     return then(promise, () => {
         const mode = isSlot ? 'fallback' : 'default';
         return smartUpdateChildren(rctx, elm, ch, mode, isSvg);
     });
 }
 function addVnodes(ctx, parentElm, before, vnodes, startIdx, endIdx, isSvg) {
     const promises = [];
     for (; startIdx <= endIdx; ++startIdx) {
         const ch = vnodes[startIdx];
         assertDefined(ch);
         promises.push(createElm(ctx, ch, isSvg));
     }
     return then(promiseAll(promises), (children) => {
         for (const child of children) {
             insertBefore(ctx, parentElm, child, before);
         }
     });
 }
 function removeVnodes(ctx, parentElm, nodes, startIdx, endIdx) {
     for (; startIdx <= endIdx; ++startIdx) {
         const ch = nodes[startIdx];
         assertDefined(ch);
         removeNode(ctx, ch);
     }
 }
 let refCount = 0;
 const RefSymbol = Symbol();
 function setSlotRef(ctx, hostElm, slotEl) {
     let ref = hostElm[RefSymbol] ?? hostElm.getAttribute('q:sref');
     if (ref === null) {
         ref = intToStr(refCount++);
         hostElm[RefSymbol] = ref;
         setAttribute(ctx, hostElm, 'q:sref', ref);
     }
     slotEl.setAttribute('q:sref', ref);
 }
 function getSlotElement(ctx, slotMaps, parentEl, slotName) {
     const slotEl = slotMaps.slots[slotName];
     if (slotEl) {
         return slotEl;
     }
     const templateEl = slotMaps.templates[slotName];
     if (templateEl) {
         return templateEl.content;
     }
     const template = createTemplate(ctx, slotName);
     prepend(ctx, parentEl, template);
     slotMaps.templates[slotName] = template;
     return template.content;
 }
 function createTemplate(ctx, slotName) {
     const template = createElement(ctx, 'template', false);
     template.setAttribute(QSlotAttr, slotName);
     return template;
 }
 function removeTemplates(ctx, slotMaps) {
     Object.keys(slotMaps.templates).forEach((key) => {
         const template = slotMaps.templates[key];
         if (template && slotMaps.slots[key] !== undefined) {
             removeNode(ctx, template);
             slotMaps.templates[key] = undefined;
         }
     });
 }
 function resolveSlotProjection(ctx, hostElm, before, after) {
     Object.entries(before.slots).forEach(([key, slotEl]) => {
         if (slotEl && !after.slots[key]) {
             // Slot removed
             // Move slot to template
             const template = createTemplate(ctx, key);
             const slotChildren = getChildren(slotEl, 'slot');
             template.content.append(...slotChildren);
             hostElm.insertBefore(template, hostElm.firstChild);
             ctx.operations.push({
                 el: template,
                 operation: 'slot-to-template',
                 args: slotChildren,
                 fn: () => { },
             });
         }
     });
     Object.entries(after.slots).forEach(([key, slotEl]) => {
         if (slotEl && !before.slots[key]) {
             // Slot created
             // Move template to slot
             const template = before.templates[key];
             if (template) {
                 slotEl.appendChild(template.content);
                 template.remove();
                 ctx.operations.push({
                     el: slotEl,
                     operation: 'template-to-slot',
                     args: [template],
                     fn: () => { },
                 });
             }
         }
     });
 }
 function getSlotName(node) {
     return node.props?.['q:slot'] ?? '';
 }
 function createElm(rctx, vnode, isSvg) {
     rctx.perf.visited++;
     const tag = vnode.type;
     if (tag === '#text') {
         return (vnode.elm = createTextNode(rctx, vnode.text));
     }
     if (!isSvg) {
         isSvg = tag === 'svg';
     }
     const props = vnode.props;
     const elm = (vnode.elm = createElement(rctx, tag, isSvg));
     const isComponent = isComponentNode(vnode);
     const ctx = getContext(elm);
     setKey(elm, vnode.key);
     updateProperties(rctx, ctx, props, isSvg);
     if (isSvg && tag === 'foreignObject') {
         isSvg = false;
     }
     const currentComponent = rctx.component;
     if (currentComponent) {
         const styleTag = currentComponent.styleClass;
         if (styleTag) {
             classlistAdd(rctx, elm, styleTag);
         }
         if (tag === 'q:slot') {
             setSlotRef(rctx, currentComponent.hostElement, elm);
             rctx.component.slots.push(vnode);
         }
     }
     let wait;
     if (isComponent) {
         // Run mount hook
         const renderQRL = props[OnRenderProp];
         ctx.renderQrl = renderQRL;
         ctx.refMap.add(renderQRL);
         wait = firstRenderComponent(rctx, ctx);
     }
     else {
         const setsInnerHTML = checkInnerHTML(props);
         if (setsInnerHTML) {
             if (qDev && vnode.children.length > 0) {
                 logWarn('Node can not have children when innerHTML is set');
             }
             return elm;
         }
     }
     return then(wait, () => {
         let children = vnode.children;
         if (children.length > 0) {
             if (children.length === 1 && children[0].type === SkipRerender) {
                 children = children[0].children;
             }
             const slotMap = isComponent ? getSlots(ctx.component, elm) : undefined;
             const promises = children.map((ch) => createElm(rctx, ch, isSvg));
             return then(promiseAll(promises), () => {
                 let parent = elm;
                 for (const node of children) {
                     if (slotMap) {
                         parent = getSlotElement(rctx, slotMap, elm, getSlotName(node));
                     }
                     parent.appendChild(node.elm);
                 }
                 return elm;
             });
         }
         return elm;
     });
 }
 const getSlots = (componentCtx, hostElm) => {
     const slots = {};
     const templates = {};
     const slotRef = hostElm.getAttribute('q:sref');
     const existingSlots = Array.from(hostElm.querySelectorAll(`q\\:slot[q\\:sref="${slotRef}"]`));
     const newSlots = componentCtx?.slots ?? EMPTY_ARRAY;
     const t = Array.from(hostElm.childNodes).filter(isSlotTemplate);
     // Map slots
     for (const elm of existingSlots) {
         slots[elm.getAttribute('name') ?? ''] = elm;
     }
     // Map virtual slots
     for (const vnode of newSlots) {
         slots[vnode.props?.name ?? ''] = vnode.elm;
     }
     // Map templates
     for (const elm of t) {
         templates[elm.getAttribute('q:slot') ?? ''] = elm;
     }
     return { slots, templates };
 };
 const handleStyle = (ctx, elm, _, newValue) => {
     setAttribute(ctx, elm, 'style', stringifyClassOrStyle(newValue, false));
     return true;
 };
 const handleClass = (ctx, elm, _, newValue) => {
     setAttribute(ctx, elm, 'class', stringifyClassOrStyle(newValue, true));
     return true;
 };
 const checkBeforeAssign = (ctx, elm, prop, newValue) => {
     if (prop in elm) {
         if (elm[prop] !== newValue) {
             setProperty(ctx, elm, prop, newValue);
         }
     }
     return true;
 };
 const dangerouslySetInnerHTML = 'dangerouslySetInnerHTML';
 const setInnerHTML = (ctx, elm, _, newValue) => {
     if (dangerouslySetInnerHTML in elm) {
         setProperty(ctx, elm, dangerouslySetInnerHTML, newValue);
     }
     else if ('innerHTML' in elm) {
         setProperty(ctx, elm, 'innerHTML', newValue);
     }
     return true;
 };
 const PROP_HANDLER_MAP = {
     style: handleStyle,
     class: handleClass,
     className: handleClass,
     value: checkBeforeAssign,
     checked: checkBeforeAssign,
     [dangerouslySetInnerHTML]: setInnerHTML,
 };
 const ALLOWS_PROPS = ['class', 'className', 'style', 'id', 'q:slot'];
 const HOST_PREFIX = 'host:';
 function updateProperties(rctx, ctx, expectProps, isSvg) {
     if (!expectProps) {
         return false;
     }
     const elm = ctx.element;
     const qwikProps = OnRenderProp in expectProps ? getProps(ctx) : undefined;
     for (let key of Object.keys(expectProps)) {
         if (key === 'children' || key === OnRenderProp) {
             continue;
         }
         const newValue = expectProps[key];
         if (key === 'ref') {
             newValue.current = elm;
             continue;
         }
         // Early exit if value didnt change
         const oldValue = ctx.cache.get(key);
         if (newValue === oldValue) {
             continue;
         }
         ctx.cache.set(key, newValue);
         // Check of data- or aria-
         if (key.startsWith('data-') || key.startsWith('aria-')) {
             setAttribute(rctx, elm, key, newValue);
             continue;
         }
         if (qwikProps) {
             const skipProperty = ALLOWS_PROPS.includes(key);
             const hPrefixed = key.startsWith(HOST_PREFIX);
             if (!skipProperty && !hPrefixed) {
                 // Qwik props
                 qwikProps[key] = newValue;
                 continue;
             }
             if (hPrefixed) {
                 key = key.slice(HOST_PREFIX.length);
             }
         }
         else if (qDev && key.startsWith(HOST_PREFIX)) {
             logWarn(`${HOST_PREFIX} prefix can not be used in non components`);
             continue;
         }
         if (isOnProp(key)) {
             setEvent(rctx, ctx, key.slice(0, -3), newValue);
             continue;
         }
         if (isOn$Prop(key)) {
             setEvent(rctx, ctx, key.slice(0, -1), $(newValue));
             continue;
         }
         // Check if its an exception
         const exception = PROP_HANDLER_MAP[key];
         if (exception) {
             if (exception(rctx, elm, key, newValue, oldValue)) {
                 continue;
             }
         }
         // Check if property in prototype
         if (!isSvg && key in elm) {
             setProperty(rctx, elm, key, newValue);
             continue;
         }
         // Fallback to render attribute
         setAttribute(rctx, elm, key, newValue);
     }
     return ctx.dirty;
 }
 function setAttribute(ctx, el, prop, value) {
     const fn = () => {
         if (value == null) {
             el.removeAttribute(prop);
         }
         else {
             el.setAttribute(prop, String(value));
         }
     };
     ctx.operations.push({
         el,
         operation: 'set-attribute',
         args: [prop, value],
         fn,
     });
 }
 function classlistAdd(ctx, el, hostStyleTag) {
     const fn = () => {
         el.classList.add(hostStyleTag);
     };
     ctx.operations.push({
         el,
         operation: 'classlist-add',
         args: [hostStyleTag],
         fn,
     });
 }
 function setProperty(ctx, node, key, value) {
     const fn = () => {
         try {
             node[key] = value;
         }
         catch (err) {
             logError('Set property', { node, key, value }, err);
         }
     };
     ctx.operations.push({
         el: node,
         operation: 'set-property',
         args: [key, value],
         fn,
     });
 }
 function createElement(ctx, expectTag, isSvg) {
     const el = isSvg ? ctx.doc.createElementNS(SVG_NS, expectTag) : ctx.doc.createElement(expectTag);
     el[CONTAINER] = ctx.containerEl;
     ctx.operations.push({
         el,
         operation: 'create-element',
         args: [expectTag],
         fn: () => { },
     });
     return el;
 }
 function insertBefore(ctx, parent, newChild, refChild) {
     const fn = () => {
         parent.insertBefore(newChild, refChild ? refChild : null);
     };
     ctx.operations.push({
         el: parent,
         operation: 'insert-before',
         args: [newChild, refChild],
         fn,
     });
     return newChild;
 }
 function appendStyle(ctx, hostElement, styleTask) {
     const fn = () => {
         const containerEl = ctx.containerEl;
         const stylesParent = ctx.doc.documentElement === containerEl ? ctx.doc.head ?? containerEl : containerEl;
         if (!stylesParent.querySelector(`style[q\\:style="${styleTask.styleId}"]`)) {
             const style = ctx.doc.createElement('style');
             style.setAttribute('q:style', styleTask.styleId);
             style.textContent = styleTask.content;
             stylesParent.insertBefore(style, stylesParent.firstChild);
         }
     };
     ctx.operations.push({
         el: hostElement,
         operation: 'append-style',
         args: [styleTask],
         fn,
     });
 }
 function prepend(ctx, parent, newChild) {
     const fn = () => {
         parent.insertBefore(newChild, parent.firstChild);
     };
     ctx.operations.push({
         el: parent,
         operation: 'prepend',
         args: [newChild],
         fn,
     });
 }
 function removeNode(ctx, el) {
     const fn = () => {
         const parent = el.parentNode;
         if (parent) {
             parent.removeChild(el);
         }
         else if (qDev) {
             logWarn('Trying to remove component already removed', el);
         }
     };
     ctx.operations.push({
         el: el,
         operation: 'remove',
         args: [],
         fn,
     });
 }
 function createTextNode(ctx, text) {
     return ctx.doc.createTextNode(text);
 }
 function executeContextWithSlots(ctx) {
     const before = ctx.roots.map((elm) => getSlots(undefined, elm));
     executeContext(ctx);
     const after = ctx.roots.map((elm) => getSlots(undefined, elm));
     assertEqual(before.length, after.length);
     for (let i = 0; i < before.length; i++) {
         resolveSlotProjection(ctx, ctx.roots[i], before[i], after[i]);
     }
 }
 function executeContext(ctx) {
     for (const op of ctx.operations) {
         op.fn();
     }
 }
 function printRenderStats(ctx) {
     const byOp = {};
     for (const op of ctx.operations) {
         byOp[op.operation] = (byOp[op.operation] ?? 0) + 1;
     }
     const affectedElements = Array.from(new Set(ctx.operations.map((a) => a.el)));
     const stats = {
         byOp,
         roots: ctx.roots,
         hostElements: Array.from(ctx.hostElements),
         affectedElements,
         visitedNodes: ctx.perf.visited,
         operations: ctx.operations.map((v) => [v.operation, v.el, ...v.args]),
     };
     logDebug('Render stats', stats);
     return stats;
 }
 function createKeyToOldIdx(children, beginIdx, endIdx) {
     const map = {};
     for (let i = beginIdx; i <= endIdx; ++i) {
         const child = children[i];
         if (child.nodeType == NodeType.ELEMENT_NODE) {
             const key = getKey(child);
             if (key !== undefined) {
                 map[key] = i;
             }
         }
     }
     return map;
 }
 const KEY_SYMBOL = Symbol('vnode key');
 function getKey(el) {
     let key = el[KEY_SYMBOL];
     if (key === undefined) {
         key = el[KEY_SYMBOL] = el.getAttribute('q:key');
     }
     return key;
 }
 function setKey(el, key) {
     if (typeof key === 'string') {
         el.setAttribute('q:key', key);
     }
     el[KEY_SYMBOL] = key;
 }
 function sameVnode(vnode1, vnode2) {
     const isSameSel = vnode1.nodeName.toLowerCase() === vnode2.type;
     const isSameKey = vnode1.nodeType === NodeType.ELEMENT_NODE ? getKey(vnode1) === vnode2.key : true;
     return isSameSel && isSameKey;
 }
 function checkInnerHTML(props) {
     return props && ('innerHTML' in props || dangerouslySetInnerHTML in props);
 }
 function stringifyClassOrStyle(obj, isClass) {
     if (obj == null)
         return '';
     if (typeof obj == 'object') {
         let text = '';
         let sep = '';
         if (Array.isArray(obj)) {
             if (!isClass) {
                 throw qError(QError.Render_unsupportedFormat_obj_attr, obj, 'style');
             }
             for (let i = 0; i < obj.length; i++) {
                 text += sep + obj[i];
                 sep = ' ';
             }
         }
         else {
             for (const key in obj) {
                 if (Object.prototype.hasOwnProperty.call(obj, key)) {
                     const value = obj[key];
                     if (value) {
                         text += isClass
                             ? value
                                 ? sep + key
                                 : ''
                             : sep + fromCamelToKebabCase(key) + ':' + value;
                         sep = isClass ? ' ' : ';';
                     }
                 }
             }
         }
         return text;
     }
     return String(obj);
 }
 
 // <docs markdown="https://hackmd.io/lQ8v7fyhR-WD3b-2aRUpyw#useHostElement">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2FlQ8v7fyhR-WD3b-2aRUpyw%3Fboth#useHostElement instead)
 /**
  * Retrieves the Host Element of the current component.
  *
  * NOTE: `useHostElement` method can only be used in the synchronous portion of the callback
  * (before any `await` statements.)
  *
  * @public
  */
 // </docs>
 function useHostElement() {
     const element = getInvokeContext().hostElement;
     assertDefined(element);
     return element;
 }
 
 /**
  * @public
  */
 function useDocument() {
     const doc = getInvokeContext().doc;
     if (!doc) {
         throw new Error('Cant access document for existing context');
     }
     return doc;
 }
 
 // <docs markdown="https://hackmd.io/lQ8v7fyhR-WD3b-2aRUpyw#useStore">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2FlQ8v7fyhR-WD3b-2aRUpyw%3Fboth#useStore instead)
 /**
  * Creates a object that Qwik can track across serializations.
  *
  * Use `useStore` to create state for your application. The return object is a proxy which has a
  * unique ID. The ID of the object is used in the `QRL`s to refer to the store.
  *
  * ## Example
  *
  * Example showing how `useStore` is used in Counter example to keep track of count.
  *
  * ```typescript
  * export const Counter = component$(() => {
  *   const store = useStore({ count: 0 });
  *   return $(() => <button onClick$={() => store.count++}>{store.count}</button>);
  * });
  * ```
  *
  * @public
  */
 // </docs>
 function useStore(initialState) {
     const [store, setStore] = useSequentialScope();
     const hostElement = useHostElement();
     if (store != null) {
         return wrapSubscriber(store, hostElement);
     }
     const newStore = qObject(initialState, getProxyMap(useDocument()));
     setStore(newStore);
     return wrapSubscriber(newStore, hostElement);
 }
 /**
  * @alpha
  */
 function useRef(current) {
     return useStore({ current });
 }
 function useSequentialScope() {
     const ctx = getInvokeContext();
     assertEqual(ctx.event, RenderEvent);
     const index = ctx.seq;
     const hostElement = useHostElement();
     const elementCtx = getContext(hostElement);
     ctx.seq++;
     const updateFn = (value) => {
         elementCtx.seq[index] = elementCtx.refMap.add(value);
     };
     const seqIndex = elementCtx.seq[index];
     if (typeof seqIndex === 'number') {
         return [elementCtx.refMap.get(seqIndex), updateFn];
     }
     return [undefined, updateFn];
 }
 
 var WatchMode;
 (function (WatchMode) {
     WatchMode[WatchMode["Watch"] = 0] = "Watch";
     WatchMode[WatchMode["LayoutEffect"] = 1] = "LayoutEffect";
     WatchMode[WatchMode["Effect"] = 2] = "Effect";
 })(WatchMode || (WatchMode = {}));
 // <docs markdown="https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#useWatch">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2F_Kl9br9tT8OB-1Dv8uR4Kg%3Fboth#useWatch instead)
 /**
  * Reruns the `watchFn` when the observed inputs change.
  *
  * Use `useWatch` to observe changes on a set of inputs, and then re-execute the `watchFn` when
  * those inputs change.
  *
  * The `watchFn` only executes if the observed inputs change. To observe the inputs use the `obs`
  * function to wrap property reads. This creates subscriptions which will trigger the `watchFn`
  * to re-run.
  *
  * See: `Observer`
  *
  * @public
  *
  * ## Example
  *
  * The `useWatch` function is used to observe the `state.count` property. Any changes to the
  * `state.count` cause the `watchFn` to execute which in turn updates the `state.doubleCount` to
  * the double of `state.count`.
  *
  * ```typescript
  * export const MyComp = component$(() => {
  *   const store = useStore({ count: 0, doubleCount: 0 });
  *   useWatch$((obs) => {
  *     store.doubleCount = 2 * obs(store).count;
  *   });
  *   return $(() => (
  *     <div>
  *       <span>
  *         {store.count} / {store.doubleCount}
  *       </span>
  *       <button onClick$={() => store.count++}>+</button>
  *     </div>
  *   ));
  * });
  * ```
  *
  *
  * @param watch - Function which should be re-executed when changes to the inputs are detected
  * @public
  */
 // </docs>
 function useWatchQrl(watchQrl) {
     const [watch, setWatch] = useSequentialScope();
     if (!watch) {
         const hostElement = useHostElement();
         const watch = {
             watchQrl: watchQrl,
             hostElement,
             mode: WatchMode.Watch,
             isConnected: true,
             dirty: true,
         };
         setWatch(watch);
         getContext(hostElement).refMap.add(watch);
         useWaitOn(Promise.resolve().then(() => runWatch(watch)));
     }
 }
 const isWatchDescriptor = (obj) => {
     return obj && typeof obj === 'object' && 'watchQrl' in obj;
 };
 // <docs markdown="https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#useWatch">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2F_Kl9br9tT8OB-1Dv8uR4Kg%3Fboth#useWatch instead)
 /**
  * Reruns the `watchFn` when the observed inputs change.
  *
  * Use `useWatch` to observe changes on a set of inputs, and then re-execute the `watchFn` when
  * those inputs change.
  *
  * The `watchFn` only executes if the observed inputs change. To observe the inputs use the `obs`
  * function to wrap property reads. This creates subscriptions which will trigger the `watchFn`
  * to re-run.
  *
  * See: `Observer`
  *
  * @public
  *
  * ## Example
  *
  * The `useWatch` function is used to observe the `state.count` property. Any changes to the
  * `state.count` cause the `watchFn` to execute which in turn updates the `state.doubleCount` to
  * the double of `state.count`.
  *
  * ```typescript
  * export const MyComp = component$(() => {
  *   const store = useStore({ count: 0, doubleCount: 0 });
  *   useWatch$((obs) => {
  *     store.doubleCount = 2 * obs(store).count;
  *   });
  *   return $(() => (
  *     <div>
  *       <span>
  *         {store.count} / {store.doubleCount}
  *       </span>
  *       <button onClick$={() => store.count++}>+</button>
  *     </div>
  *   ));
  * });
  * ```
  *
  *
  * @param watch - Function which should be re-executed when changes to the inputs are detected
  * @public
  */
 // </docs>
 const useWatch$ = implicit$FirstArg(useWatchQrl);
 /**
  * @alpha
  */
 function useEffectQrl(watchQrl) {
     const [watch, setWatch] = useSequentialScope();
     if (!watch) {
         const hostElement = useHostElement();
         const watch = {
             watchQrl: watchQrl,
             hostElement,
             mode: WatchMode.Effect,
             isConnected: true,
             dirty: true,
         };
         setWatch(watch);
         getContext(hostElement).refMap.add(watch);
     }
 }
 /**
  * @alpha
  */
 const useEffect$ = implicit$FirstArg(useEffectQrl);
 function runWatch(watch) {
     if (!watch.dirty) {
         logDebug('Watch is not dirty, skipping run', watch);
         return Promise.resolve(watch);
     }
     watch.dirty = false;
     const promise = new Promise((resolve) => {
         then(watch.running, () => {
             const destroy = watch.destroy;
             if (destroy) {
                 watch.destroy = undefined;
                 try {
                     destroy();
                 }
                 catch (err) {
                     logError(err);
                 }
             }
             const hostElement = watch.hostElement;
             const invokationContext = newInvokeContext(getDocument(hostElement), hostElement, hostElement, 'WatchEvent');
             invokationContext.watch = watch;
             invokationContext.subscriber = watch;
             const watchFn = watch.watchQrl.invokeFn(hostElement, invokationContext);
             const obs = (obj) => wrapSubscriber(obj, watch);
             const captureRef = watch.watchQrl.captureRef;
             if (Array.isArray(captureRef)) {
                 captureRef.forEach((obj) => {
                     removeSub(obj, watch);
                 });
             }
             return then(watchFn(obs), (returnValue) => {
                 if (typeof returnValue === 'function') {
                     watch.destroy = noSerialize(returnValue);
                 }
                 resolve(watch);
             });
         });
     });
     watch.running = noSerialize(promise);
     return promise;
 }
 
 /**
  * Mark component for rendering.
  *
  * Use `notifyRender` method to mark a component for rendering at some later point in time.
  * This method uses `getPlatform(doc).queueRender` for scheduling of the rendering. The
  * default implementation of the method is to use `requestAnimationFrame` to do actual rendering.
  *
  * The method is intended to coalesce multiple calls into `notifyRender` into a single call for
  * rendering.
  *
  * @param hostElement - Host-element of the component to re-render.
  * @returns A promise which is resolved when the component has been rendered.
  * @public
  */
 function notifyRender(hostElement) {
     assertDefined(hostElement.getAttribute(QHostAttr));
     const containerEl = getContainer(hostElement);
     assertDefined(containerEl);
     resumeIfNeeded(containerEl);
     const ctx = getContext(hostElement);
     const state = getRenderingState(containerEl);
     if (ctx.dirty) {
         // TODO
         return state.renderPromise;
     }
     ctx.dirty = true;
     const activeRendering = state.hostsRendering !== undefined;
     if (activeRendering) {
         state.hostsStaging.add(hostElement);
         return state.renderPromise.then((ctx) => {
             if (state.hostsNext.has(hostElement)) {
                 // TODO
                 return state.renderPromise;
             }
             else {
                 return ctx;
             }
         });
     }
     else {
         state.hostsNext.add(hostElement);
         return scheduleFrame(containerEl, state);
     }
 }
 function scheduleFrame(containerEl, state) {
     if (state.renderPromise === undefined) {
         state.renderPromise = getPlatform(containerEl).nextTick(() => renderMarked(containerEl, state));
     }
     return state.renderPromise;
 }
 const SCHEDULE = Symbol('Render state');
 function getRenderingState(containerEl) {
     let set = containerEl[SCHEDULE];
     if (!set) {
         containerEl[SCHEDULE] = set = {
             watchNext: new Set(),
             watchStagging: new Set(),
             watchRunning: new Set(),
             hostsNext: new Set(),
             hostsStaging: new Set(),
             renderPromise: undefined,
             hostsRendering: undefined,
         };
     }
     return set;
 }
 async function renderMarked(containerEl, state) {
     await waitForWatches(state);
     state.hostsRendering = new Set(state.hostsNext);
     state.hostsNext.clear();
     const doc = getDocument(containerEl);
     const platform = getPlatform(containerEl);
     const renderingQueue = Array.from(state.hostsRendering);
     sortNodes(renderingQueue);
     const ctx = {
         doc,
         globalState: state,
         hostElements: new Set(),
         operations: [],
         roots: [],
         containerEl,
         component: undefined,
         perf: {
             visited: 0,
             timing: [],
         },
     };
     for (const el of renderingQueue) {
         if (!ctx.hostElements.has(el)) {
             ctx.roots.push(el);
             await renderComponent(ctx, getContext(el));
         }
     }
     // Early exist, no dom operations
     if (ctx.operations.length === 0) {
         if (qDev) {
             if (typeof window !== 'undefined' && window.document != null) {
                 logDebug('Render skipped. No operations.');
                 printRenderStats(ctx);
             }
         }
         postRendering(containerEl, state, ctx);
         return ctx;
     }
     return platform.raf(() => {
         executeContextWithSlots(ctx);
         if (qDev) {
             if (typeof window !== 'undefined' && window.document != null) {
                 printRenderStats(ctx);
             }
         }
         postRendering(containerEl, state, ctx);
         return ctx;
     });
 }
 async function postRendering(containerEl, state, ctx) {
     // Run useEffect() watch
     const promises = [];
     state.watchNext.forEach((watch) => {
         promises.push(runWatch(watch));
     });
     state.watchNext.clear();
     state.watchStagging.forEach((watch) => {
         if (ctx.hostElements.has(watch.hostElement)) {
             promises.push(runWatch(watch));
         }
         else {
             state.watchNext.add(watch);
         }
     });
     // Wait for all promises
     await Promise.all(promises);
     // Move elements from staging to nextRender
     state.hostsStaging.forEach((el) => {
         state.hostsNext.add(el);
     });
     // Clear staging
     state.hostsStaging.clear();
     state.hostsRendering = undefined;
     state.renderPromise = undefined;
     if (state.hostsNext.size + state.watchNext.size > 0) {
         scheduleFrame(containerEl, state);
     }
 }
 function sortNodes(elements) {
     elements.sort((a, b) => (a.compareDocumentPosition(b) & 2 ? 1 : -1));
 }
 
 const ProxyMapSymbol = Symbol('ProxyMapSymbol');
 function getProxyMap(doc) {
     let map = doc[ProxyMapSymbol];
     if (!map) {
         map = doc[ProxyMapSymbol] = new WeakMap();
     }
     return map;
 }
 function qObject(obj, proxyMap) {
     assertEqual(unwrapProxy(obj), obj, 'Unexpected proxy at this location');
     if (obj == null || typeof obj !== 'object') {
         // TODO(misko): centralize
         throw new Error(`Q-ERROR: Only objects can be wrapped in 'QObject', got ` + debugStringify(obj));
     }
     if (obj.constructor !== Object) {
         throw new Error(`Q-ERROR: Only objects literals can be wrapped in 'QObject', got ` + debugStringify(obj));
     }
     return readWriteProxy(obj, proxyMap);
 }
 function _restoreQObject(obj, map, subs) {
     return readWriteProxy(obj, map, subs);
 }
 /**
  * Creates a proxy which notifies of any writes.
  */
 function readWriteProxy(target, proxyMap, subs) {
     if (!target || typeof target !== 'object')
         return target;
     let proxy = proxyMap.get(target);
     if (proxy)
         return proxy;
     proxy = new Proxy(target, new ReadWriteProxyHandler(proxyMap, subs));
     proxyMap.set(target, proxy);
     return proxy;
 }
 const QOjectTargetSymbol = ':target:';
 const QOjectSubsSymbol = ':subs:';
 const QOjectOriginalProxy = ':proxy:';
 const SetSubscriber = Symbol('SetSubscriber');
 function unwrapProxy(proxy) {
     if (proxy && typeof proxy == 'object') {
         const value = proxy[QOjectTargetSymbol];
         if (value)
             return value;
     }
     return proxy;
 }
 function wrap(value, proxyMap) {
     if (value && typeof value === 'object') {
         if (isQrl(value)) {
             return value;
         }
         if (isElement(value)) {
             return value;
         }
         const nakedValue = unwrapProxy(value);
         if (nakedValue !== value) {
             // already a proxy return;
             return value;
         }
         if (qDev) {
             verifySerializable(value);
         }
         const proxy = proxyMap.get(value);
         return proxy ? proxy : readWriteProxy(value, proxyMap);
     }
     else {
         return value;
     }
 }
 class ReadWriteProxyHandler {
     constructor(proxyMap, subs = new Map()) {
         this.proxyMap = proxyMap;
         this.subs = subs;
     }
     getSub(el) {
         let sub = this.subs.get(el);
         if (!sub) {
             this.subs.set(el, (sub = new Set()));
         }
         return sub;
     }
     get(target, prop) {
         let subscriber = this.subscriber;
         this.subscriber = undefined;
         if (prop === QOjectTargetSymbol)
             return target;
         if (prop === QOjectSubsSymbol)
             return this.subs;
         if (prop === QOjectOriginalProxy)
             return this.proxyMap.get(target);
         const value = target[prop];
         if (typeof prop === 'symbol') {
             return value;
         }
         const invokeCtx = tryGetInvokeContext();
         if (qDev && !invokeCtx && !qTest) {
             logWarn(`State assigned outside invocation context. Getting prop "${prop}" of:`, target);
         }
         if (invokeCtx) {
             if (invokeCtx.subscriber === null) {
                 subscriber = undefined;
             }
             else if (!subscriber) {
                 subscriber = invokeCtx.subscriber;
             }
         }
         else if (qDev && !qTest && !subscriber) {
             logWarn(`State assigned outside invocation context. Getting prop "${prop}" of:`, target);
         }
         if (subscriber) {
             const isArray = Array.isArray(target);
             const sub = this.getSub(subscriber);
             if (!isArray) {
                 sub.add(prop);
             }
         }
         return wrap(value, this.proxyMap);
     }
     set(target, prop, newValue) {
         if (typeof prop === 'symbol') {
             if (prop === SetSubscriber) {
                 this.subscriber = newValue;
             }
             else {
                 target[prop] = newValue;
             }
             return true;
         }
         const subs = this.subs;
         const unwrappedNewValue = unwrapProxy(newValue);
         verifySerializable(unwrappedNewValue);
         const isArray = Array.isArray(target);
         if (isArray) {
             target[prop] = unwrappedNewValue;
             subs.forEach((_, sub) => {
                 if (sub.isConnected) {
                     notifyChange(sub);
                 }
                 else {
                     subs.delete(sub);
                 }
             });
             return true;
         }
         const oldValue = target[prop];
         if (oldValue !== unwrappedNewValue) {
             target[prop] = unwrappedNewValue;
             subs.forEach((propSets, sub) => {
                 if (sub.isConnected) {
                     if (propSets.has(prop)) {
                         notifyChange(sub);
                     }
                 }
                 else {
                     subs.delete(sub);
                 }
             });
         }
         return true;
     }
     has(target, property) {
         if (property === QOjectTargetSymbol)
             return true;
         if (property === QOjectSubsSymbol)
             return true;
         return Object.prototype.hasOwnProperty.call(target, property);
     }
     ownKeys(target) {
         return Object.getOwnPropertyNames(target);
     }
 }
 function removeSub(obj, subscriber) {
     if (obj && typeof obj === 'object') {
         const subs = obj[QOjectSubsSymbol];
         if (subs) {
             subs.delete(subscriber);
         }
     }
 }
 function notifyChange(subscriber) {
     if (isElement(subscriber)) {
         notifyRender(subscriber);
     }
     else {
         notifyWatch(subscriber);
     }
 }
 function notifyWatch(watch) {
     const containerEl = getContainer(watch.hostElement);
     const state = getRenderingState(containerEl);
     watch.dirty = true;
     if (watch.mode === WatchMode.Watch) {
         const promise = runWatch(watch);
         state.watchRunning.add(promise);
         promise.then(() => {
             state.watchRunning.delete(promise);
         });
     }
     else {
         const activeRendering = state.hostsRendering !== undefined;
         if (activeRendering) {
             state.watchStagging.add(watch);
         }
         else {
             state.watchNext.add(watch);
             scheduleFrame(containerEl, state);
         }
     }
 }
 async function waitForWatches(state) {
     while (state.watchRunning.size > 0) {
         await Promise.all(state.watchRunning);
     }
 }
 function verifySerializable(value) {
     if (shouldSerialize(value) && typeof value == 'object' && value !== null) {
         if (Array.isArray(value))
             return;
         if (Object.getPrototypeOf(value) !== Object.prototype) {
             if (isQrl(value))
                 return;
             if (isElement(value))
                 return;
             throw qError(QError.TODO, 'Only primitive and object literals can be serialized.');
         }
     }
 }
 const NOSERIALIZE = Symbol('NoSerialize');
 function shouldSerialize(obj) {
     if (obj !== null && (typeof obj == 'object' || typeof obj === 'function')) {
         const noSerialize = obj[NOSERIALIZE] === true;
         return !noSerialize;
     }
     return true;
 }
 /**
  * @alpha
  */
 function noSerialize(input) {
     input[NOSERIALIZE] = true;
     return input;
 }
 
 /**
  * @alpha
  */
 function useSubscriber(obj) {
     const ctx = getInvokeContext();
     let subscriber = ctx.watch;
     if (!subscriber) {
         assertEqual(ctx.event, RenderEvent);
         subscriber = ctx.hostElement;
     }
     assertDefined(subscriber);
     return wrapSubscriber(obj, subscriber);
 }
 /**
  * @alpha
  */
 function wrapSubscriber(obj, subscriber) {
     if (obj && typeof obj === 'object') {
         const target = obj[QOjectTargetSymbol];
         if (!target) {
             return obj;
         }
         return new Proxy(obj, {
             get(target, prop) {
                 if (prop === QOjectOriginalProxy) {
                     return target;
                 }
                 target[SetSubscriber] = subscriber;
                 return target[prop];
             },
         });
     }
     return obj;
 }
 /**
  * @alpha
  */
 function unwrapSubscriber(obj) {
     if (obj && typeof obj === 'object') {
         const proxy = obj[QOjectOriginalProxy];
         if (proxy) {
             return proxy;
         }
     }
     return obj;
 }
 
 let runtimeSymbolId = 0;
 const RUNTIME_QRL = '/runtimeQRL';
 // https://regexr.com/68v72
 const EXTRACT_IMPORT_PATH = /\(\s*(['"])([^\1]+)\1\s*\)/;
 // https://regexr.com/690ds
 const EXTRACT_SELF_IMPORT = /Promise\s*\.\s*resolve/;
 // https://regexr.com/6a83h
 const EXTRACT_FILE_NAME = /[\\/(]([\w\d.\-_]+\.(js|ts)x?):/;
 function toInternalQRL(qrl) {
     assertEqual(isQrl(qrl), true);
     return qrl;
 }
 // <docs markdown="https://hackmd.io/m5DzCi5MTa26LuUj5t3HpQ#qrlImport">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fm5DzCi5MTa26LuUj5t3HpQ%3Fboth#qrlImport instead)
 /**
  * Lazy-load a `QRL` symbol and return the lazy-loaded value.
  *
  * See: `QRL`
  *
  * @param element - Location of the URL to resolve against. This is needed to take `q:base` into
  * account.
  * @param qrl - QRL to load.
  * @returns A resolved QRL value as a Promise.
  */
 // </docs>
 function qrlImport(element, qrl) {
     const qrl_ = toInternalQRL(qrl);
     if (qrl_.symbolRef)
         return qrl_.symbolRef;
     if (qrl_.symbolFn) {
         return (qrl_.symbolRef = qrl_
             .symbolFn()
             .then((module) => (qrl_.symbolRef = module[qrl_.symbol])));
     }
     else {
         if (!element) {
             throw new Error(`QRL '${qrl_.chunk}#${qrl_.symbol || 'default'}' does not have an attached container`);
         }
         const symbol = getPlatform(getDocument(element)).importSymbol(element, qrl_.chunk, qrl_.symbol);
         return (qrl_.symbolRef = then(symbol, (ref) => {
             return (qrl_.symbolRef = ref);
         }));
     }
 }
 // <docs markdown="https://hackmd.io/m5DzCi5MTa26LuUj5t3HpQ#qrl">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fm5DzCi5MTa26LuUj5t3HpQ%3Fboth#qrl instead)
 /**
  * Used by Qwik Optimizer to point to lazy-loaded resources.
  *
  * This function should be used by the Qwik Optimizer only. The function should not be directly
  * referred to in the source code of the application.
  *
  * See: `QRL`, `$(...)`
  *
  * @param chunkOrFn - Chunk name (or function which is stringified to extract chunk name)
  * @param symbol - Symbol to lazy load
  * @param lexicalScopeCapture - a set of lexically scoped variables to capture.
  * @public
  */
 // </docs>
 function qrl(chunkOrFn, symbol, lexicalScopeCapture = EMPTY_ARRAY) {
     let chunk;
     let symbolFn = null;
     if (typeof chunkOrFn === 'string') {
         chunk = chunkOrFn;
     }
     else if (typeof chunkOrFn === 'function') {
         symbolFn = chunkOrFn;
         let match;
         const srcCode = String(chunkOrFn);
         if ((match = srcCode.match(EXTRACT_IMPORT_PATH)) && match[2]) {
             chunk = match[2];
         }
         else if ((match = srcCode.match(EXTRACT_SELF_IMPORT))) {
             const ref = 'QWIK-SELF';
             const frames = new Error(ref).stack.split('\n');
             const start = frames.findIndex((f) => f.includes(ref));
             const frame = frames[start + 2];
             match = frame.match(EXTRACT_FILE_NAME);
             if (!match) {
                 chunk = 'main';
             }
             else {
                 chunk = match[1];
             }
         }
         else {
             throw new Error('Q-ERROR: Dynamic import not found: ' + srcCode);
         }
     }
     else {
         throw new Error('Q-ERROR: Unknown type argument: ' + chunkOrFn);
     }
     // Unwrap subscribers
     if (Array.isArray(lexicalScopeCapture)) {
         for (let i = 0; i < lexicalScopeCapture.length; i++) {
             lexicalScopeCapture[i] = unwrapSubscriber(lexicalScopeCapture[i]);
         }
     }
     const qrl = new QRLInternal(chunk, symbol, null, symbolFn, null, lexicalScopeCapture);
     const ctx = tryGetInvokeContext();
     if (ctx && ctx.element) {
         qrl.setContainer(ctx.element);
     }
     return qrl;
 }
 function runtimeQrl(symbol, lexicalScopeCapture = EMPTY_ARRAY) {
     return new QRLInternal(RUNTIME_QRL, 's' + runtimeSymbolId++, symbol, null, null, lexicalScopeCapture);
 }
 function stringifyQRL(qrl, opts = {}) {
     const qrl_ = toInternalQRL(qrl);
     const symbol = qrl_.symbol;
     const platform = opts.platform;
     const element = opts.element;
     const chunk = platform ? platform.chunkForSymbol(symbol) ?? qrl_.chunk : qrl_.chunk;
     const parts = [chunk];
     if (symbol && symbol !== 'default') {
         parts.push('#', symbol);
     }
     const capture = qrl_.capture;
     const captureRef = qrl_.captureRef;
     if (opts.getObjId) {
         if (captureRef && captureRef.length) {
             const capture = captureRef.map(opts.getObjId);
             parts.push(`[${capture.join(' ')}]`);
         }
     }
     else if (capture && capture.length > 0) {
         parts.push(`[${capture.join(' ')}]`);
     }
     const qrlString = parts.join('');
     if (qrl_.chunk === RUNTIME_QRL && element) {
         const qrls = element.__qrls__ || (element.__qrls__ = new Set());
         qrls.add(qrl);
     }
     return qrlString;
 }
 /**
  * `./chunk#symbol|symbol.propA.propB|[captures]
  */
 function parseQRL(qrl, el) {
     const endIdx = qrl.length;
     const hashIdx = indexOf(qrl, 0, '#');
     const captureIdx = indexOf(qrl, hashIdx, '[');
     const chunkEndIdx = Math.min(hashIdx, captureIdx);
     const chunk = qrl.substring(0, chunkEndIdx);
     const symbolStartIdx = hashIdx == endIdx ? hashIdx : hashIdx + 1;
     const symbolEndIdx = captureIdx;
     const symbol = symbolStartIdx == symbolEndIdx ? 'default' : qrl.substring(symbolStartIdx, symbolEndIdx);
     const captureStartIdx = captureIdx;
     const captureEndIdx = endIdx;
     const capture = captureStartIdx === captureEndIdx
         ? EMPTY_ARRAY
         : qrl.substring(captureStartIdx + 1, captureEndIdx - 1).split(' ');
     if (chunk === RUNTIME_QRL) {
         logError(`Q-ERROR: '${qrl}' is runtime but no instance found on element.`);
     }
     const iQrl = new QRLInternal(chunk, symbol, null, null, capture, null);
     if (el) {
         iQrl.setContainer(el);
     }
     return iQrl;
 }
 function indexOf(text, startIdx, char) {
     const endIdx = text.length;
     const charIdx = text.indexOf(char, startIdx == endIdx ? 0 : startIdx);
     return charIdx == -1 ? endIdx : charIdx;
 }
 function toQrlOrError(symbolOrQrl) {
     if (!isQrl(symbolOrQrl)) {
         if (typeof symbolOrQrl == 'function' || typeof symbolOrQrl == 'string') {
             symbolOrQrl = runtimeQrl(symbolOrQrl);
         }
         else {
             // TODO(misko): centralize
             throw new Error(`Q-ERROR Only 'function's and 'string's are supported.`);
         }
     }
     return symbolOrQrl;
 }
 
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onUnmount">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onUnmount instead)
 /**
  * A lazy-loadable reference to a component's destroy hook.
  *
  * Invoked when the component is destroyed (removed from render tree).
  *
  * @public
  */
 // </docs>
 function onUnmountQrl(unmountFn) {
     throw new Error('IMPLEMENT: onUnmount' + unmountFn);
 }
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onUnmount">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onUnmount instead)
 /**
  * A lazy-loadable reference to a component's destroy hook.
  *
  * Invoked when the component is destroyed (removed from render tree).
  *
  * @public
  */
 // </docs>
 const onUnmount$ = implicit$FirstArg(onUnmountQrl);
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onResume">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onResume instead)
 /**
  * A lazy-loadable reference to a component's on resume hook.
  *
  * The hook is eagerly invoked when the application resumes on the client. Because it is called
  * eagerly, this allows the component to resume even if no user interaction has taken place.
  *
  * @public
  */
 // </docs>
 function onResumeQrl(resumeFn) {
     onWindow('load', resumeFn);
 }
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onHydrate">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onHydrate instead)
 /**
  * A lazy-loadable reference to a component's on resume hook.
  *
  * Invoked when the component's state is re-resumed from serialization. This allows the
  * component to do any work to re-activate itself.
  *
  * @public
  */
 // </docs>
 const onResume$ = implicit$FirstArg(onResumeQrl);
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#OnPause">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#OnPause instead)
 /**
  * A lazy-loadable reference to a component's on dehydrate hook.
  *
  * Invoked when the component's state is being serialized (dehydrated) into the DOM. This allows
  * the component to do last-minute clean-up before its state is serialized.
  *
  * Typically used with transient state.
  *
  * @public
  */
 // </docs>
 function onPauseQrl(dehydrateFn) {
     throw new Error('IMPLEMENT: onPause' + dehydrateFn);
 }
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#OnPause">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#OnPause instead)
 /**
  * A lazy-loadable reference to a component's on dehydrate hook.
  *
  * Invoked when the component's state is being serialized (dehydrated) into the DOM. This allows
  * the component to do last-minute clean-up before its state is serialized.
  *
  * Typically used with transient state.
  *
  * @public
  */
 // </docs>
 const onPause$ = implicit$FirstArg(onPauseQrl);
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#on">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#on instead)
 /**
  * Register a listener on the current component's host element.
  *
  * Used to programmatically add event listeners. Useful from custom `use*` methods, which do not
  * have access to the JSX.
  *
  * See: `on`, `onWindow`, `onDocument`.
  *
  * @public
  */
 // </docs>
 function on(event, eventFn) {
     const el = useHostElement();
     const ctx = getContext(el);
     qPropWriteQRL(undefined, ctx, `on:${event}`, eventFn);
 }
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onDocument">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onDocument instead)
 /**
  * Register a listener on `document`.
  *
  * Used to programmatically add event listeners. Useful from custom `use*` methods, which do not
  * have access to the JSX.
  *
  * See: `on`, `onWindow`, `onDocument`.
  *
  * @public
  */
 // </docs>
 function onDocument(event, eventFn) {
     const el = useHostElement();
     const ctx = getContext(el);
     qPropWriteQRL(undefined, ctx, `on-document:${event}`, eventFn);
 }
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onWindow">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onWindow instead)
 /**
  * Register a listener on `window`.
  *
  * Used to programmatically add event listeners. Useful from custom `use*` methods, which do not
  * have access to the JSX.
  *
  * See: `on`, `onWindow`, `onDocument`.
  *
  * @public
  */
 // </docs>
 function onWindow(event, eventFn) {
     const el = useHostElement();
     const ctx = getContext(el);
     qPropWriteQRL(undefined, ctx, `on-window:${event}`, eventFn);
 }
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#useStyles">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#useStyles instead)
 /**
  * Refer to component styles.
  *
  * @alpha
  */
 // </docs>
 function useStylesQrl(styles) {
     _useStyles(styles, false);
 }
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#useStyles">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#useStyles instead)
 /**
  * Refer to component styles.
  *
  * @alpha
  */
 // </docs>
 const useStyles$ = implicit$FirstArg(useStylesQrl);
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#useScopedStyles">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#useScopedStyles instead)
 /**
  * @alpha
  */
 // </docs>
 function useScopedStylesQrl(styles) {
     _useStyles(styles, true);
 }
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#useScopedStyles">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#useScopedStyles instead)
 /**
  * @alpha
  */
 // </docs>
 const useScopedStyles$ = implicit$FirstArg(useScopedStylesQrl);
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#component">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#component instead)
 /**
  * Declare a Qwik component that can be used to create UI.
  *
  * Use `component` (and `component$`) to declare a Qwik component. A Qwik component is a special
  * kind of component that allows the Qwik framework to lazy load and execute the component
  * independently of other Qwik components as well as lazy load the component's life-cycle hooks
  * and event handlers.
  *
  * Side note: You can also declare regular (standard JSX) components that will have standard
  * synchronous behavior.
  *
  * Qwik component is a facade that describes how the component should be used without forcing the
  * implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:
  *
  * - Component `onMount` method, which needs to return an
  * - `onRender` closure which constructs the component's JSX.
  *
  * ### Example:
  *
  * An example showing how to create a counter component:
  *
  * ```typescript
  * export const Counter = component$((props: { value?: number; step?: number }) => {
  *   const state = useStore({ count: props.value || 0 });
  *   return $(() => (
  *     <div>
  *       <span>{state.count}</span>
  *       <button onClick$={() => (state.count += props.step || 1)}>+</button>
  *     </div>
  *   ));
  * });
  * ```
  *
  * - `component$` is how a component gets declared.
  * - `{ value?: number; step?: number }` declares the public (props) interface of the component.
  * - `{ count: number }` declares the private (state) interface of the component.
  * - `onMount` closure: is used to create the data store (see: `useStore`);
  * - `$`: mark which parts of the component will be lazy-loaded. (see `$` for details.)
  *
  * The above can then be used like so:
  *
  * ```typescript
  * export const OtherComponent = component$(() => {
  *   return $(() => <Counter value={100} />);
  * });
  * ```
  *
  * See also: `component`, `onUnmount`, `onHydrate`, `OnPause`, `onHalt`, `onResume`, `on`,
  * `onDocument`, `onWindow`, `useStyles`, `useScopedStyles`
  *
  * @param onMount - Initialization closure used when the component is first created.
  * @param tagName - Optional components options. It can be used to set a custom tag-name to be
  * used for the component's host element.
  *
  * @public
  */
 // </docs>
 function componentQrl(onRenderQrl, options = {}) {
     const tagName = options.tagName ?? 'div';
     // Return a QComponent Factory function.
     return function QSimpleComponent(props, key) {
         return jsx(tagName, { [OnRenderProp]: onRenderQrl, ...props }, key);
     };
 }
 // <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#component">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#component instead)
 /**
  * Declare a Qwik component that can be used to create UI.
  *
  * Use `component` (and `component$`) to declare a Qwik component. A Qwik component is a special
  * kind of component that allows the Qwik framework to lazy load and execute the component
  * independently of other Qwik components as well as lazy load the component's life-cycle hooks
  * and event handlers.
  *
  * Side note: You can also declare regular (standard JSX) components that will have standard
  * synchronous behavior.
  *
  * Qwik component is a facade that describes how the component should be used without forcing the
  * implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:
  *
  * - Component `onMount` method, which needs to return an
  * - `onRender` closure which constructs the component's JSX.
  *
  * ### Example:
  *
  * An example showing how to create a counter component:
  *
  * ```typescript
  * export const Counter = component$((props: { value?: number; step?: number }) => {
  *   const state = useStore({ count: props.value || 0 });
  *   return $(() => (
  *     <div>
  *       <span>{state.count}</span>
  *       <button onClick$={() => (state.count += props.step || 1)}>+</button>
  *     </div>
  *   ));
  * });
  * ```
  *
  * - `component$` is how a component gets declared.
  * - `{ value?: number; step?: number }` declares the public (props) interface of the component.
  * - `{ count: number }` declares the private (state) interface of the component.
  * - `onMount` closure: is used to create the data store (see: `useStore`);
  * - `$`: mark which parts of the component will be lazy-loaded. (see `$` for details.)
  *
  * The above can then be used like so:
  *
  * ```typescript
  * export const OtherComponent = component$(() => {
  *   return $(() => <Counter value={100} />);
  * });
  * ```
  *
  * See also: `component`, `onUnmount`, `onHydrate`, `OnPause`, `onHalt`, `onResume`, `on`,
  * `onDocument`, `onWindow`, `useStyles`, `useScopedStyles`
  *
  * @param onMount - Initialization closure used when the component is first created.
  * @param tagName - Optional components options. It can be used to set a custom tag-name to be
  * used for the component's host element.
  *
  * @public
  */
 // </docs>
 function component$(onMount, options) {
     return componentQrl($(onMount), options);
 }
 function _useStyles(styles, scoped) {
     const [style, setStyle] = useSequentialScope();
     if (style === true) {
         return;
     }
     setStyle(true);
     const styleQrl = toQrlOrError(styles);
     const styleId = styleKey(styleQrl);
     const hostElement = useHostElement();
     if (scoped) {
         hostElement.setAttribute(ComponentScopedStyles, styleId);
     }
     useWaitOn(styleQrl.resolve(hostElement).then((styleText) => {
         const task = {
             type: 'style',
             styleId,
             content: scoped ? styleText.replace(/�/g, styleId) : styleText,
         };
         return task;
     }));
 }
 
 /**
  * Serialize the current state of the application into DOM
  *
  * @public
  */
 function pauseContainer(elmOrDoc) {
     const doc = getDocument(elmOrDoc);
     const containerEl = isDocument(elmOrDoc) ? elmOrDoc.documentElement : elmOrDoc;
     const parentJSON = isDocument(elmOrDoc) ? elmOrDoc.body : containerEl;
     const data = snapshotState(containerEl);
     const script = doc.createElement('script');
     script.setAttribute('type', 'qwik/json');
     script.textContent = JSON.stringify(data, undefined, qDev ? '  ' : undefined);
     parentJSON.appendChild(script);
     containerEl.setAttribute(QContainerAttr, 'paused');
 }
 
 /**
  * Use to render asynchronous (`Promise`) values.
  *
  * A `Promise` does not allow a synchronous examination of its state. For this reason
  * `<Async>` provides a mechanism to render pending, resolved and error state of a `Promise`.
  * `<Async>` provides that mechanism by registering a `then` method with the `Promise` and
  * providing callbacks hooks for `pending`, `resolved` and `rejected` state of the promise.
  *
  * Additionally, `<Async>` automatically re-renders the portion of the view when the status
  * of the `Promise` changes.
  *
  * `<Async>` provides three callbacks:
  * - `onPending`: invoked initially to provide a way for the template to provide output while
  *   waiting for the `promise` to resolve.
  * - `onResolved`: invoked when the `promise` is `resolved` allowing the template to generate
  *   output using the `resolved` value.
  * - `onError`: invoked when the `promise` is `rejected` allowing the template to generate
  *   error output describing the problem.
  *
  * The `<Async>` can be used in two ways, which are semantically equivalent and are provided
  * based on the developer needs/preferences.
  *
  * ### Using multiple callbacks
  *
  * ```typescript
  * <Async
  *   resolve={Promise.resolve('some value')}
  *   onPending={() => <span>loading...</span>}
  *   onResolved={(value) => <span>{value}</span>}
  *   onError={(rejection) => <pre>{rejection}</pre>}
  * />
  * ```
  *
  * ### Using single callbacks
  *
  * ```typescript
  * <Async resolve={Promise.resolve('some value')}>
  *   {(response) => {
  *     if (response.isPending) return <span>loading...</span>;
  *     if (response.isResolved) return <span>{response.value}</span>;
  *     if (response.isRejected) return <pre>{response.rejection}</pre>;
  *   }}
  * </Async>
  * ```
  *
  * @param onPending - invoked initially to provide a way for the template to provide output while
  *   waiting for the `promise` to resolve.
  * @param onResolved - invoked when the `promise` is `resolved` allowing the template to generate
  *   output using the `resolved` value.
  * @param onError - invoked when the `promise` is `rejected` allowing the template to generate
  *   error output describing the problem.
  * @param children -  a single callback function for `onPending`, `onResolved` and `onError`.
  *   (Use either `children` or `onPending`, `onResolved` and `onError`, but not both.)
  *   See "Using multiple callbacks" vs "Using single callbacks" above.
  *
  * @public
  */
 function Async(props) {
     // TODO(misko): implement onPending/onResolved/onError
     if (!('children' in props)) {
         throw new Error('IMPLEMENT');
     }
     const children = [props.children].flat()[0];
     const renderFn = typeof children == 'function' ? children : null;
     const promiseValue = {
         isPending: true,
         isResolved: false,
         value: undefined,
         isRejected: false,
         rejection: undefined,
     };
     let pending;
     const jsxPromise = new Promise((resolve, reject) => {
         pending = renderFn && renderFn(promiseValue);
         Promise.resolve(props.resolve).then((value) => {
             promiseValue.isPending = false;
             promiseValue.isResolved = true;
             promiseValue.value = value;
             return resolve(renderFn && renderFn(promiseValue));
         }, (error) => {
             promiseValue.isPending = false;
             promiseValue.isRejected = true;
             promiseValue.rejection = error;
             return reject(renderFn && renderFn(promiseValue));
         });
     });
     jsxPromise.whilePending = pending;
     return jsxPromise;
 }
 
 /* eslint-disable */
 /**
  * @public
  */
 function h(type, props, ...children) {
     // Using legacy h() jsx transform and morphing it
     // so it can use the modern vdom structure
     // https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
     // https://www.typescriptlang.org/tsconfig#jsxImportSource
     const normalizedProps = {
         children: arguments.length > 2 ? flattenArray(children) : EMPTY_ARRAY,
     };
     let key;
     let i;
     for (i in props) {
         if (i == 'key')
             key = props[i];
         else
             normalizedProps[i] = props[i];
     }
     return new JSXNodeImpl(type, normalizedProps, key);
 }
 
 /**
  * @public
  */
 const Slot = (props) => {
     const hasChildren = props.children || (Array.isArray(props.children) && props.children.length > 0);
     const newChildrem = !hasChildren
         ? []
         : jsx('q:fallback', {
             children: props.children,
         });
     return jsx('q:slot', {
         name: props.name,
         children: newChildrem,
     }, props.name);
 };
 
 /**
  * @alpha
  */
 const version = "0.0.19-0";
 
 /**
  * Render JSX.
  *
  * Use this method to render JSX. This function does reconciling which means
  * it always tries to reuse what is already in the DOM (rather then destroy and
  * recrate content.)
  *
  * @param parent - Element which will act as a parent to `jsxNode`. When
  *     possible the rendering will try to reuse existing nodes.
  * @param jsxNode - JSX to render
  * @public
  */
 async function render(parent, jsxNode) {
     // If input is not JSX, convert it
     if (!isJSXNode(jsxNode)) {
         jsxNode = jsx(jsxNode, null);
     }
     const doc = getDocument(parent);
     const containerEl = getElement(parent);
     if (qDev && containerEl.hasAttribute('q:container')) {
         logError('You can render over a existing q:container. Skipping render().');
         return;
     }
     injectQContainer(containerEl);
     const ctx = {
         doc,
         globalState: getRenderingState(containerEl),
         hostElements: new Set(),
         operations: [],
         roots: [parent],
         component: undefined,
         containerEl,
         perf: {
             visited: 0,
             timing: [],
         },
     };
     await visitJsxNode(ctx, parent, processNode(jsxNode), false);
     executeContext(ctx);
     if (!qTest) {
         injectQwikSlotCSS(parent);
     }
     if (qDev) {
         if (typeof window !== 'undefined' && window.document != null) {
             printRenderStats(ctx);
         }
     }
     const promises = [];
     ctx.hostElements.forEach((host) => {
         const elCtx = getContext(host);
         elCtx.refMap.array.filter(isWatchDescriptor).forEach((watch) => {
             if (watch.dirty) {
                 promises.push(runWatch(watch));
             }
         });
     });
     await Promise.all(promises);
     return ctx;
 }
 function injectQwikSlotCSS(docOrElm) {
     const doc = getDocument(docOrElm);
     const element = isDocument(docOrElm) ? docOrElm.head : docOrElm;
     const style = doc.createElement('style');
     style.setAttribute('id', 'qwik/base-styles');
     style.textContent = `q\\:slot{display:contents}q\\:fallback{display:none}q\\:fallback:last-child{display:contents}`;
     element.insertBefore(style, element.firstChild);
 }
 function getElement(docOrElm) {
     return isDocument(docOrElm) ? docOrElm.documentElement : docOrElm;
 }
 function injectQContainer(containerEl) {
     containerEl.setAttribute('q:version', version || '');
     containerEl.setAttribute(QContainerAttr, 'resumed');
 }
 
 function useURL() {
     const url = getInvokeContext().url;
     if (!url) {
         // TODO(misko): centralize
         throw new Error('Q-ERROR: no URL is associated with the execution context');
     }
     return url;
 }
 
 // <docs markdown="https://hackmd.io/lQ8v7fyhR-WD3b-2aRUpyw#useLexicalScope">
 // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
 // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2FlQ8v7fyhR-WD3b-2aRUpyw%3Fboth#useLexicalScope instead)
 /**
  * Used by the Qwik Optimizer to restore the lexical scoped variables.
  *
  * This method should not be present in the application source code.
  *
  * NOTE: `useLexicalScope` method can only be used in the synchronous portion of the callback
  * (before any `await` statements.)
  *
  * @public
  */
 // </docs>
 function useLexicalScope() {
     const context = getInvokeContext();
     const hostElement = context.hostElement;
     const qrl = (context.qrl ??
         parseQRL(decodeURIComponent(String(useURL())), hostElement));
     if (qrl.captureRef == null) {
         const el = context.element;
         assertDefined(el);
         resumeIfNeeded(getContainer(el));
         const ctx = getContext(el);
         qrl.captureRef = qrl.capture.map((idx) => qInflate(idx, ctx));
     }
     const subscriber = context.subscriber;
     if (subscriber) {
         return qrl.captureRef.map((obj) => wrapSubscriber(obj, subscriber));
     }
     return qrl.captureRef;
 }
 
 exports.$ = $;
 exports.Async = Async;
 exports.Fragment = Fragment;
 exports.Host = Host;
 exports.SkipRerender = SkipRerender;
 exports.Slot = Slot;
 exports.component$ = component$;
 exports.componentQrl = componentQrl;
 exports.getPlatform = getPlatform;
 exports.h = h;
 exports.implicit$FirstArg = implicit$FirstArg;
 exports.jsx = jsx;
 exports.jsxDEV = jsx;
 exports.jsxs = jsx;
 exports.noSerialize = noSerialize;
 exports.on = on;
 exports.onDocument = onDocument;
 exports.onPause$ = onPause$;
 exports.onPauseQrl = onPauseQrl;
 exports.onResume$ = onResume$;
 exports.onResumeQrl = onResumeQrl;
 exports.onUnmount$ = onUnmount$;
 exports.onUnmountQrl = onUnmountQrl;
 exports.onWindow = onWindow;
 exports.pauseContainer = pauseContainer;
 exports.qrl = qrl;
 exports.render = render;
 exports.setPlatform = setPlatform;
 exports.unwrapSubscriber = unwrapSubscriber;
 exports.useDocument = useDocument;
 exports.useEffect$ = useEffect$;
 exports.useEffectQrl = useEffectQrl;
 exports.useHostElement = useHostElement;
 exports.useLexicalScope = useLexicalScope;
 exports.useRef = useRef;
 exports.useScopedStyles$ = useScopedStyles$;
 exports.useScopedStylesQrl = useScopedStylesQrl;
 exports.useStore = useStore;
 exports.useStyles$ = useStyles$;
 exports.useStylesQrl = useStylesQrl;
 exports.useSubscriber = useSubscriber;
 exports.useWatch$ = useWatch$;
 exports.useWatchQrl = useWatchQrl;
 exports.version = version;
 exports.wrapSubscriber = wrapSubscriber;
 
 return exports; })(typeof exports === 'object' ? exports : {});
 //# sourceMappingURL=core.cjs.map
 