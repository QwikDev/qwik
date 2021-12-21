'use strict';

const global = globalThis;

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

/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
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

/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
// minification can replace the `globalThis.qDev` with `false`
// which will remove all dev code within from the build
const qDev$1 = globalThis.qDev !== false;
const qTest = globalThis.describe !== undefined;
const qGlobal = globalThis;

/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
const EMPTY_ARRAY$1 = [];
const EMPTY_OBJ$1 = {};
if (qDev$1) {
    Object.freeze(EMPTY_ARRAY$1);
    Object.freeze(EMPTY_OBJ$1);
}

/**
 * @public
 */
function jsx(type, props, key) {
    return new JSXNodeImpl(type, props, key);
}
class JSXNodeImpl {
    constructor(type, props, key) {
        this.type = type;
        this.props = props;
        this.key = key;
        if (props && props.children !== undefined) {
            if (Array.isArray(props.children)) {
                this.children = props.children;
            }
            else {
                this.children = [props.children];
            }
        }
        else {
            this.children = EMPTY_ARRAY$1;
        }
    }
}
const isJSXNode = (n) => {
    if (qDev$1) {
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
const Fragment = {};

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
        children: arguments.length > 2 ? flattenArray(children) : EMPTY_ARRAY$1,
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
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
function assertDefined(value, text) {
    if (qDev$1) {
        if (value != null)
            return;
        throw newError(text || 'Expected defined value.');
    }
}
function assertNotEqual(value1, value2, text) {
    if (qDev$1) {
        if (value1 !== value2)
            return;
        throw newError(text || `Expected '${value1}' !== '${value2}'.`);
    }
}
function assertEqual(value1, value2, text) {
    if (qDev$1) {
        if (value1 === value2)
            return;
        throw newError(text || `Expected '${value1}' === '${value2}'.`);
    }
}
function assertGreaterOrEqual(value1, value2, text) {
    if (qDev$1) {
        if (value1 >= value2)
            return;
        throw newError(text || `Expected '${value1}' >= '${value2}'.`);
    }
}
function assertGreater(value1, value2, text) {
    if (qDev$1) {
        if (value1 > value2)
            return;
        throw newError(text || `Expected '${value1}' > '${value2}'.`);
    }
}
function newError(text) {
    debugger; // eslint-disable-line no-debugger
    const error = new Error(text);
    console.error(error); // eslint-disable-line no-console
    return error;
}

/**
 * Returns true if the `node` is `Element` and of the right `tagName`.
 *
 * @param node
 * @private
 */
function isDomElementWithTagName(node, tagName) {
    return isHtmlElement(node) && node.tagName.toUpperCase() == tagName.toUpperCase();
}
/**
 * @private
 */
function isTemplateElement(node) {
    return isDomElementWithTagName(node, 'template');
}
/**
 * @private
 */
function isQSLotTemplateElement(node) {
    return isTemplateElement(node) && node.hasAttribute("q:slot" /* QSlotAttr */);
}
/**
 * @private
 */
function isComponentElement(node) {
    return isHtmlElement(node) && node.hasAttribute("on:q-render" /* OnRender */);
}
/**
 * @private
 */
function isHtmlElement(node) {
    return node ? node.nodeType === 1 /* ELEMENT_NODE */ : false;
}

/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
function isNode(value) {
    return value && typeof value.nodeType == 'number';
}
function isDocument(value) {
    return value && value.nodeType == 9 /* DOCUMENT_NODE */;
}
function isComment(value) {
    return isNode(value) && value.nodeType == 8 /* COMMENT_NODE */;
}

/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
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
    let html = '<' + element.tagName.toLowerCase();
    const attributes = element.attributes;
    const names = [];
    for (let i = 0; i < attributes.length; i++) {
        names.push(attributes[i].name);
    }
    names.sort();
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        let value = element.getAttribute(name);
        if (value === null || value === void 0 ? void 0 : value.startsWith('file:/')) {
            value = value.replace(/(file:\/\/).*(\/.*)$/, (all, protocol, file) => protocol + '...' + file);
        }
        html +=
            ' ' + name + (value == null || value == '' ? '' : "='" + value.replace("'", '&apos;') + "'");
    }
    return html + '>';
}

/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
function qError(code, ...args) {
    if (qDev$1) {
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
        [1 /* Core_qConfigNotFound_path */]: "QConfig not found in path '{}'.",
        [2 /* Core_unrecognizedStack_frame */]: "Unrecognized stack format '{}'",
        [3 /* Core_noAttribute_atr1_element */]: "Could not find entity state '{}' at '{}' or any of it's parents.",
        [4 /* Core_noAttribute_atr1_attr2_element */]: "Could not find entity state '{}' ( or entity provider '{}') at '{}' or any of it's parents.",
        [5 /* Core_missingProperty_name_props */]: "Missing property '{}' in props '{}'.",
        [6 /* Core_missingExport_name_url_props */]: "Missing export '{}' from '{}'. Exported symbols are: {}",
        //////////////
        [100 /* QRL_expectFunction_url_actual */]: "QRL '${}' should point to function, was '{}'.",
        //////////////
        [200 /* Injector_noHost_element */]: "Can't find host element above '{}'.",
        [201 /* Injector_expectedSpecificInjector_expected_actual */]: "Provider is expecting '{}' but got '{}'.",
        [202 /* Injector_notElement_arg */]: "Expected 'Element' was '{}'.",
        [203 /* Injector_wrongMethodThis_expected_actual */]: "Expected injection 'this' to be of type '{}', but was of type '{}'.",
        [204 /* Injector_missingSerializedState_entityKey_element */]: "Entity key '{}' is found on '{}' but does not contain state. Was 'serializeState()' not run during dehydration?",
        [206 /* Injector_notFound_element */]: "No injector can be found starting at '{}'.",
        [207 /* Injector_eventInjectorNotSerializable */]: 'EventInjector does not support serialization.',
        //////////////
        [300 /* Entity_notValidKey_key */]: "Data key '{}' is not a valid key.\n" +
            '  - Data key can only contain characters (preferably lowercase) or number\n' +
            '  - Data key is prefixed with entity name\n' +
            "  - Data key is made up from parts that are separated with ':'.",
        [301 /* Entity_keyAlreadyExists_key */]: "A entity with key '{}' already exists.",
        [303 /* Entity_invalidAttribute_name */]: "'{}' is not a valid attribute. " +
            "Attributes can only contain 'a-z' (lowercase), '0-9', '-' and '_'.",
        [304 /* Entity_missingExpandoOrState_attrName */]: "Found '{}' but expando did not have entity and attribute did not have state.",
        [305 /* Entity_elementMissingEntityAttr_element_attr */]: "Element '{}' is missing entity attribute definition '{}'.",
        [306 /* Entity_noState_entity_props */]: "Unable to create state for entity '{}' with props '{}' because no state found and '$newState()' method was not defined on entity.",
        [307 /* Entity_expected_obj */]: "'{}' is not an instance of 'Entity'.",
        [308 /* Entity_overridesConstructor_entity */]: "'{}' overrides 'constructor' property preventing 'EntityType' retrieval.",
        [311 /* Entity_no$keyProps_entity */]: "Entity '{}' does not define '$keyProps'.",
        [310 /* Entity_no$type_entity */]: "Entity '{}' must have static '$type' property defining the name of the entity.",
        [312 /* Entity_no$qrl_entity */]: "Entity '{}' must have static '$qrl' property defining the import location of the entity.",
        [313 /* Entity_nameCollision_name_currentQrl_expectedQrl */]: "Name collision. Already have entity named '{}' with QRL '{}' but expected QRL '{}'.",
        [309 /* Entity_keyMissingParts_key_key */]: "Entity key '{}' is missing values. Expecting '{}:someValue'.",
        [314 /* Entity_keyTooManyParts_entity_parts_key */]: "Entity '{}' defines '$keyProps' as  '{}'. Actual key '{}' has more parts than entity defines.",
        [315 /* Entity_keyNameMismatch_key_name_entity_name */]: "Key '{}' belongs to entity named '{}', but expected entity '{}' with name '{}'.",
        [316 /* Entity_stateMissingKey_state */]: "Entity state is missing '$key'. Are you sure you passed in state? Got '{}'.",
        //////////////
        [400 /* Component_bindNeedsKey */]: "'bind:' must have an key. (Example: 'bind:key=\"propertyName\"').",
        [401 /* Component_bindNeedsValue */]: "'bind:id' must have a property name. (Example: 'bind:key=\"propertyName\"').",
        [402 /* Component_needsState */]: "Can't find state on host element.",
        [403 /* Component_needsInjectionContext_constructor */]: "Components must be instantiated inside an injection context. Use '{}.new(...)' for creation.",
        [404 /* Component_noProperty_propName_props_host */]: "Property '{}' not found in '{}' on component '{}'.",
        [405 /* Component_notFound_component */]: "Unable to find '{}' component.",
        [406 /* Component_doesNotMatch_component_actual */]: "Requesting component type '{}' does not match existing component instance '{}'.",
        [408 /* Component_noState_component_props */]: "Unable to create state for component '{}' with props '{}' because no state found and '$newState()' method was not defined on component.",
        //////////////
        [500 /* Provider_unrecognizedFormat_value */]: "Unrecognized expression format '{}'.",
        //////////////
        [600 /* Render_unexpectedJSXNodeType_type */]: 'Unexpected JSXNode<{}> type.',
        [601 /* Render_unsupportedFormat_obj_attr */]: "Value '{}' can't be written into '{}' attribute.",
        [602 /* Render_expectingEntity_entity */]: "Expecting entity object, got '{}'.",
        [603 /* Render_expectingEntityArray_obj */]: "Expecting array of entities, got '{}'.",
        [604 /* Render_expectingEntityOrComponent_obj */]: "Expecting Entity or Component got '{}'.",
        [699 /* Render_stateMachineStuck */]: 'Render state machine did not advance.',
        //////////////
        [700 /* Event_emitEventRequiresName_url */]: "Missing '$type' attribute in the '{}' url.",
        [701 /* Event_emitEventCouldNotFindListener_event_element */]: "Re-emitting event '{}' but no listener found at '{}' or any of its parents.",
    }[code];
    let textCode = '000' + code;
    textCode = textCode.substr(textCode.length - 3);
    return `${area}(Q-${textCode}): ${text}`;
}

/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
/**
 * Lazy load a `QRL` symbol and returns the resulting value.
 *
 * @param element - Location of the URL to resolve against.
 * @param url - A relative URL (as `string` or `QRL`) or fully qualified `URL`
 * @returns A cached value synchronously or promise of imported value.
 * @public
 */
function qImport(element, url) {
    if (isParsedQRL(url)) {
        assertDefined(url._serialized);
        url = Array.isArray(url._serialized) ? url._serialized[0] : url._serialized;
    }
    if (qTest) {
        // This code is here for testing purposes only, and should never end up in production.
        const testSymbol = fromQRL(url);
        if (testSymbol) {
            return Promise.resolve(testSymbol);
        }
    }
    const doc = element.ownerDocument;
    const corePlatform = getPlatform(doc);
    const handler = corePlatform.importSymbol(element, url);
    return handler;
}
/**
 * Extract the QRL export name from a URL.
 *
 * This name is encoded in the hash of the URL, before any `?`.
 */
function qExport$1(url) {
    // 1 - optional `#` at the start.
    // 2 - capture group `$1` containing the export name, stopping at the first `?`.
    // 3 - the rest from the first `?` to the end.
    // The hash string is replaced by the captured group that contains only the export name.
    //                       1112222222333
    const match = url.match(/#([^?]*).*$/);
    return (match === null || match === void 0 ? void 0 : match[1]) || 'default';
}

const createPlatform$1 = (doc) => {
    let queuePromise;
    let storePromise;
    const cache = new Map();
    return {
        async importSymbol(element, url) {
            const urlDoc = toUrl(element.ownerDocument, element, url).toString();
            const symbolName = qExport$1(urlDoc);
            const urlCopy = new URL(urlDoc);
            urlCopy.hash = '';
            urlCopy.search = '';
            const importURL = urlCopy.href + '.js';
            let module = cache.get(importURL);
            if (!module) {
                module = (function (t) { return Promise.resolve().then(function () { return /*#__PURE__*/_interopNamespace(require(t)); }); })(importURL);
                cache.set(importURL, module);
            }
            return (await module)[symbolName];
        },
        queueRender: (renderMarked) => {
            if (!queuePromise) {
                queuePromise = new Promise((resolve, reject) => doc.defaultView.requestAnimationFrame(() => {
                    queuePromise = null;
                    renderMarked(doc).then(resolve, reject);
                }));
            }
            return queuePromise;
        },
        queueStoreFlush: (flushStore) => {
            if (!storePromise) {
                storePromise = new Promise((resolve, reject) => doc.defaultView.requestAnimationFrame(() => {
                    storePromise = null;
                    flushStore(doc).then(resolve, reject);
                }));
            }
            return storePromise;
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
    let _url;
    let _base = undefined;
    if (url === undefined) {
        //  recursive call
        if (element) {
            _url = element.getAttribute('q:base');
            _base = toUrl(doc, element.parentNode && element.parentNode.closest('[q\\:base]'));
        }
        else {
            _url = doc.baseURI;
        }
    }
    else if (url) {
        (_url = url), (_base = toUrl(doc, element.closest('[q\\:base]')));
    }
    else {
        throw new Error('INTERNAL ERROR');
    }
    return new URL(String(_url), _base);
}
/**
 * @public
 */
const setPlatform = (doc, plt) => (doc[DocumentPlatform] = plt);
/**
 * @public
 */
const getPlatform = (docOrNode) => {
    const doc = (isDocument(docOrNode) ? docOrNode : docOrNode.ownerDocument);
    return (doc[DocumentPlatform] ||
        (doc[DocumentPlatform] = createPlatform$1(doc)));
};
const DocumentPlatform = /*@__PURE__*/ Symbol();

/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
const camelToKebabCase = new Map();
function fromCamelToKebabCase(text, includeFirst = false) {
    if (typeof text != 'string')
        return text;
    const value = camelToKebabCase.get(text);
    if (value != null)
        return value;
    let converted = '';
    for (let x = 0; x < text.length; x++) {
        const ch = text.charAt(x);
        if (isUpperCase(ch)) {
            converted += (x != 0 || includeFirst ? '-' : '') + ch.toLowerCase();
        }
        else {
            converted += ch;
        }
    }
    camelToKebabCase.set(text, converted);
    return converted;
}
function isUpperCase(ch) {
    return 'A' <= ch && ch <= 'Z';
}

function QStore_hydrate(doc) {
    const script = doc.querySelector('script[type="qwik/json"]');
    let map = null;
    if (script) {
        script.parentElement.removeChild(script);
        map = JSON.parse(script.textContent || '{}');
        reviveQObjects(map);
        reviveNestedQObjects(map, map);
    }
    return map;
}
function QStore_dehydrate(doc) {
    const map = {};
    doc.querySelectorAll('[q\\:obj]').forEach((node) => {
        const props = qProps(node);
        const qMap = props.__qRefs__;
        clearQProps(node);
        assertDefined(qMap);
        qMap.forEach((v, k) => {
            map[k] = v.obj;
            collectQObjects(v, new Set(), (k, v) => (map[k] = v));
        });
    });
    const script = doc.createElement('script');
    script.setAttribute('type', 'qwik/json');
    script.textContent = JSON.stringify(map, function (key, value) {
        if (this === map)
            return value;
        if (key.startsWith('__'))
            return undefined;
        const id = getQObjectId(value);
        if (id)
            return JSON_OBJ_PREFIX + id;
        return value;
    }, qDev$1 ? '  ' : undefined);
    doc.body.appendChild(script);
    clearQPropsMap(doc);
}
function reviveQObjects(map) {
    for (const key in map) {
        if (Object.prototype.hasOwnProperty.call(map, key)) {
            const value = map[key];
            map[key] = _restoreQObject(value, key);
        }
    }
}
function reviveNestedQObjects(obj, map) {
    if (obj && typeof obj == 'object') {
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                const value = obj[i];
                if (typeof value == 'string' && value.startsWith(JSON_OBJ_PREFIX)) {
                    obj[i] = map[value.substring(JSON_OBJ_PREFIX.length)];
                }
                else {
                    reviveNestedQObjects(value, map);
                }
            }
        }
        else {
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const value = obj[key];
                    if (typeof value == 'string' && value.startsWith(JSON_OBJ_PREFIX)) {
                        obj[key] = map[value.substring(JSON_OBJ_PREFIX.length)];
                    }
                    else {
                        reviveNestedQObjects(value, map);
                    }
                }
            }
        }
    }
}
function collectQObjects(obj, seen, foundFn) {
    if (obj && typeof obj == 'object') {
        if (seen.has(obj))
            return;
        seen.add(obj);
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                collectQObjects(obj[i], seen, foundFn);
            }
        }
        else {
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const value = obj[key];
                    const id = getQObjectId(value);
                    if (id)
                        foundFn(id, value);
                    collectQObjects(value, seen, foundFn);
                }
            }
        }
    }
}

const Q_OBJECT_ATTR = 'q:obj';
function updateSubscriptions(element, map, idSubscriptionSet) {
    map.forEach((value, key) => {
        const qObj = value.obj;
        if (idSubscriptionSet.has(value.obj)) {
            // do nothing; already subscribed
            if (!value.isSub) {
                setMapFacade(map, getQObjectId(qObj), qObj, element, true, 1);
            }
        }
        else if (value.isSub) {
            // Unsubscribe
            value.isSub = false;
            releaseRef(value, map, key);
        }
        idSubscriptionSet.delete(qObj);
    });
    idSubscriptionSet.forEach((qObj) => setMapFacade(map, getQObjectId(qObj), qObj, element, true, 1));
    writeQObjAttr(element, map);
}
function writeQObjAttr(element, map) {
    const list = [];
    map.forEach((v, k) => {
        if (v.isSub)
            k = '!' + k;
        v.count == 1 ? list.push(k) : list.push('#' + v.count, k);
    });
    if (list.length) {
        element.setAttribute(Q_OBJECT_ATTR, list.join(' '));
    }
    else {
        element.removeAttribute(Q_OBJECT_ATTR);
    }
}
function createMapFacade(element, map) {
    return {
        forEach(fn) {
            return map.forEach((v, k) => {
                fn(v.obj, k);
            });
        },
        get(key) {
            const value = map.get(key);
            return value === null || value === void 0 ? void 0 : value.obj;
        },
        set(key, qObj) {
            setMapFacade(map, key, qObj, element, false, 1);
            writeQObjAttr(element, map);
        },
    };
}
function setMapFacade(map, key, qObj, element, subscribed, count) {
    assertDefined(key);
    let value = map.get(key);
    if (qObj) {
        QObject_addDoc(qObj, element.ownerDocument);
        if (value) {
            value.count += count;
            value.isSub = value.isSub || subscribed;
        }
        else {
            map.set(key, (value = { obj: qObj, count, isSub: subscribed }));
        }
    }
    else {
        if (value) {
            value = releaseRef(value, map, key);
        }
    }
    return value;
}
function releaseRef(value, map, key) {
    value.count--;
    if (value.count == 0) {
        map.delete(key);
        return undefined;
    }
    return value;
}
function loadObjectsFromState(element, storeMap) {
    const qProps = newQProps(element);
    const objs = element.getAttribute(Q_OBJECT_ATTR);
    if (objs) {
        const parts = objs.split(' ');
        const qMap = qProps.__qRefs__;
        let lastCount = 1;
        parts.forEach((key) => {
            if (key.startsWith('#')) {
                lastCount = Number(key.substr(1));
            }
            else {
                let isSubscribed = false;
                if (key.startsWith('!')) {
                    key = key.substr(1);
                    isSubscribed = true;
                }
                const qObj = storeMap[key];
                setMapFacade(qMap, key, qObj, element, isSubscribed, lastCount);
            }
        });
    }
}

// TODO(misko): For better debugger experience the qProps should never store Proxy, always naked objects to make it easier to traverse in the debugger.
const Q_IS_HYDRATED = '__isHydrated__';
const Q_PROP = 'qProps';
function hydrateIfNeeded(element) {
    const doc = element.ownerDocument;
    const isHydrated = doc[Q_IS_HYDRATED];
    if (!isHydrated) {
        doc[Q_IS_HYDRATED] = true;
        const map = QStore_hydrate(element.ownerDocument);
        if (map) {
            doc.querySelectorAll(Q_OBJECT_ATTR_SELECTOR).forEach((element) => {
                loadObjectsFromState(element, map);
            });
        }
    }
}
function clearQPropsMap(doc) {
    doc[Q_IS_HYDRATED] = undefined;
}
function clearQProps(element) {
    element[Q_PROP] = undefined;
}
const Q_OBJECT_ATTR_SELECTOR = '[q\\:obj]';
const STATE_PREFIX = 'state:';
const ON_PREFIX = 'on:';
function newQProps(element) {
    const qObjRefMap = new Map();
    const qObjMap = createMapFacade(element, qObjRefMap);
    const cache = {
        __element__: element,
        __qRefs__: qObjRefMap,
        __qMap__: qObjMap,
        __mutation__: false,
    };
    return (element[Q_PROP] = new Proxy(cache, {
        get: (target, prop) => {
            if (typeof prop == 'string') {
                if (prop === '__mutation__') {
                    const mutation = target.__mutation__;
                    target.__mutation__ = false;
                    return mutation;
                }
                else if (prop == '__parent__') {
                    const parent = element.parentElement;
                    return parent && qProps(parent);
                }
                else if (prop.startsWith(ON_PREFIX)) {
                    return createInvokeFn(cache, qObjMap, prop);
                }
                if (prop in cache) {
                    return target[prop];
                }
                if (prop.startsWith(STATE_PREFIX)) {
                    return (cache[prop] = findState(qObjMap, prop.substr(STATE_PREFIX.length)));
                }
                else {
                    return (cache[prop] = readAttribute(element, qObjMap, prop));
                }
            }
        },
        set: (target, prop, value) => {
            if (typeof prop == 'string') {
                if (prop === 'children')
                    return true;
                if (prop.startsWith(STATE_PREFIX)) {
                    const id = getQObjectId(value);
                    assertDefined(id);
                    assertEqual(id.startsWith(prop.substr(STATE_PREFIX.length)), true);
                    qObjMap.set(id, (target[prop] = value));
                }
                else if (prop.startsWith(ON_PREFIX)) {
                    addQrlListener(cache, qObjMap, prop, value);
                }
                else if (prop === ':subscriptions') {
                    updateSubscriptions(element, qObjRefMap, value);
                }
                else {
                    value = wrap(value);
                    const existingValue = prop in target ? target[prop] : (target[prop] = readAttribute(element, qObjMap, prop));
                    /**
                    const qObjs = diff(existingValue, value);
                    if (qObjs) {
                      qObjs.forEach((id) => qObjMap.set(id, null!));
                      writeAttribute(element, qObjMap, prop, (target[prop] = value));
                      target.__mutation__ = true;
                    }
                    */
                    if (value !== existingValue) {
                        const existingId = getQObjectId(existingValue);
                        existingId && qObjMap.set(existingId, null);
                        writeAttribute(element, qObjMap, prop, (target[prop] = value));
                        target.__mutation__ = true;
                    }
                }
                return true;
            }
            else {
                // TODO(misko): Better error/test
                throw new Error('Only string keys are supported');
            }
        },
    }));
}
function readAttribute(element, map, propName) {
    if (propName.startsWith(ON_PREFIX)) {
        const attrName = fromCamelToKebabCase(propName.substr(3));
        const attrValue = element.getAttribute(attrName);
        const listeners = [];
        attrValue === null || attrValue === void 0 ? void 0 : attrValue.split('\n').forEach((qrl) => {
            listeners.push(parseQRL(qrl, map));
        });
        return listeners;
    }
    else {
        const attrName = fromCamelToKebabCase(propName);
        const attrValue = element.getAttribute(attrName);
        if (attrValue === null) {
            return undefined;
        }
        else {
            return qJsonParse(attrValue, map);
        }
    }
}
function writeAttribute(element, map, propName, value) {
    const attrName = fromCamelToKebabCase(propName);
    if (propName == 'class') {
        element.setAttribute('class', stringifyClassOrStyle(value, true));
    }
    else if (propName == 'style') {
        element.setAttribute('style', stringifyClassOrStyle(value, false));
    }
    else if (propName === 'innerHTML' || propName === 'innerText') {
        element.setAttribute(attrName, '');
        element[propName] = value;
    }
    else {
        const newValue = qJsonStringify(value, map);
        if (value === undefined) {
            element.removeAttribute(attrName);
        }
        else {
            element.setAttribute(attrName, newValue);
        }
    }
    if ((propName == 'value' || propName == 'checked') && element.tagName === 'INPUT') {
        // INPUT properties `value` and `checked` are special because they can go out of sync
        // between the attribute and what the user entered, so they have special treatment.
        element[propName] = value;
    }
}
function findState(map, stateName) {
    let state = null;
    stateName += Q_OBJECT_PREFIX_SEP;
    map.forEach((v, k) => {
        if (k.startsWith(stateName)) {
            state = v;
        }
    });
    return state;
}
function addQrlListener(cache, map, prop, value) {
    if (!value)
        return;
    if (typeof value == 'string' || value instanceof String) {
        value = parseQRL(value, undefined /** Don't expect objects in strings */);
    }
    if (value instanceof ParsedQRL) {
        const existingQRLs = getExistingQRLs(cache, map, prop);
        let found = false;
        for (let index = 0; index < existingQRLs.length; index++) {
            const existingQRL = existingQRLs[index];
            if (isSameHandler(existingQRL, value)) {
                found = true;
                replaceQRL(existingQRLs, map, index, value);
                break;
            }
        }
        if (!found) {
            replaceQRL(existingQRLs, map, existingQRLs.length, value);
        }
        const kababProp = ON_PREFIX + fromCamelToKebabCase(prop.substr(ON_PREFIX.length));
        cache.__element__.setAttribute(kababProp, serializeQRLs(existingQRLs));
    }
    else {
        // TODO(misko): Test/better text
        throw new Error(`Not QRL: prop: ${prop}; value: ` + value);
    }
}
function getExistingQRLs(cache, map, prop) {
    if (prop in cache)
        return cache[prop];
    const kababProp = ON_PREFIX + fromCamelToKebabCase(prop.substr(ON_PREFIX.length));
    const parts = [];
    (cache.__element__.getAttribute(kababProp) || '').split('\n').forEach((qrl) => {
        if (qrl) {
            parts.push(parseQRL(qrl, map));
        }
    });
    return (cache[prop] = parts);
}
function isSameHandler(existing, actual) {
    return (existing.url == actual.url &&
        existing.symbol == actual.symbol &&
        existing.getState() == actual.getState());
}
function serializeQRLs(existingQRLs) {
    return existingQRLs
        .map((qrl) => {
        assertDefined(qrl._serialized);
        return qrl._serialized;
    })
        .join('\n');
}
function replaceQRL(existingQRLs, map, index, newQrl) {
    const existing = index < existingQRLs.length ? existingQRLs[index] : null;
    if (existing && Array.isArray(existing._serialized)) {
        existing._serialized.forEach((key, index) => {
            if (index) {
                // need to skip the first one.
                map.set(key, null);
            }
        });
    }
    stringifyQRL(newQrl, map);
    existingQRLs[index] = newQrl;
}
function createInvokeFn(cache, map, prop) {
    const existingQRLs = getExistingQRLs(cache, map, prop);
    if (existingQRLs.length === 0)
        return null;
    return (event) => {
        return Promise.all(existingQRLs.map(async (qrl) => {
            const fn = await qImport(cache.__element__, qrl);
            const element = cache.__element__;
            const qrlString = Array.isArray(qrl._serialized) ? qrl._serialized[0] : qrl._serialized;
            const url = new URL(qrlString, element.ownerDocument.baseURI);
            return { state: qrl.getState(), value: await fn(element, event, url) };
        }));
    };
}
function didQPropsChange(qProps) {
    return qProps.__mutation__;
}
/**
 * Turn an `Array` or object literal into a `class` or `style`
 *
 * @param obj `string`, `Array` or object literal
 * @param isClass `true` if expecting `class` output
 * @returns `string`
 */
function stringifyClassOrStyle(obj, isClass) {
    if (obj == null)
        return '';
    if (typeof obj == 'object') {
        let text = '';
        let sep = '';
        if (Array.isArray(obj)) {
            if (!isClass) {
                throw qError(601 /* Render_unsupportedFormat_obj_attr */, obj, 'style');
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
                    text += isClass ? (value ? sep + key : '') : sep + key + ':' + value;
                    sep = isClass ? ' ' : ';';
                }
            }
        }
        return text;
    }
    return String(obj);
}

/**
 * @public
 */
function qProps(element) {
    hydrateIfNeeded(element);
    let qProps = element[Q_PROP];
    if (!qProps) {
        qProps = newQProps(element);
    }
    return qProps;
}

/**
 * Remove item from array (Same as `Array.splice()` but faster.)
 *
 * `Array.splice()` is not as fast because it has to allocate an array for the elements which were
 * removed. This causes memory pressure and slows down code when most of the time we don't
 * care about the deleted items array.
 *
 * https://jsperf.com/fast-array-splice (About 20x faster)
 *
 * @param array Array to splice
 * @param index Index of element in array to remove.
 * @param count Number of items to remove.
 */
/**
 * Same as `Array.splice2(index, 0, value1, value2)` but faster.
 *
 * `Array.splice()` is not fast because it has to allocate an array for the elements which were
 * removed. This causes memory pressure and slows down code when most of the time we don't
 * care about the deleted items array.
 *
 * @param array Array to splice.
 * @param index Index in array where the `value` should be added.
 * @param value1 Value to add to array.
 * @param value2 Value to add to array.
 */
function arrayInsert2(array, index, value1, value2) {
    let end = array.length;
    if (end == index) {
        // inserting at the end.
        array.push(value1, value2);
    }
    else if (end === 1) {
        // corner case when we have less items in array than we have items to insert.
        array.push(value2, array[0]);
        array[0] = value1;
    }
    else {
        end--;
        array.push(array[end - 1], array[end]);
        while (end > index) {
            const previousEnd = end - 2;
            array[end] = array[previousEnd];
            end--;
        }
        array[index] = value1;
        array[index + 1] = value2;
    }
}
function keyValueArrayGet(keyValueArray, key, notFoundFactory) {
    const index = keyValueArrayIndexOf(keyValueArray, key);
    if (index >= 0) {
        // if we found it retrieve it.
        return keyValueArray[index | 1];
    }
    if (notFoundFactory) {
        const value = notFoundFactory();
        arrayInsert2(keyValueArray, ~index, key, value);
        return value;
    }
    return undefined;
}
/**
 * Retrieve a `key` index value in the array or `-1` if not found.
 *
 * @param keyValueArray to search.
 * @param key The key to locate.
 * @returns index of where the key is (or should have been.)
 *   - positive (even) index if key found.
 *   - negative index if key not found. (`~index` (even) to get the index where it should have
 *     been inserted.)
 */
function keyValueArrayIndexOf(keyValueArray, key) {
    return _arrayIndexOfSorted(keyValueArray, key, 1);
}
/**
 * INTERNAL: Get an index of an `value` in a sorted `array` by grouping search by `shift`.
 *
 * NOTE:
 * - This uses binary search algorithm for fast removals.
 *
 * @param array A sorted array to binary search.
 * @param value The value to look for.
 * @param shift grouping shift.
 *   - `0` means look at every location
 *   - `1` means only look at every other (even) location (the odd locations are to be ignored as
 *         they are values.)
 * @returns index of the value.
 *   - positive index if value found.
 *   - negative index if value not found. (`~index` to get the value where it should have been
 * inserted)
 */
function _arrayIndexOfSorted(array, value, shift) {
    let start = 0;
    let end = array.length >> shift;
    while (end !== start) {
        const middle = start + ((end - start) >> 1); // find the middle.
        const current = array[middle << shift];
        if (value === current) {
            return middle << shift;
        }
        else if (current > value) {
            end = middle;
        }
        else {
            start = middle + 1; // We already searched middle so make it non-inclusive by adding 1
        }
    }
    return ~(end << shift);
}

function isSlotMap(value) {
    return Array.isArray(value);
}
/**
 * Retrieves the current `SlotMap` from `QComponent`
 *
 *
 * This method collects the content `Node`s for a given component.
 *
 * @param component
 * @returns
 */
function getSlotMap(component) {
    const slots = [];
    const host = component.hostElement;
    const firstChild = host.firstElementChild;
    if (isQSlotTemplate(firstChild)) {
        slotMapAddChildren(slots, firstChild.content, null);
    }
    const previousSlots = [];
    host.querySelectorAll("Q\\:SLOT" /* QSlotSelector */).forEach((qSlot) => {
        for (const parent of previousSlots) {
            if (parent.contains(qSlot)) {
                // When we do `querySelectorAll` it is possible that we get `<q:slot>`
                // which are children of existing `<q:slot>`. This check is here
                // to make sure that we don't get `<q:lsot>` recursively.
                // <component>
                //   <q:slot include-me>
                //     <q:slot dont-include-me></q:slot>
                //   </q:slot>
                // </component>
                return;
            }
        }
        previousSlots.push(qSlot);
        const name = qSlot.getAttribute('name') || '';
        slotMapAddChildren(slots, qSlot, name);
    });
    return slots;
}
/**
 * Determines if the `node` is `<template q:slot>` used for storing un-projected items.
 */
function isQSlotTemplate(node) {
    return isDomElementWithTagName(node, 'template') && node.hasAttribute("q:slot" /* QSlotAttr */);
}
/**
 * Add projected nodes into `SlotMap`.
 *
 * See `SlotMap` for the layout.
 *
 * @param slots
 * @param parent Parent whoes children should be added to the `slots`.
 */
function slotMapAddChildren(slots, parent, name) {
    _slotParent = parent;
    let child = parent.firstChild;
    if (name !== null) {
        keyValueArrayGet(slots, name, emptyArrayFactory);
    }
    while (child) {
        const slotName = name !== null
            ? name
            : (isHtmlElement(child) && child.getAttribute("q:slot" /* QSlotAttr */)) || '';
        keyValueArrayGet(slots, slotName, emptyArrayFactory).push(child);
        child = child.nextSibling;
    }
    _slotParent = undefined;
}
let _slotParent;
function emptyArrayFactory() {
    return [-1, _slotParent];
}

/**
 * Create a cursor which reconciles logical children.
 *
 * Here logical means children as defined by JSX. (This will be same as DOM except
 * in the case of projection.) In case of projection the cursor will correctly
 * deal with the logical children of the View (rather then rendered children.)
 *
 * See: `cursorForComponent`
 *
 * @param parent Parent `Element` whose children should be reconciled.
 */
function cursorForParent(parent) {
    let firstChild = parent.firstChild;
    if (firstChild && firstChild.nodeType === 10 /* DOCUMENT_TYPE_NODE */) {
        firstChild = firstChild.nextSibling;
    }
    return newCursor(parent, firstChild, null);
}
function newCursor(parent, node, end) {
    return { parent, node, end };
}
function getNode(cursor) {
    const node = cursor.node;
    return cursor.end == node ? null : node;
}
function setNode(cursor, node) {
    cursor.node = cursor.end == node ? null : node;
}
function cursorClone(cursor) {
    return newCursor(cursor.parent, cursor.node, cursor.end);
}
/**
 * Reconcile view children of a component.
 *
 * Use this method to create a cursor when reconciling a component's view.
 *
 * The main point of this method is to skip the `<template q:slot/>` Node.
 *
 * @param componentHost Component host element for which view children should be
 *     reconciled.
 * @returns
 */
function cursorForComponent(componentHost) {
    assertEqual(isComponentElement(componentHost), true);
    let firstNonTemplate = componentHost.firstChild;
    if (isQSLotTemplateElement(firstNonTemplate)) {
        firstNonTemplate = firstNonTemplate.nextSibling;
    }
    return newCursor(componentHost, firstNonTemplate, null);
}
/**
 * Ensure that node at cursor is an `Element` with given attributes.
 *
 * Reconciles the current cursor location with `expectTag`/`expectProps`.
 * This method will either leave the element alone if it matches, updates the
 * props, or completely removes and replaces the node with correct element.
 *
 * After invocation of this method, the cursor is advanced to the next sibling.
 *
 * @param cursor
 * @param component `ComponentRenderContext` of the component to whom the view childer
 *        logically belong.
 * @param expectTag
 * @param expectProps
 * @param componentRenderQueue Set if the current element is a component.
 *    This means that the reconciliation should detect input changes and if
 *    present add the component to the `componentRenderQueue` for further processing.
 * @returns Child `Cursor` to reconcile the children of this `Element`.
 */
function cursorReconcileElement(cursor, component, expectTag, expectProps, componentRenderQueue) {
    let node = getNode(cursor);
    assertNotEqual(node, undefined, 'Cursor already closed');
    if (isSlotMap(node)) {
        assertDefined(cursor.parent);
        return slotMapReconcileSlots(cursor.parent, node, cursor.end, component, expectTag, expectProps, componentRenderQueue);
    }
    else {
        assertNotEqual(node, undefined, 'Cursor already closed');
        node = _reconcileElement(cursor.parent, node, cursor.end, component, expectTag, expectProps, componentRenderQueue);
        assertDefined(node);
        setNode(cursor, node.nextSibling);
        return _reconcileElementChildCursor(node, !!componentRenderQueue);
    }
}
function slotMapReconcileSlots(parent, slots, end, component, expectTag, expectProps, componentRenderQueue) {
    const slotName = expectProps["q:slot" /* QSlotAttr */] || '';
    const namedSlot = keyValueArrayGet(slots, slotName);
    let childNode;
    if (namedSlot) {
        assertGreaterOrEqual(namedSlot.length, 2);
        const parent = namedSlot[1 /* parent */];
        let index = namedSlot[0 /* index */];
        if (index == -1) {
            index = 2;
        }
        childNode = (namedSlot.length > index ? namedSlot[index] : null);
        const node = _reconcileElement(parent, childNode, end, component, expectTag, expectProps, componentRenderQueue);
        if (childNode !== node) {
            namedSlot[index] = node;
            childNode = node;
        }
        namedSlot[0 /* index */] = index + 1;
    }
    else {
        const template = getUnSlottedStorage(parent);
        childNode = _reconcileElement(template.content, null, end, component, expectTag, expectProps, true);
        assertDefined(childNode);
    }
    return _reconcileElementChildCursor(childNode, !!componentRenderQueue);
}
function _reconcileElement(parent, existing, end, component, expectTag, expectProps, componentRenderQueue) {
    let shouldDescendIntoComponent;
    let reconciledElement;
    if (isDomElementWithTagName(existing, expectTag)) {
        const props = qProps(existing);
        Object.assign(props, expectProps);
        shouldDescendIntoComponent = didQPropsChange(props) && !!componentRenderQueue;
        reconciledElement = existing;
    }
    else {
        // Expected node and actual node did not match. Need to switch.
        reconciledElement = replaceNode(parent, existing, (isDocument(parent) ? parent : parent.ownerDocument).createElement(expectTag), end);
        shouldDescendIntoComponent = !!componentRenderQueue;
        Object.assign(qProps(reconciledElement), expectProps);
    }
    component && component.styleClass && reconciledElement.classList.add(component.styleClass);
    if (shouldDescendIntoComponent) {
        const hostComponent = getQComponent(reconciledElement);
        hostComponent.styleHostClass && reconciledElement.classList.add(hostComponent.styleHostClass);
        if (Array.isArray(componentRenderQueue)) {
            componentRenderQueue.push(hostComponent.render());
        }
        else if (reconciledElement.getAttribute("on:q-render" /* OnRender */)) {
            reconciledElement.setAttribute("on:q-render-notify" /* RenderNotify */, '');
        }
    }
    return reconciledElement;
}
function _reconcileElementChildCursor(node, isComponent) {
    assertDefined(node);
    if (isComponent) {
        // We are a component. We need to return Slots
        return newCursor(node, getSlotMap(getQComponent(node)), null);
    }
    else {
        // Not a component, normal return.
        return cursorForParent(node);
    }
}
/**
 * Ensure that node at cursor is a `Text`.
 *
 * Reconciles the current cursor location with expected text.
 * This method will either leave the text alone if it matches, updates the
 * text, or completely removes and replaces the node with correct text.
 *
 * After invocation of this method, the cursor is advanced to the next sibling.
 *
 * @param cursor
 * @param expectText
 */
function cursorReconcileText(cursor, expectText) {
    let node = getNode(cursor);
    assertNotEqual(node, undefined, 'Cursor already closed');
    assertDefined(cursor.parent);
    if (isSlotMap(node)) {
        let parent;
        let childNode;
        const namedSlot = keyValueArrayGet(node, '');
        if (namedSlot) {
            assertGreaterOrEqual(namedSlot.length, 2);
            parent = namedSlot[1 /* parent */];
            let index = namedSlot[0 /* index */];
            if (index == -1) {
                index = 2;
            }
            childNode = (namedSlot.length > index ? namedSlot[index] : null);
            node = _reconcileText(parent, childNode, cursor.end, expectText);
            if (childNode !== node) {
                namedSlot[index] = node;
            }
            namedSlot[0 /* index */] = index + 1;
        }
        else {
            const template = getUnSlottedStorage(cursor.parent);
            _reconcileText(template.content, null, cursor.end, expectText);
        }
    }
    else {
        node = _reconcileText(cursor.parent, node, cursor.end, expectText);
        setNode(cursor, node.nextSibling);
    }
}
function _reconcileText(parent, node, beforeNode, expectText) {
    // Reconcile as Text Node
    if (node && node.nodeType == 3 /* TEXT_NODE */) {
        if (node.textContent !== expectText) {
            node.textContent = expectText;
        }
    }
    else {
        // Expected node and actual node did not match. Need to switch.
        node = replaceNode(parent, node, parent.ownerDocument.createTextNode(expectText), beforeNode);
    }
    return node;
}
/**
 * Close out the cursor and clear any extra elements.
 *
 * Invocation of this method indicates that no mare Nodes after the cursor are expected.
 * This is a signal to remove any excess `Node`s if present.
 *
 * @param cursor
 */
function cursorReconcileEnd(cursor) {
    let node = getNode(cursor);
    if (isSlotMap(node)) {
        for (let i = 0; i < node.length; i = i + 2) {
            const namedSlot = node[i + 1];
            if (namedSlot[0 /* index */] !== -1) {
                assertGreater(namedSlot[0 /* index */], 1 /* parent */);
                for (let k = namedSlot[0 /* index */]; k < namedSlot.length; k++) {
                    namedSlot[1 /* parent */].removeChild(namedSlot[k]);
                }
            }
        }
    }
    else {
        while (node) {
            const next = node.nextSibling;
            cursor.parent.removeChild(node);
            node = next;
        }
    }
    setNode(cursor, undefined);
}
function getUnSlottedStorage(componentElement) {
    assertEqual(isComponentElement(componentElement), true, 'Must be component element');
    let template = componentElement === null || componentElement === void 0 ? void 0 : componentElement.firstElementChild;
    if (!isDomElementWithTagName(template, 'template') ||
        !template.hasAttribute("q:slot" /* QSlotAttr */)) {
        template = componentElement.insertBefore(componentElement.ownerDocument.createElement('template'), template);
        template.setAttribute("q:slot" /* QSlotAttr */, '');
    }
    return template;
}
const V_NODE_START = '<node:';
const V_NODE_END = '</node:';
function cursorReconcileVirtualNode(cursor) {
    var _a;
    let node = getNode(cursor);
    if (isSlotMap(node)) {
        // TODO(misko): proper error and test;
        throw new Error('Not expecting slot map here');
    }
    else {
        if (isComment(node) && ((_a = node.textContent) === null || _a === void 0 ? void 0 : _a.startsWith(V_NODE_START))) {
            throw new Error('IMPLEMENT');
        }
        else {
            const id = Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
            const parent = cursor.parent;
            const doc = parent.ownerDocument;
            const startVNode = doc.createComment(V_NODE_START + id + '>');
            const endVNode = doc.createComment(V_NODE_END + id + '>');
            node = replaceNode(cursor.parent, node, endVNode, null);
            cursor.parent.insertBefore(startVNode, endVNode);
            setNode(cursor, endVNode.nextSibling);
            return newCursor(parent, startVNode, endVNode);
        }
    }
}
function cursorReconcileStartVirtualNode(cursor) {
    const node = getNode(cursor);
    assertEqual(isComment(node) && node.textContent.startsWith(V_NODE_START), true);
    setNode(cursor, node && node.nextSibling);
}
function replaceNode(parentNode, existingNode, newNode, insertBefore) {
    parentNode.insertBefore(newNode, existingNode || insertBefore);
    if (existingNode) {
        parentNode.removeChild(existingNode);
    }
    return newNode;
}

/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
/**
 * Converts a tree of Promises into a flat array of resolved promise values.
 *
 * @param tree - array of arrays of values or promises of values.
 * @returns a `Promise` of array of values.
 */
function flattenPromiseTree(tree) {
    return Promise.all(tree).then((values) => {
        const flatArray = flattenArray(values);
        for (let i = 0; i < flatArray.length; i++) {
            if (isPromise(flatArray[i])) {
                return flattenPromiseTree(flatArray);
            }
        }
        return flatArray;
    });
}
function isPromise(value) {
    return value instanceof Promise;
}

/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
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
const Slot = {
    __brand__: 'slot',
};

function visitJsxNode(component, renderQueue, cursor, jsxNode) {
    if (isJSXNode(jsxNode)) {
        const nodeType = jsxNode.type;
        if (nodeType == null)
            return;
        if (typeof nodeType === 'string') {
            visitJsxLiteralNode(component, renderQueue, cursor, jsxNode);
        }
        else if (nodeType === Fragment || nodeType == null) {
            const jsxChildren = jsxNode.children || EMPTY_ARRAY$1;
            for (const jsxChild of jsxChildren) {
                visitJsxNode(component, renderQueue, cursor, jsxChild);
            }
        }
        else if (jsxNode.type === Host) {
            const props = qProps(cursor.parent);
            Object.assign(props, jsxNode.props);
            const jsxChildren = jsxNode.children || EMPTY_ARRAY$1;
            for (const jsxChild of jsxChildren) {
                visitJsxNode(component, renderQueue, cursor, jsxChild);
            }
            didQPropsChange(props);
        }
        else if (jsxNode.type === Slot) {
            component && visitQSlotJsxNode(component, renderQueue, cursor, jsxNode);
        }
        else if (typeof jsxNode.type === 'function') {
            visitJsxNode(component, renderQueue, cursor, jsxNode.type(jsxNode.props));
        }
        else {
            throw qError(600 /* Render_unexpectedJSXNodeType_type */, nodeType);
        }
    }
    else if (isPromise(jsxNode)) {
        const vNodeCursor = cursorReconcileVirtualNode(cursor);
        const render = (jsxNode) => {
            cursorReconcileStartVirtualNode(vNodeCursor);
            visitJsxNode(component, renderQueue, vNodeCursor, jsxNode);
            cursorReconcileEnd(vNodeCursor);
        };
        jsxNode.then(render, render);
        if (jsxNode.whilePending) {
            const vNodePending = cursorClone(vNodeCursor);
            cursorReconcileStartVirtualNode(vNodePending);
            visitJsxNode(component, renderQueue, vNodePending, jsxNode.whilePending);
            cursorReconcileEnd(vNodePending);
        }
    }
    else if (Array.isArray(jsxNode)) {
        const jsxChildren = jsxNode;
        for (const jsxChild of jsxChildren) {
            visitJsxNode(component, renderQueue, cursor, jsxChild);
        }
    }
    else if (typeof jsxNode === 'string' || typeof jsxNode === 'number') {
        // stringify
        cursorReconcileText(cursor, String(jsxNode));
    }
}
function visitJsxLiteralNode(component, renderQueue, cursor, jsxNode) {
    const jsxTag = jsxNode.type;
    const isQComponent = "on:q-render" /* OnRender */ in jsxNode.props;
    const elementCursor = cursorReconcileElement(cursor, component, jsxTag, jsxNode.props, isQComponent ? renderQueue : null);
    if (!hasInnerHtmlOrTextBinding(jsxNode)) {
        // we don't process children if we have inner-html bound to something.
        const jsxChildren = jsxNode.children || EMPTY_ARRAY$1;
        for (const jsxChild of jsxChildren) {
            visitJsxNode(component, renderQueue, elementCursor, jsxChild);
        }
        cursorReconcileEnd(elementCursor);
    }
    else if (isQComponent) {
        //TODO(misko): needs tests and QError.
        throw new Error('innerHTML/innerText bindings not supported on component content');
    }
}
function hasInnerHtmlOrTextBinding(jsxNode) {
    return 'innerHTML' in jsxNode.props || 'innerText' in jsxNode.props;
}
function visitQSlotJsxNode(component, renderQueue, cursor, jsxNode) {
    const slotName = jsxNode.props.name || '';
    const slotCursor = cursorReconcileElement(cursor, component, "Q:SLOT" /* QSlot */, Object.assign({ ["name" /* QSlotName */]: slotName }, jsxNode.props), null);
    const slotMap = getSlotMap(component);
    const namedSlot = keyValueArrayGet(slotMap, slotName);
    if (namedSlot && namedSlot.length > 2 /* firstNode */) {
        // project existing nodes.
        const cursorParent = slotCursor.parent;
        if (namedSlot[1 /* parent */] !== cursorParent) {
            // The only time we need to do anything if the existing elements are not already
            // in the right spot. Move them.
            cursorReconcileEnd(slotCursor); // clear anything which is already in.
            for (let i = 2 /* firstNode */; i < namedSlot.length; i++) {
                const node = namedSlot[i];
                cursorParent.appendChild(node);
            }
            cursorReconcileEnd(slotCursor);
        }
        cursorParent.querySelectorAll("[on\\:q-render-notify]" /* RenderNotifySelector */).forEach((compElem) => {
            renderQueue.push(getQComponent(compElem).render());
        });
    }
    else {
        // fallback to default value projection.
        const jsxChildren = jsxNode.children;
        for (const jsxChild of jsxChildren) {
            visitJsxNode(component, renderQueue, slotCursor, jsxChild);
        }
        cursorReconcileEnd(slotCursor);
    }
}

// TODO(misko): Can we get rid of this whole file, and instead teach qProps to know how to render
// the advantage will be that the render capability would then be exposed to the outside world as well.
class QComponentCtx {
    constructor(hostElement) {
        this.styleId = null;
        this.styleClass = null;
        this.styleHostClass = null;
        this.hostElement = hostElement;
        const scopedStyleId = (this.styleId = styleKey(hostElement.getAttribute("q:sstyle" /* ComponentStyles */)));
        if (scopedStyleId) {
            this.styleHostClass = styleHost(scopedStyleId);
            this.styleClass = styleContent(scopedStyleId);
        }
    }
    dehydrate() {
        throw new Error('Method not implemented.');
    }
    async render() {
        const props = qProps(this.hostElement);
        // TODO(misko): extract constant
        if (props['state:'] == null) {
            try {
                const scopedStyle = props["q:sstyle" /* ComponentStyles */];
                const unscopedStyle = props["q:ustyle" /* ComponentUnscopedStyles */];
                insertStyleIfNeeded(this, scopedStyle);
                insertStyleIfNeeded(this, unscopedStyle);
                const hook = props['on:qMount'];
                if (hook) {
                    const values = await hook('qMount');
                    values.forEach((v) => {
                        props['state:' + v.state] = _stateQObject(v.value, v.state);
                    });
                }
            }
            catch (e) {
                // TODO(misko): Proper error handling
                // eslint-disable-next-line no-console
                console.log(e);
            }
        }
        const onRender = props['on:qRender']; // TODO(misko): extract constant
        assertDefined(onRender);
        this.hostElement.removeAttribute("on:q-render-notify" /* RenderNotify */);
        const renderQueue = [];
        try {
            const returnValue = await onRender('qRender');
            if (returnValue.length) {
                const jsxNode = returnValue[0].value;
                const cursor = cursorForComponent(this.hostElement);
                visitJsxNode(this, renderQueue, cursor, jsxNode);
                cursorReconcileEnd(cursor);
            }
        }
        catch (e) {
            // TODO(misko): Proper error handling
            // eslint-disable-next-line no-console
            console.log(e);
        }
        return [this.hostElement, ...(await flattenPromiseTree(renderQueue))];
    }
}
const COMPONENT_PROP = '__qComponent__';
function getQComponent(hostElement) {
    const element = hostElement;
    let component = element[COMPONENT_PROP];
    if (!component)
        component = element[COMPONENT_PROP] = new QComponentCtx(hostElement);
    return component;
}
//TODO(misko): needs lots of tests
// - Skip over projection
// TODO(misko): move to central DOM traversal location.
function getHostElement(element) {
    // TODO(misko): this needs to take projection into account.
    while (element && !element.getAttribute("on:q-render" /* OnRender */)) {
        element = element.parentElement;
    }
    return element;
}
function insertStyleIfNeeded(ctx, style) {
    if (style) {
        const styleId = styleKey(style);
        const host = ctx.hostElement;
        const document = host.ownerDocument;
        const head = document.querySelector('head');
        if (!head.querySelector(`style[q\\:style="${styleId}"]`)) {
            const styleImport = Promise.resolve(qImport(host, style));
            styleImport.then((styles) => {
                const style = document.createElement('style');
                style.setAttribute('q:style', styleId);
                style.textContent = styles.replace(/�/g, styleId);
                head.appendChild(style);
            });
        }
    }
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
// TODO(misko): tests
// TODO(misko): this should take QComponent as well.
function qNotifyRender(hostElement) {
    assertDefined(hostElement.getAttribute("on:q-render" /* OnRender */));
    hostElement.setAttribute("on:q-render-notify" /* RenderNotify */, '');
    return scheduleRender(hostElement.ownerDocument);
}
/**
 * Schedule rendering for the future.
 *
 * Multiple calls to this function result in a single `rAF` scheduling creating coalescence.
 *
 * Rendering is achieved by `querySelectorAll` looking for all `on:q-render` attributes.
 *
 * @returns a `Promise` of all of the `HostElements` which were re-rendered.
 * @internal
 */
function scheduleRender(doc) {
    return getPlatform(doc).queueRender(renderMarked);
}
async function renderMarked(doc) {
    const hosts = Array.from(doc.querySelectorAll("[on\\:q-render-notify]" /* RenderNotifySelector */));
    return Promise.all(hosts.map((hostElement) => {
        hostElement.removeAttribute("on:q-render-notify" /* RenderNotify */);
        const cmp = getQComponent(hostElement);
        return cmp && cmp.render();
    }));
}

function isQEvent(value) {
    return typeof value == 'function' && typeof value.type == 'string';
}

/**
 * @public
 */
function useHostElement() {
    assertDefined(_hostElement, 'Invoking of `useHostElement()` outside of `use*()` context.');
    return _hostElement;
}
/**
 * @public
 */
function useEvent(expectEventType) {
    assertDefined(_event, 'Invoking of `useEvent()` outside of `use*()` context.');
    // TODO(misko): implement checking of expectEventType;
    expectEventType &&
        assertEqual(_event.type, isQEvent(expectEventType) ? expectEventType.type : expectEventType);
    return _event;
}
function safeQSubscribe(qObject) {
    assertNotEqual(unwrapProxy(qObject), qObject, 'Expecting Proxy');
    _subscriptions && qObject && _subscriptions.add(qObject);
}
let _hostElement;
let _event;
let _url;
let _subscriptions;
function useInvoke(fn, element, event, url) {
    const isRender = event === 'qRender';
    try {
        _hostElement = element;
        _event = event;
        _url = url;
        isRender && (_subscriptions = new Set());
        return fn();
    }
    finally {
        _hostElement = undefined;
        _event = undefined;
        _url = undefined;
        if (_subscriptions) {
            element && (qProps(element)[':subscriptions'] = _subscriptions);
            _subscriptions = undefined;
        }
    }
}

const Q_OBJECT_PREFIX_SEP = ':';
function _qObject(obj) {
    assertEqual(unwrapProxy(obj), obj, 'Unexpected proxy at this location');
    const proxy = readWriteProxy(obj, generateId());
    Object.assign(proxy, obj);
    return proxy;
}
function _stateQObject(obj, prefix) {
    const id = getQObjectId(obj);
    if (id) {
        obj[QObjectIdSymbol] = prefix + Q_OBJECT_PREFIX_SEP + id;
        return obj;
    }
    else {
        return readWriteProxy(obj, prefix + Q_OBJECT_PREFIX_SEP + generateId());
    }
}
function _restoreQObject(obj, id) {
    return readWriteProxy(obj, id);
}
function QObject_notifyWrite(id, doc) {
    if (doc) {
        doc.querySelectorAll(idToComponentSelector(id)).forEach(qNotifyRender);
    }
}
function QObject_notifyRead(target) {
    const proxy = proxyMap.get(target);
    assertDefined(proxy);
    safeQSubscribe(proxy);
}
function QObject_addDoc(qObj, doc) {
    assertNotEqual(unwrapProxy(qObj), qObj, 'Expected Proxy');
    qObj[QObjectDocumentSymbol] = doc;
}
function getQObjectId(obj) {
    return (obj && typeof obj === 'object' && obj[QObjectIdSymbol]) || null;
}
function idToComponentSelector(id) {
    id = id.replace(/([^\w\d])/g, (_, v) => '\\' + v);
    return '[q\\:obj*=' + (isStateObj(id) ? '' : '\\!') + id + ']';
}
function isStateObj(id) {
    if (id && typeof id !== 'string') {
        id = getQObjectId(id);
        assertDefined(id);
    }
    return id.indexOf(Q_OBJECT_PREFIX_SEP) !== -1;
}
/**
 * Creates a proxy which notifies of any writes.
 */
function readWriteProxy(target, id) {
    if (!target || typeof target !== 'object')
        return target;
    let proxy = proxyMap.get(target);
    if (proxy)
        return proxy;
    proxy = new Proxy(target, new ReadWriteProxyHandler(id));
    proxyMap.set(target, proxy);
    return proxy;
}
const QOjectTargetSymbol = ':target:';
const QOjectTransientsSymbol = ':transients:';
const QObjectIdSymbol = ':id:';
const QObjectDocumentSymbol = ':doc:';
function unwrapProxy(proxy) {
    if (proxy && typeof proxy == 'object') {
        const value = proxy[QOjectTargetSymbol];
        if (value)
            return value;
    }
    return proxy;
}
function wrap(value) {
    if (value && typeof value === 'object') {
        const nakedValue = unwrapProxy(value);
        if (nakedValue !== value) {
            // already a proxy return;
            return value;
        }
        const proxy = proxyMap.get(value);
        return proxy ? proxy : readWriteProxy(value, generateId());
    }
    else {
        return value;
    }
}
class ReadWriteProxyHandler {
    constructor(id) {
        this.doc = null;
        this.transients = null;
        this.id = id;
    }
    get(target, prop) {
        if (prop === QOjectTargetSymbol)
            return target;
        if (prop === QObjectIdSymbol)
            return this.id;
        if (prop === QOjectTransientsSymbol) {
            return this.transients || (this.transients = new WeakMap());
        }
        const value = target[prop];
        QObject_notifyRead(target);
        return wrap(value);
    }
    set(target, prop, newValue) {
        if (prop === QObjectDocumentSymbol) {
            this.doc = newValue;
        }
        else if (prop == QObjectIdSymbol) {
            this.id = newValue;
        }
        else {
            const unwrappedNewValue = unwrapProxy(newValue);
            const oldValue = target[prop];
            if (oldValue !== unwrappedNewValue) {
                target[prop] = unwrappedNewValue;
                QObject_notifyWrite(this.id, this.doc);
            }
        }
        return true;
    }
    has(target, property) {
        if (property === QOjectTargetSymbol)
            return true;
        return Object.prototype.hasOwnProperty.call(target, property);
    }
    ownKeys(target) {
        return Object.getOwnPropertyNames(target);
    }
}
const proxyMap = new WeakMap();
function generateId() {
    return (
    // TODO(misko): For now I have removed the data as I think it is overkill
    // and makes the output unnecessarily big.
    // new Date().getTime().toString(36) +
    Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36));
}

// TODO(misko): need full object parsing /serializing
const JSON_OBJ_PREFIX = '\u0010';
const ATTR_OBJ_PREFIX = '*';
function qJsonStringify(obj, map) {
    if (obj == undefined)
        return String(obj);
    if (typeof obj == 'number')
        return String(obj);
    if (typeof obj == 'boolean')
        return String(obj);
    const id = getQObjectId(obj);
    if (id) {
        map && map.set(id, obj);
        return ATTR_OBJ_PREFIX + id;
    }
    if (typeof obj == 'string') {
        const ch = obj.charCodeAt(0);
        if (isDash(ch) || isDigit(ch) || isObj(ch) || isReserved(obj) || containsEscape(obj)) {
            return "'" + obj.replace(/'/g, "\\'").replace(/\//g, '\\') + "'";
        }
        return obj;
    }
    return JSON.stringify(obj, function (key, value) {
        const id = getQObjectId(value);
        if (id) {
            assertDefined(map);
            map && map.set(id, value);
            return JSON_OBJ_PREFIX + id;
        }
        return value;
    });
}
function qJsonParse(txt, map) {
    if (txt == '')
        return '';
    if (txt == 'null')
        return null;
    if (txt == 'undefined')
        return undefined;
    if (txt == 'false')
        return false;
    if (txt == 'true')
        return true;
    const ch = txt.charCodeAt(0);
    if (isDigit(ch) || isDash(ch)) {
        return Number(txt);
    }
    if (isAttrObj(ch)) {
        const id = txt.substr(1); // QObject ID;
        if (!map) {
            // TODO(misko): better error / test
            throw new Error('Map needs to be present when parsing QObjects');
        }
        const obj = map.get(id);
        assertDefined(obj);
        return obj;
    }
    if (isQuote(ch)) {
        return txt.substring(1, txt.length - 1).replace(/\\(.)/, (v) => v);
    }
    if (isObj(ch)) {
        return JSON.parse(txt, function (key, value) {
            if (typeof value == 'string' && isJsonObj(value.charCodeAt(0))) {
                if (!map) {
                    // TODO(misko): better error / test
                    throw new Error('Map needs to be present when parsing QObjects');
                }
                value = map.get(value.substr(1));
                assertDefined(value);
            }
            return value;
        });
    }
    return txt;
}
function isDash(ch) {
    return ch == '-'.charCodeAt(0);
}
function isObj(ch) {
    return ch == '['.charCodeAt(0) || ch == '{'.charCodeAt(0);
}
function isQuote(ch) {
    return ch == "'".charCodeAt(0);
}
function isDigit(ch) {
    return '0'.charCodeAt(0) <= ch && ch <= '9'.charCodeAt(0);
}
function isAttrObj(ch) {
    return ch == ATTR_OBJ_PREFIX.charCodeAt(0);
}
function isJsonObj(ch) {
    return ch == JSON_OBJ_PREFIX.charCodeAt(0);
}
function isReserved(obj) {
    return obj === 'null' || obj === 'undefined' || obj == 'true' || obj == 'false';
}
function containsEscape(obj) {
    return obj.indexOf("'") != -1 || obj.indexOf('\\') != -1;
}
function isParsedQRL(value) {
    return value instanceof ParsedQRL;
}
// TODO(misko): Split this to static and runtime because ParsedQRL should be internal
class ParsedQRL {
    constructor(url, symbol, params) {
        this._serialized = null;
        this.args = null;
        this.url = url;
        this.symbol = symbol;
        this.args = params;
    }
    get(name) {
        return (this.args && this.args[name]) || null;
    }
    getState() {
        return (this.args && this.args[QRL_STATE]) || '';
    }
    with(args) {
        const p = cloneQrlParams(this);
        Object.assign(p, args);
        return new ParsedQRL(this.url, this.symbol, p);
    }
    toString() {
        return stringifyQRL(this);
    }
}
const QRL_STATE = '.';
const MOCK_BASE = 'http://q/';
function cloneQrlParams(qrl) {
    return qrl.args ? Object.assign({}, qrl.args) : {};
}
function parseQRL(qrl, map) {
    assertDefined(qrl);
    const string = String(qrl);
    let hashIdx = string.indexOf('#');
    if (hashIdx == -1)
        hashIdx = string.length;
    const url = string.substring(0, hashIdx);
    const urlParsed = new URL(string.substr(hashIdx + 1), MOCK_BASE);
    const symbol = urlParsed.pathname.substr(1);
    const params = {};
    const tMap = map && trackingMap(map);
    urlParsed.searchParams.forEach((v, k) => {
        params[k] = qJsonParse(v, tMap);
    });
    const parsedQRL = new ParsedQRL(url, symbol, params);
    parsedQRL._serialized = tMap && tMap.items ? [string, ...tMap.items] : string;
    return parsedQRL;
}
function stringifyQRL(parsedQRL, map) {
    const url = new URL(parsedQRL.symbol, MOCK_BASE);
    if (parsedQRL.args) {
        for (const key in parsedQRL.args) {
            if (Object.prototype.hasOwnProperty.call(parsedQRL.args, key)) {
                const value = qJsonStringify(parsedQRL.args[key], map);
                url.searchParams.set(key, value);
            }
        }
    }
    const hash = url.toString().substr(MOCK_BASE.length);
    const string = parsedQRL.url + (hash ? '#' + hash : '');
    parsedQRL._serialized = string;
    return string;
}
function trackingMap(map) {
    const tMap = {
        items: null,
        get(key) {
            const items = tMap.items || (tMap.items = []);
            items.push(key);
            return map.get(key);
        },
        set(key, value) {
            const items = tMap.items || (tMap.items = []);
            items.push(key);
            map.set(key, value);
        },
    };
    return tMap;
}

/**
 * This file is here to make testing of QRLs without Optimizer possible. The content of this file should
 * not ever make it to production.
 */
let qrlMap;
let qrlNextId;
const MOCK_IMPORT = '/qMockModule';
/**
 * This function is here to make testing easier. It is expected
 * that the method is tree shaken by the bundlers.
 *
 * The purpose of this function is to generate a unique QRL
 * for a symbol. This allows for writing and executing the tests
 * without optimizer being present.
 */
function toDevModeQRL(symbol, stackFrames) {
    if (!qTest)
        throw new Error('This should run in tests only!!!');
    if (!qrlMap) {
        qrlMap = new Map();
        qrlNextId = 0;
    }
    // TODO(misko): Make this nicer. This relies on qrl=>toQrl for it to work.
    const frames = stackFrames.stack.split('\n');
    const key = frames[2];
    let qrl = qrlMap.get(key);
    if (!qrl) {
        const symbolName = 'symbol_' + qrlNextId++;
        qrl = MOCK_IMPORT + '#' + symbolName;
        qrlMap.set(qrl, symbol);
        qrlMap.set(key, qrl);
        const qrlMockExport = qGlobal[MOCK_IMPORT + '.js'] || (qGlobal[MOCK_IMPORT + '.js'] = {});
        qrlMockExport[symbolName] = symbol;
    }
    qrl = new String(qrl);
    qrl.with = withArgs;
    return qrl;
}
function withArgs(args) {
    return stringifyQRL(parseQRL(String(this)).with(args));
}
/**
 * This function is here to make testing easier. It is expected
 * that the method is tree shaken by the bundlers.
 *
 * The purpose of this function is to generate a unique QRL
 * for a symbol. This allows for writing and executing the tests
 * without optimizer being present.
 */
function fromQRL(qrl) {
    if (!qTest)
        throw new Error('This should run in tests only!!!');
    if (typeof qrl === 'string' || qrl instanceof String) {
        const key = qrl.split('?')[0];
        if (qrlMap) {
            const symbol = qrlMap.get(key);
            if (symbol)
                return symbol;
        }
    }
    return undefined;
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

/**
 * @public
 */
function styleKey(qStyles) {
    return qStyles && String(hashCode(String(qStyles)));
}
function styleHost(styleId) {
    return styleId && "\uD83D\uDCE6" /* ComponentStylesPrefixHost */ + styleId;
}
function styleContent(styleId) {
    return styleId && "\uD83C\uDFF7\uFE0F" /* ComponentStylesPrefixContent */ + styleId;
}

// <docs markdown="./q-component.md#qComponent">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./q-component.md instead)
/**
 * Create a Qwik component that can be used in JSX.
 *
 * Use `qComponent` to declare a Qwik component. `QComponent` is a special kind of component that
 * allows the Qwik framework to lazy load and executed the component independently of other
 * `QComponent`s on the page as well as lazy load the `QComponent`s life-cycle hooks and event
 * handlers.
 *
 * Side note: You can also declare regular (standard JSX) components that will have standard
 * synchronous behavior.
 *
 * `QComponent` is a facade that describes how the component should be used without forcing the
 * implementation of the component to be eagerly loaded. The definition consists of:
 *
 * - Component definition (`qComponent`) a description of the public (props) and private (state)
 * interface of a component.
 * - a set of life-cycle hooks. (`onRender` is the only required hook).
 * - `tag`/`props`: an optional tag and props to be placed on the host element of the component.
 *
 * ### Example:
 *
 * Example showing how to create a counter component.
 *
 * ```typescript
 * export const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
 *   onMount: qHook((props) => ({ count: props.value || 0 })),
 *   onRender: qHook((props, state) => (
 *     <div>
 *       <span>{state.count}</span>
 *       <button
 *         on:click={qHook<typeof Counter>((props, state) => {
 *           state.count += props.step || 1;
 *         })}
 *       >
 *         +
 *       </button>
 *     </div>
 *   )),
 * });
 * ```
 *
 * - `qComponent` is how a component gets declared.
 * - `{ value?: number; step?: number }` declares the public (props) interface of the component.
 * - `{ count: number }` declares the private (state) interface of the component.
 * - `onMount`: is used to initialize the private state.
 * - `onRender`: is required hook for rendering the component.
 * - `qHook`: mark which parts of the component will be lazy-loaded. (see `qHook` for details.)
 *
 * The above can than be used like so:
 *
 * ```typescript
 * export const OtherComponent = qComponent({
 *   onRender: qHook(() => <Counter value={100} />),
 * });
 * ```
 *
 * @public
 */
// </docs>
function qComponent({ onRender, styles, unscopedStyles, tagName, props, onResume, onMount, onUnmount, onHydrate, onDehydrate, }) {
    const QComponent = function (jsxProps) {
        return h(tagName || 'div', Object.assign(Object.assign({ ["on:q-mount" /* OnMount */]: onMount, ["on:q-render" /* OnRender */]: onRender, ["on:q-unmount" /* OnUnmount */]: onUnmount, ["on:q-hydrate" /* OnHydrate */]: onHydrate, ["on:q-dehydrate" /* OnDehydrate */]: onDehydrate, ["q:sstyle" /* ComponentStyles */]: styles, ["q:ustyle" /* ComponentUnscopedStyles */]: unscopedStyles }, props), jsxProps));
    };
    QComponent.onRender = onRender || null;
    QComponent.onResume = onResume || null;
    QComponent.onMount = onMount || null;
    QComponent.onUnmount = onUnmount || null;
    QComponent.onHydrate = onHydrate || null;
    QComponent.onDehydrate = onDehydrate || null;
    QComponent.styles = styles || null;
    const styleId = styleKey(styles);
    QComponent.styleHostClass = styleHost(styleId) || null;
    QComponent.styleClass = styleContent(styleId) || null;
    return QComponent;
}

/**
 * @alpha
 */
const qHookMap = new Map();
/**
 * @public
 */
function qHook(hook, symbol) {
    if (typeof symbol === 'string') {
        qHookMap.set(symbol, hook);
        console.log('setHook', symbol, hook);
        let match;
        if ((match = String(hook).match(EXTRACT_IMPORT_PATH)) && match[2]) {
            hook = match[2];
        }
        else if ((match = String(hook).match(EXTRACT_SELF_IMPORT))) {
            hook = 'main';
        }
        else {
            throw new Error('dynamic import not found: ' + String(hook));
        }
        hook =
            (hook.startsWith('.') ? '' : './') +
                (hook.endsWith('.js') ? hook.substr(0, hook.length - 3) : hook) +
                '#' +
                symbol;
    }
    if (typeof hook === 'string') {
        return parseQRL(hook);
    }
    const qrlFn = async (element, event, url) => {
        const isQwikInternalHook = typeof event == 'string';
        // isQwikInternalHook && console.log('HOOK', event, element, url);
        // `isQwikInternalHook` is a bit of a hack. When events fire we need to treat self as host
        // but if it is regular event than we need to skip us.
        const hostElement = getHostElement(isQwikInternalHook ? element : element.parentElement);
        const props = hostElement && qProps(hostElement);
        const parsedQRL = props && parseQRL(url.toString(), props.__qMap__);
        const state = props && parsedQRL && props['state:' + parsedQRL.getState()];
        const args = parsedQRL && parsedQRL.args;
        return await useInvoke(() => hook(props, state, args), hostElement, event, url);
    };
    if (qTest) {
        return toDevModeQRL(qrlFn, new Error());
    }
    return qrlFn;
}
// https://regexr.com/68v72
const EXTRACT_IMPORT_PATH = /\(\s*(['"])([^\1]+)\1\s*\)/;
// https://regexr.com/690ds
const EXTRACT_SELF_IMPORT = /Promise\s*\.\s*resolve/;

//TODO(misko): Add public DOCS.
//TODO(misko): Rename to qDehydrate
/**
 * @public
 */
function qDehydrate(document) {
    QStore_dehydrate(document);
}

/**
 * @public
 */
function qObject(obj) {
    return _qObject(obj);
}

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
async function qRender(parent, jsxNode) {
    const renderQueue = [];
    let firstChild = parent.firstChild;
    while (firstChild && firstChild.nodeType > 8 /* COMMENT_NODE */) {
        firstChild = firstChild.nextSibling;
    }
    const cursor = cursorForParent(parent);
    visitJsxNode(null, renderQueue, cursor, jsxNode);
    return flattenPromiseTree(renderQueue);
}

/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

// dist-dev/domino.mjs
var O = (e, t) => () => (t || e((t = { exports: {} }).exports, t), t.exports);
var zt = O((_f, Li) => {
  Li.exports = Dt;
  Dt.CAPTURING_PHASE = 1;
  Dt.AT_TARGET = 2;
  Dt.BUBBLING_PHASE = 3;
  function Dt(e, t) {
    if (this.type = "", this.target = null, this.currentTarget = null, this.eventPhase = Dt.AT_TARGET, this.bubbles = false, this.cancelable = false, this.isTrusted = false, this.defaultPrevented = false, this.timeStamp = Date.now(), this._propagationStopped = false, this._immediatePropagationStopped = false, this._initialized = true, this._dispatching = false, e && (this.type = e), t)
      for (var r in t)
        this[r] = t[r];
  }
  Dt.prototype = Object.create(Object.prototype, { constructor: { value: Dt }, stopPropagation: { value: function() {
    this._propagationStopped = true;
  } }, stopImmediatePropagation: { value: function() {
    this._propagationStopped = true, this._immediatePropagationStopped = true;
  } }, preventDefault: { value: function() {
    this.cancelable && (this.defaultPrevented = true);
  } }, initEvent: { value: function(t, r, n) {
    this._initialized = true, !this._dispatching && (this._propagationStopped = false, this._immediatePropagationStopped = false, this.defaultPrevented = false, this.isTrusted = false, this.target = null, this.type = t, this.bubbles = r, this.cancelable = n);
  } } });
});
var Kn = O((Ef, Ri) => {
  var Di = zt();
  Ri.exports = $n;
  function $n() {
    Di.call(this), this.view = null, this.detail = 0;
  }
  $n.prototype = Object.create(Di.prototype, { constructor: { value: $n }, initUIEvent: { value: function(e, t, r, n, l) {
    this.initEvent(e, t, r), this.view = n, this.detail = l;
  } } });
});
var Qn = O((vf, Ii) => {
  var Mi = Kn();
  Ii.exports = Xn;
  function Xn() {
    Mi.call(this), this.screenX = this.screenY = this.clientX = this.clientY = 0, this.ctrlKey = this.altKey = this.shiftKey = this.metaKey = false, this.button = 0, this.buttons = 1, this.relatedTarget = null;
  }
  Xn.prototype = Object.create(Mi.prototype, { constructor: { value: Xn }, initMouseEvent: { value: function(e, t, r, n, l, f, _, y, T, S, D, ae, ce, g, re) {
    switch (this.initEvent(e, t, r, n, l), this.screenX = f, this.screenY = _, this.clientX = y, this.clientY = T, this.ctrlKey = S, this.altKey = D, this.shiftKey = ae, this.metaKey = ce, this.button = g, g) {
      case 0:
        this.buttons = 1;
        break;
      case 1:
        this.buttons = 4;
        break;
      case 2:
        this.buttons = 2;
        break;
      default:
        this.buttons = 0;
        break;
    }
    this.relatedTarget = re;
  } }, getModifierState: { value: function(e) {
    switch (e) {
      case "Alt":
        return this.altKey;
      case "Control":
        return this.ctrlKey;
      case "Shift":
        return this.shiftKey;
      case "Meta":
        return this.metaKey;
      default:
        return false;
    }
  } } });
});
var Kr = O((yf, qi) => {
  qi.exports = $r;
  var Al = 1, Ll = 3, Dl = 4, Rl = 5, Ml = 7, Il = 8, Ol = 9, ql = 11, Fl = 12, Hl = 13, Pl = 14, Bl = 15, Ul = 17, Vl = 18, zl = 19, jl = 20, Wl = 21, Gl = 22, Yl = 23, $l = 24, Kl = 25, Xl = [null, "INDEX_SIZE_ERR", null, "HIERARCHY_REQUEST_ERR", "WRONG_DOCUMENT_ERR", "INVALID_CHARACTER_ERR", null, "NO_MODIFICATION_ALLOWED_ERR", "NOT_FOUND_ERR", "NOT_SUPPORTED_ERR", "INUSE_ATTRIBUTE_ERR", "INVALID_STATE_ERR", "SYNTAX_ERR", "INVALID_MODIFICATION_ERR", "NAMESPACE_ERR", "INVALID_ACCESS_ERR", null, "TYPE_MISMATCH_ERR", "SECURITY_ERR", "NETWORK_ERR", "ABORT_ERR", "URL_MISMATCH_ERR", "QUOTA_EXCEEDED_ERR", "TIMEOUT_ERR", "INVALID_NODE_TYPE_ERR", "DATA_CLONE_ERR"], Ql = [null, "INDEX_SIZE_ERR (1): the index is not in the allowed range", null, "HIERARCHY_REQUEST_ERR (3): the operation would yield an incorrect nodes model", "WRONG_DOCUMENT_ERR (4): the object is in the wrong Document, a call to importNode is required", "INVALID_CHARACTER_ERR (5): the string contains invalid characters", null, "NO_MODIFICATION_ALLOWED_ERR (7): the object can not be modified", "NOT_FOUND_ERR (8): the object can not be found here", "NOT_SUPPORTED_ERR (9): this operation is not supported", "INUSE_ATTRIBUTE_ERR (10): setAttributeNode called on owned Attribute", "INVALID_STATE_ERR (11): the object is in an invalid state", "SYNTAX_ERR (12): the string did not match the expected pattern", "INVALID_MODIFICATION_ERR (13): the object can not be modified in this way", "NAMESPACE_ERR (14): the operation is not allowed by Namespaces in XML", "INVALID_ACCESS_ERR (15): the object does not support the operation or argument", null, "TYPE_MISMATCH_ERR (17): the type of the object does not match the expected type", "SECURITY_ERR (18): the operation is insecure", "NETWORK_ERR (19): a network error occurred", "ABORT_ERR (20): the user aborted an operation", "URL_MISMATCH_ERR (21): the given URL does not match another URL", "QUOTA_EXCEEDED_ERR (22): the quota has been exceeded", "TIMEOUT_ERR (23): a timeout occurred", "INVALID_NODE_TYPE_ERR (24): the supplied node is invalid or has an invalid ancestor for this operation", "DATA_CLONE_ERR (25): the object can not be cloned."], Oi = { INDEX_SIZE_ERR: Al, DOMSTRING_SIZE_ERR: 2, HIERARCHY_REQUEST_ERR: Ll, WRONG_DOCUMENT_ERR: Dl, INVALID_CHARACTER_ERR: Rl, NO_DATA_ALLOWED_ERR: 6, NO_MODIFICATION_ALLOWED_ERR: Ml, NOT_FOUND_ERR: Il, NOT_SUPPORTED_ERR: Ol, INUSE_ATTRIBUTE_ERR: 10, INVALID_STATE_ERR: ql, SYNTAX_ERR: Fl, INVALID_MODIFICATION_ERR: Hl, NAMESPACE_ERR: Pl, INVALID_ACCESS_ERR: Bl, VALIDATION_ERR: 16, TYPE_MISMATCH_ERR: Ul, SECURITY_ERR: Vl, NETWORK_ERR: zl, ABORT_ERR: jl, URL_MISMATCH_ERR: Wl, QUOTA_EXCEEDED_ERR: Gl, TIMEOUT_ERR: Yl, INVALID_NODE_TYPE_ERR: $l, DATA_CLONE_ERR: Kl };
  function $r(e) {
    Error.call(this), Error.captureStackTrace(this, this.constructor), this.code = e, this.message = Ql[e], this.name = Xl[e];
  }
  $r.prototype.__proto__ = Error.prototype;
  for (var Zn in Oi)
    Jn = { value: Oi[Zn] }, Object.defineProperty($r, Zn, Jn), Object.defineProperty($r.prototype, Zn, Jn);
  var Jn;
});
var Xr = O((Fi) => {
  Fi.isApiWritable = !global.__domino_frozen__;
});
var he = O((Z) => {
  var de = Kr(), me = de, Zl = Xr().isApiWritable;
  Z.NAMESPACE = { HTML: "http://www.w3.org/1999/xhtml", XML: "http://www.w3.org/XML/1998/namespace", XMLNS: "http://www.w3.org/2000/xmlns/", MATHML: "http://www.w3.org/1998/Math/MathML", SVG: "http://www.w3.org/2000/svg", XLINK: "http://www.w3.org/1999/xlink" };
  Z.IndexSizeError = function() {
    throw new de(me.INDEX_SIZE_ERR);
  };
  Z.HierarchyRequestError = function() {
    throw new de(me.HIERARCHY_REQUEST_ERR);
  };
  Z.WrongDocumentError = function() {
    throw new de(me.WRONG_DOCUMENT_ERR);
  };
  Z.InvalidCharacterError = function() {
    throw new de(me.INVALID_CHARACTER_ERR);
  };
  Z.NoModificationAllowedError = function() {
    throw new de(me.NO_MODIFICATION_ALLOWED_ERR);
  };
  Z.NotFoundError = function() {
    throw new de(me.NOT_FOUND_ERR);
  };
  Z.NotSupportedError = function() {
    throw new de(me.NOT_SUPPORTED_ERR);
  };
  Z.InvalidStateError = function() {
    throw new de(me.INVALID_STATE_ERR);
  };
  Z.SyntaxError = function() {
    throw new de(me.SYNTAX_ERR);
  };
  Z.InvalidModificationError = function() {
    throw new de(me.INVALID_MODIFICATION_ERR);
  };
  Z.NamespaceError = function() {
    throw new de(me.NAMESPACE_ERR);
  };
  Z.InvalidAccessError = function() {
    throw new de(me.INVALID_ACCESS_ERR);
  };
  Z.TypeMismatchError = function() {
    throw new de(me.TYPE_MISMATCH_ERR);
  };
  Z.SecurityError = function() {
    throw new de(me.SECURITY_ERR);
  };
  Z.NetworkError = function() {
    throw new de(me.NETWORK_ERR);
  };
  Z.AbortError = function() {
    throw new de(me.ABORT_ERR);
  };
  Z.UrlMismatchError = function() {
    throw new de(me.URL_MISMATCH_ERR);
  };
  Z.QuotaExceededError = function() {
    throw new de(me.QUOTA_EXCEEDED_ERR);
  };
  Z.TimeoutError = function() {
    throw new de(me.TIMEOUT_ERR);
  };
  Z.InvalidNodeTypeError = function() {
    throw new de(me.INVALID_NODE_TYPE_ERR);
  };
  Z.DataCloneError = function() {
    throw new de(me.DATA_CLONE_ERR);
  };
  Z.nyi = function() {
    throw new Error("NotYetImplemented");
  };
  Z.shouldOverride = function() {
    throw new Error("Abstract function; should be overriding in subclass.");
  };
  Z.assert = function(e, t) {
    if (!e)
      throw new Error("Assertion failed: " + (t || "") + `
` + new Error().stack);
  };
  Z.expose = function(e, t) {
    for (var r in e)
      Object.defineProperty(t.prototype, r, { value: e[r], writable: Zl });
  };
  Z.merge = function(e, t) {
    for (var r in t)
      e[r] = t[r];
  };
  Z.documentOrder = function(e, t) {
    return 3 - (e.compareDocumentPosition(t) & 6);
  };
  Z.toASCIILowerCase = function(e) {
    return e.replace(/[A-Z]+/g, function(t) {
      return t.toLowerCase();
    });
  };
  Z.toASCIIUpperCase = function(e) {
    return e.replace(/[a-z]+/g, function(t) {
      return t.toUpperCase();
    });
  };
});
var ea = O((kf, Pi) => {
  var Rt = zt(), Jl = Qn(), eu = he();
  Pi.exports = Hi;
  function Hi() {
  }
  Hi.prototype = { addEventListener: function(t, r, n) {
    if (!!r) {
      n === void 0 && (n = false), this._listeners || (this._listeners = Object.create(null)), this._listeners[t] || (this._listeners[t] = []);
      for (var l = this._listeners[t], f = 0, _ = l.length; f < _; f++) {
        var y = l[f];
        if (y.listener === r && y.capture === n)
          return;
      }
      var T = { listener: r, capture: n };
      typeof r == "function" && (T.f = r), l.push(T);
    }
  }, removeEventListener: function(t, r, n) {
    if (n === void 0 && (n = false), this._listeners) {
      var l = this._listeners[t];
      if (l)
        for (var f = 0, _ = l.length; f < _; f++) {
          var y = l[f];
          if (y.listener === r && y.capture === n) {
            l.length === 1 ? this._listeners[t] = void 0 : l.splice(f, 1);
            return;
          }
        }
    }
  }, dispatchEvent: function(t) {
    return this._dispatchEvent(t, false);
  }, _dispatchEvent: function(t, r) {
    typeof r != "boolean" && (r = false);
    function n(S, D) {
      var ae = D.type, ce = D.eventPhase;
      if (D.currentTarget = S, ce !== Rt.CAPTURING_PHASE && S._handlers && S._handlers[ae]) {
        var g = S._handlers[ae], re;
        if (typeof g == "function")
          re = g.call(D.currentTarget, D);
        else {
          var $ = g.handleEvent;
          if (typeof $ != "function")
            throw new TypeError("handleEvent property of event handler object isnot a function.");
          re = $.call(g, D);
        }
        switch (D.type) {
          case "mouseover":
            re === true && D.preventDefault();
            break;
          case "beforeunload":
          default:
            re === false && D.preventDefault();
            break;
        }
      }
      var V = S._listeners && S._listeners[ae];
      if (!!V) {
        V = V.slice();
        for (var ve = 0, U = V.length; ve < U; ve++) {
          if (D._immediatePropagationStopped)
            return;
          var ie = V[ve];
          if (!(ce === Rt.CAPTURING_PHASE && !ie.capture || ce === Rt.BUBBLING_PHASE && ie.capture))
            if (ie.f)
              ie.f.call(D.currentTarget, D);
            else {
              var be = ie.listener.handleEvent;
              if (typeof be != "function")
                throw new TypeError("handleEvent property of event listener object is not a function.");
              be.call(ie.listener, D);
            }
        }
      }
    }
    (!t._initialized || t._dispatching) && eu.InvalidStateError(), t.isTrusted = r, t._dispatching = true, t.target = this;
    for (var l = [], f = this.parentNode; f; f = f.parentNode)
      l.push(f);
    t.eventPhase = Rt.CAPTURING_PHASE;
    for (var _ = l.length - 1; _ >= 0 && (n(l[_], t), !t._propagationStopped); _--)
      ;
    if (t._propagationStopped || (t.eventPhase = Rt.AT_TARGET, n(this, t)), t.bubbles && !t._propagationStopped) {
      t.eventPhase = Rt.BUBBLING_PHASE;
      for (var y = 0, T = l.length; y < T && (n(l[y], t), !t._propagationStopped); y++)
        ;
    }
    if (t._dispatching = false, t.eventPhase = Rt.AT_TARGET, t.currentTarget = null, r && !t.defaultPrevented && t instanceof Jl)
      switch (t.type) {
        case "mousedown":
          this._armed = { x: t.clientX, y: t.clientY, t: t.timeStamp };
          break;
        case "mouseout":
        case "mouseover":
          this._armed = null;
          break;
        case "mouseup":
          this._isClick(t) && this._doClick(t), this._armed = null;
          break;
      }
    return !t.defaultPrevented;
  }, _isClick: function(e) {
    return this._armed !== null && e.type === "mouseup" && e.isTrusted && e.button === 0 && e.timeStamp - this._armed.t < 1e3 && Math.abs(e.clientX - this._armed.x) < 10 && Math.abs(e.clientY - this._armed.Y) < 10;
  }, _doClick: function(e) {
    if (!this._click_in_progress) {
      this._click_in_progress = true;
      for (var t = this; t && !t._post_click_activation_steps; )
        t = t.parentNode;
      t && t._pre_click_activation_steps && t._pre_click_activation_steps();
      var r = this.ownerDocument.createEvent("MouseEvent");
      r.initMouseEvent("click", true, true, this.ownerDocument.defaultView, 1, e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey, e.altKey, e.shiftKey, e.metaKey, e.button, null);
      var n = this._dispatchEvent(r, true);
      t && (n ? t._post_click_activation_steps && t._post_click_activation_steps(r) : t._cancelled_activation_steps && t._cancelled_activation_steps());
    }
  }, _setEventHandler: function(t, r) {
    this._handlers || (this._handlers = Object.create(null)), this._handlers[t] = r;
  }, _getEventHandler: function(t) {
    return this._handlers && this._handlers[t] || null;
  } };
});
var ta = O((Sf, Bi) => {
  var ot = he(), Ve = Bi.exports = { valid: function(e) {
    return ot.assert(e, "list falsy"), ot.assert(e._previousSibling, "previous falsy"), ot.assert(e._nextSibling, "next falsy"), true;
  }, insertBefore: function(e, t) {
    ot.assert(Ve.valid(e) && Ve.valid(t));
    var r = e, n = e._previousSibling, l = t, f = t._previousSibling;
    r._previousSibling = f, n._nextSibling = l, f._nextSibling = r, l._previousSibling = n, ot.assert(Ve.valid(e) && Ve.valid(t));
  }, replace: function(e, t) {
    ot.assert(Ve.valid(e) && (t === null || Ve.valid(t))), t !== null && Ve.insertBefore(t, e), Ve.remove(e), ot.assert(Ve.valid(e) && (t === null || Ve.valid(t)));
  }, remove: function(e) {
    ot.assert(Ve.valid(e));
    var t = e._previousSibling;
    if (t !== e) {
      var r = e._nextSibling;
      t._nextSibling = r, r._previousSibling = t, e._previousSibling = e._nextSibling = e, ot.assert(Ve.valid(e));
    }
  } };
});
var ra = O((Nf, Vi) => {
  Vi.exports = { serializeOne: ou };
  var Ui = he(), Mt = Ui.NAMESPACE, tu = { STYLE: true, SCRIPT: true, XMP: true, IFRAME: true, NOEMBED: true, NOFRAMES: true, PLAINTEXT: true }, ru = { area: true, base: true, basefont: true, bgsound: true, br: true, col: true, embed: true, frame: true, hr: true, img: true, input: true, keygen: true, link: true, meta: true, param: true, source: true, track: true, wbr: true }, nu = {};
  function au(e) {
    return e.replace(/[&<>\u00A0]/g, function(t) {
      switch (t) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case "\xA0":
          return "&nbsp;";
      }
    });
  }
  function iu(e) {
    var t = /[&"\u00A0]/g;
    return t.test(e) ? e.replace(t, function(r) {
      switch (r) {
        case "&":
          return "&amp;";
        case '"':
          return "&quot;";
        case "\xA0":
          return "&nbsp;";
      }
    }) : e;
  }
  function su(e) {
    var t = e.namespaceURI;
    return t ? t === Mt.XML ? "xml:" + e.localName : t === Mt.XLINK ? "xlink:" + e.localName : t === Mt.XMLNS ? e.localName === "xmlns" ? "xmlns" : "xmlns:" + e.localName : e.name : e.localName;
  }
  function ou(e, t) {
    var r = "";
    switch (e.nodeType) {
      case 1:
        var n = e.namespaceURI, l = n === Mt.HTML, f = l || n === Mt.SVG || n === Mt.MATHML ? e.localName : e.tagName;
        r += "<" + f;
        for (var _ = 0, y = e._numattrs; _ < y; _++) {
          var T = e._attr(_);
          r += " " + su(T), T.value !== void 0 && (r += '="' + iu(T.value) + '"');
        }
        if (r += ">", !(l && ru[f])) {
          var S = e.serialize();
          l && nu[f] && S.charAt(0) === `
` && (r += `
`), r += S, r += "</" + f + ">";
        }
        break;
      case 3:
      case 4:
        var D;
        t.nodeType === 1 && t.namespaceURI === Mt.HTML ? D = t.tagName : D = "", tu[D] || D === "NOSCRIPT" && t.ownerDocument._scripting_enabled ? r += e.data : r += au(e.data);
        break;
      case 8:
        r += "<!--" + e.data + "-->";
        break;
      case 7:
        r += "<?" + e.target + " " + e.data + "?>";
        break;
      case 10:
        r += "<!DOCTYPE " + e.name, r += ">";
        break;
      default:
        Ui.InvalidStateError();
    }
    return r;
  }
});
var we = O((Cf, $i) => {
  $i.exports = xe;
  var zi = ea(), Qr = ta(), ji = ra(), J = he();
  function xe() {
    zi.call(this), this.parentNode = null, this._nextSibling = this._previousSibling = this, this._index = void 0;
  }
  var Re = xe.ELEMENT_NODE = 1, na = xe.ATTRIBUTE_NODE = 2, Zr = xe.TEXT_NODE = 3, cu = xe.CDATA_SECTION_NODE = 4, lu = xe.ENTITY_REFERENCE_NODE = 5, aa = xe.ENTITY_NODE = 6, Wi = xe.PROCESSING_INSTRUCTION_NODE = 7, Gi = xe.COMMENT_NODE = 8, hr = xe.DOCUMENT_NODE = 9, ze = xe.DOCUMENT_TYPE_NODE = 10, vt = xe.DOCUMENT_FRAGMENT_NODE = 11, ia = xe.NOTATION_NODE = 12, sa = xe.DOCUMENT_POSITION_DISCONNECTED = 1, oa = xe.DOCUMENT_POSITION_PRECEDING = 2, ca = xe.DOCUMENT_POSITION_FOLLOWING = 4, Yi = xe.DOCUMENT_POSITION_CONTAINS = 8, la = xe.DOCUMENT_POSITION_CONTAINED_BY = 16, ua = xe.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC = 32;
  xe.prototype = Object.create(zi.prototype, { baseURI: { get: J.nyi }, parentElement: { get: function() {
    return this.parentNode && this.parentNode.nodeType === Re ? this.parentNode : null;
  } }, hasChildNodes: { value: J.shouldOverride }, firstChild: { get: J.shouldOverride }, lastChild: { get: J.shouldOverride }, previousSibling: { get: function() {
    var e = this.parentNode;
    return !e || this === e.firstChild ? null : this._previousSibling;
  } }, nextSibling: { get: function() {
    var e = this.parentNode, t = this._nextSibling;
    return !e || t === e.firstChild ? null : t;
  } }, textContent: { get: function() {
    return null;
  }, set: function(e) {
  } }, _countChildrenOfType: { value: function(e) {
    for (var t = 0, r = this.firstChild; r !== null; r = r.nextSibling)
      r.nodeType === e && t++;
    return t;
  } }, _ensureInsertValid: { value: function(t, r, n) {
    var l = this, f, _;
    if (!t.nodeType)
      throw new TypeError("not a node");
    switch (l.nodeType) {
      case hr:
      case vt:
      case Re:
        break;
      default:
        J.HierarchyRequestError();
    }
    switch (t.isAncestor(l) && J.HierarchyRequestError(), (r !== null || !n) && r.parentNode !== l && J.NotFoundError(), t.nodeType) {
      case vt:
      case ze:
      case Re:
      case Zr:
      case Wi:
      case Gi:
        break;
      default:
        J.HierarchyRequestError();
    }
    if (l.nodeType === hr)
      switch (t.nodeType) {
        case Zr:
          J.HierarchyRequestError();
          break;
        case vt:
          switch (t._countChildrenOfType(Zr) > 0 && J.HierarchyRequestError(), t._countChildrenOfType(Re)) {
            case 0:
              break;
            case 1:
              if (r !== null)
                for (n && r.nodeType === ze && J.HierarchyRequestError(), _ = r.nextSibling; _ !== null; _ = _.nextSibling)
                  _.nodeType === ze && J.HierarchyRequestError();
              f = l._countChildrenOfType(Re), n ? f > 0 && J.HierarchyRequestError() : (f > 1 || f === 1 && r.nodeType !== Re) && J.HierarchyRequestError();
              break;
            default:
              J.HierarchyRequestError();
          }
          break;
        case Re:
          if (r !== null)
            for (n && r.nodeType === ze && J.HierarchyRequestError(), _ = r.nextSibling; _ !== null; _ = _.nextSibling)
              _.nodeType === ze && J.HierarchyRequestError();
          f = l._countChildrenOfType(Re), n ? f > 0 && J.HierarchyRequestError() : (f > 1 || f === 1 && r.nodeType !== Re) && J.HierarchyRequestError();
          break;
        case ze:
          if (r === null)
            l._countChildrenOfType(Re) && J.HierarchyRequestError();
          else
            for (_ = l.firstChild; _ !== null && _ !== r; _ = _.nextSibling)
              _.nodeType === Re && J.HierarchyRequestError();
          f = l._countChildrenOfType(ze), n ? f > 0 && J.HierarchyRequestError() : (f > 1 || f === 1 && r.nodeType !== ze) && J.HierarchyRequestError();
          break;
      }
    else
      t.nodeType === ze && J.HierarchyRequestError();
  } }, insertBefore: { value: function(t, r) {
    var n = this;
    n._ensureInsertValid(t, r, true);
    var l = r;
    return l === t && (l = t.nextSibling), n.doc.adoptNode(t), t._insertOrReplace(n, l, false), t;
  } }, appendChild: { value: function(e) {
    return this.insertBefore(e, null);
  } }, _appendChild: { value: function(e) {
    e._insertOrReplace(this, null, false);
  } }, removeChild: { value: function(t) {
    var r = this;
    if (!t.nodeType)
      throw new TypeError("not a node");
    return t.parentNode !== r && J.NotFoundError(), t.remove(), t;
  } }, replaceChild: { value: function(t, r) {
    var n = this;
    return n._ensureInsertValid(t, r, false), t.doc !== n.doc && n.doc.adoptNode(t), t._insertOrReplace(n, r, true), r;
  } }, contains: { value: function(t) {
    return t === null ? false : this === t ? true : (this.compareDocumentPosition(t) & la) != 0;
  } }, compareDocumentPosition: { value: function(t) {
    if (this === t)
      return 0;
    if (this.doc !== t.doc || this.rooted !== t.rooted)
      return sa + ua;
    for (var r = [], n = [], l = this; l !== null; l = l.parentNode)
      r.push(l);
    for (l = t; l !== null; l = l.parentNode)
      n.push(l);
    if (r.reverse(), n.reverse(), r[0] !== n[0])
      return sa + ua;
    l = Math.min(r.length, n.length);
    for (var f = 1; f < l; f++)
      if (r[f] !== n[f])
        return r[f].index < n[f].index ? ca : oa;
    return r.length < n.length ? ca + la : oa + Yi;
  } }, isSameNode: { value: function(t) {
    return this === t;
  } }, isEqualNode: { value: function(t) {
    if (!t || t.nodeType !== this.nodeType || !this.isEqual(t))
      return false;
    for (var r = this.firstChild, n = t.firstChild; r && n; r = r.nextSibling, n = n.nextSibling)
      if (!r.isEqualNode(n))
        return false;
    return r === null && n === null;
  } }, cloneNode: { value: function(e) {
    var t = this.clone();
    if (e)
      for (var r = this.firstChild; r !== null; r = r.nextSibling)
        t._appendChild(r.cloneNode(true));
    return t;
  } }, lookupPrefix: { value: function(t) {
    var r;
    if (t === "" || t === null || t === void 0)
      return null;
    switch (this.nodeType) {
      case Re:
        return this._lookupNamespacePrefix(t, this);
      case hr:
        return r = this.documentElement, r ? r.lookupPrefix(t) : null;
      case aa:
      case ia:
      case vt:
      case ze:
        return null;
      case na:
        return r = this.ownerElement, r ? r.lookupPrefix(t) : null;
      default:
        return r = this.parentElement, r ? r.lookupPrefix(t) : null;
    }
  } }, lookupNamespaceURI: { value: function(t) {
    (t === "" || t === void 0) && (t = null);
    var r;
    switch (this.nodeType) {
      case Re:
        return J.shouldOverride();
      case hr:
        return r = this.documentElement, r ? r.lookupNamespaceURI(t) : null;
      case aa:
      case ia:
      case ze:
      case vt:
        return null;
      case na:
        return r = this.ownerElement, r ? r.lookupNamespaceURI(t) : null;
      default:
        return r = this.parentElement, r ? r.lookupNamespaceURI(t) : null;
    }
  } }, isDefaultNamespace: { value: function(t) {
    (t === "" || t === void 0) && (t = null);
    var r = this.lookupNamespaceURI(null);
    return r === t;
  } }, index: { get: function() {
    var e = this.parentNode;
    if (this === e.firstChild)
      return 0;
    var t = e.childNodes;
    if (this._index === void 0 || t[this._index] !== this) {
      for (var r = 0; r < t.length; r++)
        t[r]._index = r;
      J.assert(t[this._index] === this);
    }
    return this._index;
  } }, isAncestor: { value: function(e) {
    if (this.doc !== e.doc || this.rooted !== e.rooted)
      return false;
    for (var t = e; t; t = t.parentNode)
      if (t === this)
        return true;
    return false;
  } }, ensureSameDoc: { value: function(e) {
    e.ownerDocument === null ? e.ownerDocument = this.doc : e.ownerDocument !== this.doc && J.WrongDocumentError();
  } }, removeChildren: { value: J.shouldOverride }, _insertOrReplace: { value: function(t, r, n) {
    var l = this, f, _;
    if (l.nodeType === vt && l.rooted && J.HierarchyRequestError(), t._childNodes && (f = r === null ? t._childNodes.length : r.index, l.parentNode === t)) {
      var y = l.index;
      y < f && f--;
    }
    n && (r.rooted && r.doc.mutateRemove(r), r.parentNode = null);
    var T = r;
    T === null && (T = t.firstChild);
    var S = l.rooted && t.rooted;
    if (l.nodeType === vt) {
      for (var D = [0, n ? 1 : 0], ae, ce = l.firstChild; ce !== null; ce = ae)
        ae = ce.nextSibling, D.push(ce), ce.parentNode = t;
      var g = D.length;
      if (n ? Qr.replace(T, g > 2 ? D[2] : null) : g > 2 && T !== null && Qr.insertBefore(D[2], T), t._childNodes)
        for (D[0] = r === null ? t._childNodes.length : r._index, t._childNodes.splice.apply(t._childNodes, D), _ = 2; _ < g; _++)
          D[_]._index = D[0] + (_ - 2);
      else
        t._firstChild === r && (g > 2 ? t._firstChild = D[2] : n && (t._firstChild = null));
      if (l._childNodes ? l._childNodes.length = 0 : l._firstChild = null, t.rooted)
        for (t.modify(), _ = 2; _ < g; _++)
          t.doc.mutateInsert(D[_]);
    } else {
      if (r === l)
        return;
      S ? l._remove() : l.parentNode && l.remove(), l.parentNode = t, n ? (Qr.replace(T, l), t._childNodes ? (l._index = f, t._childNodes[f] = l) : t._firstChild === r && (t._firstChild = l)) : (T !== null && Qr.insertBefore(l, T), t._childNodes ? (l._index = f, t._childNodes.splice(f, 0, l)) : t._firstChild === r && (t._firstChild = l)), S ? (t.modify(), t.doc.mutateMove(l)) : t.rooted && (t.modify(), t.doc.mutateInsert(l));
    }
  } }, lastModTime: { get: function() {
    return this._lastModTime || (this._lastModTime = this.doc.modclock), this._lastModTime;
  } }, modify: { value: function() {
    if (this.doc.modclock)
      for (var e = ++this.doc.modclock, t = this; t; t = t.parentElement)
        t._lastModTime && (t._lastModTime = e);
  } }, doc: { get: function() {
    return this.ownerDocument || this;
  } }, rooted: { get: function() {
    return !!this._nid;
  } }, normalize: { value: function() {
    for (var e, t = this.firstChild; t !== null; t = e)
      if (e = t.nextSibling, t.normalize && t.normalize(), t.nodeType === xe.TEXT_NODE) {
        if (t.nodeValue === "") {
          this.removeChild(t);
          continue;
        }
        var r = t.previousSibling;
        r !== null && r.nodeType === xe.TEXT_NODE && (r.appendData(t.nodeValue), this.removeChild(t));
      }
  } }, serialize: { value: function() {
    for (var e = "", t = this.firstChild; t !== null; t = t.nextSibling)
      e += ji.serializeOne(t, this);
    return e;
  } }, outerHTML: { get: function() {
    return ji.serializeOne(this, { nodeType: 0 });
  }, set: J.nyi }, ELEMENT_NODE: { value: Re }, ATTRIBUTE_NODE: { value: na }, TEXT_NODE: { value: Zr }, CDATA_SECTION_NODE: { value: cu }, ENTITY_REFERENCE_NODE: { value: lu }, ENTITY_NODE: { value: aa }, PROCESSING_INSTRUCTION_NODE: { value: Wi }, COMMENT_NODE: { value: Gi }, DOCUMENT_NODE: { value: hr }, DOCUMENT_TYPE_NODE: { value: ze }, DOCUMENT_FRAGMENT_NODE: { value: vt }, NOTATION_NODE: { value: ia }, DOCUMENT_POSITION_DISCONNECTED: { value: sa }, DOCUMENT_POSITION_PRECEDING: { value: oa }, DOCUMENT_POSITION_FOLLOWING: { value: ca }, DOCUMENT_POSITION_CONTAINS: { value: Yi }, DOCUMENT_POSITION_CONTAINED_BY: { value: la }, DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: { value: ua } });
});
var Xi = O((Lf, Ki) => {
  Ki.exports = class extends Array {
    constructor(t) {
      super(t && t.length || 0);
      if (t)
        for (var r in t)
          this[r] = t[r];
    }
    item(t) {
      return this[t] || null;
    }
  };
});
var Zi = O((Df, Qi) => {
  function uu(e) {
    return this[e] || null;
  }
  function fu(e) {
    return e || (e = []), e.item = uu, e;
  }
  Qi.exports = fu;
});
var It = O((Rf, Ji) => {
  var fa;
  try {
    fa = Xi();
  } catch (e) {
    fa = Zi();
  }
  Ji.exports = fa;
});
var Jr = O((Mf, rs) => {
  rs.exports = ts;
  var es = we(), du = It();
  function ts() {
    es.call(this), this._firstChild = this._childNodes = null;
  }
  ts.prototype = Object.create(es.prototype, { hasChildNodes: { value: function() {
    return this._childNodes ? this._childNodes.length > 0 : this._firstChild !== null;
  } }, childNodes: { get: function() {
    return this._ensureChildNodes(), this._childNodes;
  } }, firstChild: { get: function() {
    return this._childNodes ? this._childNodes.length === 0 ? null : this._childNodes[0] : this._firstChild;
  } }, lastChild: { get: function() {
    var e = this._childNodes, t;
    return e ? e.length === 0 ? null : e[e.length - 1] : (t = this._firstChild, t === null ? null : t._previousSibling);
  } }, _ensureChildNodes: { value: function() {
    if (!this._childNodes) {
      var e = this._firstChild, t = e, r = this._childNodes = new du();
      if (e)
        do
          r.push(t), t = t._nextSibling;
        while (t !== e);
      this._firstChild = null;
    }
  } }, removeChildren: { value: function() {
    for (var t = this.rooted ? this.ownerDocument : null, r = this.firstChild, n; r !== null; )
      n = r, r = n.nextSibling, t && t.mutateRemove(n), n.parentNode = null;
    this._childNodes ? this._childNodes.length = 0 : this._firstChild = null, this.modify();
  } } });
});
var en = O((xa) => {
  xa.isValidName = _u;
  xa.isValidQName = Eu;
  var hu = /^[_:A-Za-z][-.:\w]+$/, xu = /^([_A-Za-z][-.\w]+|[_A-Za-z][-.\w]+:[_A-Za-z][-.\w]+)$/, xr = "_A-Za-z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD", pr = "-._A-Za-z0-9\xB7\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0300-\u037D\u037F-\u1FFF\u200C\u200D\u203F\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD", Ot = "[" + xr + "][" + pr + "]*", da = xr + ":", ha = pr + ":", pu = new RegExp("^[" + da + "][" + ha + "]*$"), mu = new RegExp("^(" + Ot + "|" + Ot + ":" + Ot + ")$"), ns = /[\uD800-\uDB7F\uDC00-\uDFFF]/, as = /[\uD800-\uDB7F\uDC00-\uDFFF]/g, is = /[\uD800-\uDB7F][\uDC00-\uDFFF]/g;
  xr += "\uD800-\u{EFC00}-\uDFFF";
  pr += "\uD800-\u{EFC00}-\uDFFF";
  Ot = "[" + xr + "][" + pr + "]*";
  da = xr + ":";
  ha = pr + ":";
  var gu = new RegExp("^[" + da + "][" + ha + "]*$"), bu = new RegExp("^(" + Ot + "|" + Ot + ":" + Ot + ")$");
  function _u(e) {
    if (hu.test(e) || pu.test(e))
      return true;
    if (!ns.test(e) || !gu.test(e))
      return false;
    var t = e.match(as), r = e.match(is);
    return r !== null && 2 * r.length === t.length;
  }
  function Eu(e) {
    if (xu.test(e) || mu.test(e))
      return true;
    if (!ns.test(e) || !bu.test(e))
      return false;
    var t = e.match(as), r = e.match(is);
    return r !== null && 2 * r.length === t.length;
  }
});
var ma = O((pa) => {
  var ss = he();
  pa.property = function(e) {
    if (Array.isArray(e.type)) {
      var t = Object.create(null);
      e.type.forEach(function(l) {
        t[l.value || l] = l.alias || l;
      });
      var r = e.missing;
      r === void 0 && (r = null);
      var n = e.invalid;
      return n === void 0 && (n = r), { get: function() {
        var l = this._getattr(e.name);
        return l === null ? r : (l = t[l.toLowerCase()], l !== void 0 ? l : n !== null ? n : l);
      }, set: function(l) {
        this._setattr(e.name, l);
      } };
    } else {
      if (e.type === Boolean)
        return { get: function() {
          return this.hasAttribute(e.name);
        }, set: function(l) {
          l ? this._setattr(e.name, "") : this.removeAttribute(e.name);
        } };
      if (e.type === Number || e.type === "long" || e.type === "unsigned long" || e.type === "limited unsigned long with fallback")
        return vu(e);
      if (!e.type || e.type === String)
        return { get: function() {
          return this._getattr(e.name) || "";
        }, set: function(l) {
          e.treatNullAsEmptyString && l === null && (l = ""), this._setattr(e.name, l);
        } };
      if (typeof e.type == "function")
        return e.type(e.name, e);
    }
    throw new Error("Invalid attribute definition");
  };
  function vu(e) {
    var t;
    typeof e.default == "function" ? t = e.default : typeof e.default == "number" ? t = function() {
      return e.default;
    } : t = function() {
      ss.assert(false, typeof e.default);
    };
    var r = e.type === "unsigned long", n = e.type === "long", l = e.type === "limited unsigned long with fallback", f = e.min, _ = e.max, y = e.setmin;
    return f === void 0 && (r && (f = 0), n && (f = -2147483648), l && (f = 1)), _ === void 0 && (r || n || l) && (_ = 2147483647), { get: function() {
      var T = this._getattr(e.name), S = e.float ? parseFloat(T) : parseInt(T, 10);
      if (T === null || !isFinite(S) || f !== void 0 && S < f || _ !== void 0 && S > _)
        return t.call(this);
      if (r || n || l) {
        if (!/^[ \t\n\f\r]*[-+]?[0-9]/.test(T))
          return t.call(this);
        S = S | 0;
      }
      return S;
    }, set: function(T) {
      e.float || (T = Math.floor(T)), y !== void 0 && T < y && ss.IndexSizeError(e.name + " set to " + T), r ? T = T < 0 || T > 2147483647 ? t.call(this) : T | 0 : l ? T = T < 1 || T > 2147483647 ? t.call(this) : T | 0 : n && (T = T < -2147483648 || T > 2147483647 ? t.call(this) : T | 0), this._setattr(e.name, String(T));
    } };
  }
  pa.registerChangeHandler = function(e, t, r) {
    var n = e.prototype;
    Object.prototype.hasOwnProperty.call(n, "_attributeChangeHandlers") || (n._attributeChangeHandlers = Object.create(n._attributeChangeHandlers || null)), n._attributeChangeHandlers[t] = r;
  };
});
var ls = O((qf, cs) => {
  cs.exports = os;
  var yu = we();
  function os(e, t) {
    this.root = e, this.filter = t, this.lastModTime = e.lastModTime, this.done = false, this.cache = [], this.traverse();
  }
  os.prototype = Object.create(Object.prototype, { length: { get: function() {
    return this.checkcache(), this.done || this.traverse(), this.cache.length;
  } }, item: { value: function(e) {
    return this.checkcache(), !this.done && e >= this.cache.length && this.traverse(), this.cache[e];
  } }, checkcache: { value: function() {
    if (this.lastModTime !== this.root.lastModTime) {
      for (var e = this.cache.length - 1; e >= 0; e--)
        this[e] = void 0;
      this.cache.length = 0, this.done = false, this.lastModTime = this.root.lastModTime;
    }
  } }, traverse: { value: function(e) {
    e !== void 0 && e++;
    for (var t; (t = this.next()) !== null; )
      if (this[this.cache.length] = t, this.cache.push(t), e && this.cache.length === e)
        return;
    this.done = true;
  } }, next: { value: function() {
    var e = this.cache.length === 0 ? this.root : this.cache[this.cache.length - 1], t;
    for (e.nodeType === yu.DOCUMENT_NODE ? t = e.documentElement : t = e.nextElement(this.root); t; ) {
      if (this.filter(t))
        return t;
      t = t.nextElement(this.root);
    }
    return null;
  } } });
});
var ba = O((Ff, ds) => {
  var ga = he();
  ds.exports = us;
  function us(e, t) {
    this._getString = e, this._setString = t, this._length = 0, this._lastStringValue = "", this._update();
  }
  Object.defineProperties(us.prototype, { length: { get: function() {
    return this._length;
  } }, item: { value: function(e) {
    var t = jt(this);
    return e < 0 || e >= t.length ? null : t[e];
  } }, contains: { value: function(e) {
    e = String(e);
    var t = jt(this);
    return t.indexOf(e) > -1;
  } }, add: { value: function() {
    for (var e = jt(this), t = 0, r = arguments.length; t < r; t++) {
      var n = mr(arguments[t]);
      e.indexOf(n) < 0 && e.push(n);
    }
    this._update(e);
  } }, remove: { value: function() {
    for (var e = jt(this), t = 0, r = arguments.length; t < r; t++) {
      var n = mr(arguments[t]), l = e.indexOf(n);
      l > -1 && e.splice(l, 1);
    }
    this._update(e);
  } }, toggle: { value: function(t, r) {
    return t = mr(t), this.contains(t) ? r === void 0 || r === false ? (this.remove(t), false) : true : r === void 0 || r === true ? (this.add(t), true) : false;
  } }, replace: { value: function(t, r) {
    String(r) === "" && ga.SyntaxError(), t = mr(t), r = mr(r);
    var n = jt(this), l = n.indexOf(t);
    if (l < 0)
      return false;
    var f = n.indexOf(r);
    return f < 0 ? n[l] = r : l < f ? (n[l] = r, n.splice(f, 1)) : n.splice(l, 1), this._update(n), true;
  } }, toString: { value: function() {
    return this._getString();
  } }, value: { get: function() {
    return this._getString();
  }, set: function(e) {
    this._setString(e), this._update();
  } }, _update: { value: function(e) {
    e ? (fs(this, e), this._setString(e.join(" ").trim())) : fs(this, jt(this)), this._lastStringValue = this._getString();
  } } });
  function fs(e, t) {
    var r = e._length, n;
    for (e._length = t.length, n = 0; n < t.length; n++)
      e[n] = t[n];
    for (; n < r; n++)
      e[n] = void 0;
  }
  function mr(e) {
    return e = String(e), e === "" && ga.SyntaxError(), /[ \t\r\n\f]/.test(e) && ga.InvalidCharacterError(), e;
  }
  function wu(e) {
    for (var t = e._length, r = Array(t), n = 0; n < t; n++)
      r[n] = e[n];
    return r;
  }
  function jt(e) {
    var t = e._getString();
    if (t === e._lastStringValue)
      return wu(e);
    var r = t.replace(/(^[ \t\r\n\f]+)|([ \t\r\n\f]+$)/g, "");
    if (r === "")
      return [];
    var n = Object.create(null);
    return r.split(/[ \t\r\n\f]+/g).filter(function(l) {
      var f = "$" + l;
      return n[f] ? false : (n[f] = true, true);
    });
  }
});
var an = O((Yt, bs) => {
  var tn = Object.create(null, { location: { get: function() {
    throw new Error("window.location is not supported.");
  } } }), Tu = function(e, t) {
    return e.compareDocumentPosition(t);
  }, ku = function(e, t) {
    return Tu(e, t) & 2 ? 1 : -1;
  }, rn = function(e) {
    for (; (e = e.nextSibling) && e.nodeType !== 1; )
      ;
    return e;
  }, Wt = function(e) {
    for (; (e = e.previousSibling) && e.nodeType !== 1; )
      ;
    return e;
  }, Su = function(e) {
    if (e = e.firstChild)
      for (; e.nodeType !== 1 && (e = e.nextSibling); )
        ;
    return e;
  }, Nu = function(e) {
    if (e = e.lastChild)
      for (; e.nodeType !== 1 && (e = e.previousSibling); )
        ;
    return e;
  }, Gt = function(e) {
    if (!e.parentNode)
      return false;
    var t = e.parentNode.nodeType;
    return t === 1 || t === 9;
  }, hs = function(e) {
    if (!e)
      return e;
    var t = e[0];
    return t === '"' || t === "'" ? (e[e.length - 1] === t ? e = e.slice(1, -1) : e = e.slice(1), e.replace(P.str_escape, function(r) {
      var n = /^\\(?:([0-9A-Fa-f]+)|([\r\n\f]+))/.exec(r);
      if (!n)
        return r.slice(1);
      if (n[2])
        return "";
      var l = parseInt(n[1], 16);
      return String.fromCodePoint ? String.fromCodePoint(l) : String.fromCharCode(l);
    })) : P.ident.test(e) ? yt(e) : e;
  }, yt = function(e) {
    return e.replace(P.escape, function(t) {
      var r = /^\\([0-9A-Fa-f]+)/.exec(t);
      if (!r)
        return t[1];
      var n = parseInt(r[1], 16);
      return String.fromCodePoint ? String.fromCodePoint(n) : String.fromCharCode(n);
    });
  }, Cu = function() {
    return Array.prototype.indexOf ? Array.prototype.indexOf : function(e, t) {
      for (var r = this.length; r--; )
        if (this[r] === t)
          return r;
      return -1;
    };
  }(), xs = function(e, t) {
    var r = P.inside.source.replace(/</g, e).replace(/>/g, t);
    return new RegExp(r);
  }, Me = function(e, t, r) {
    return e = e.source, e = e.replace(t, r.source || r), new RegExp(e);
  }, ps = function(e, t) {
    return e.replace(/^(?:\w+:\/\/|\/+)/, "").replace(/(?:\/+|\/*#.*?)$/, "").split("/", t).join("/");
  }, Au = function(e, t) {
    var r = e.replace(/\s+/g, ""), n;
    return r === "even" ? r = "2n+0" : r === "odd" ? r = "2n+1" : r.indexOf("n") === -1 && (r = "0n" + r), n = /^([+-])?(\d+)?n([+-])?(\d+)?$/.exec(r), { group: n[1] === "-" ? -(n[2] || 1) : +(n[2] || 1), offset: n[4] ? n[3] === "-" ? -n[4] : +n[4] : 0 };
  }, _a = function(e, t, r) {
    var n = Au(e), l = n.group, f = n.offset, _ = r ? Nu : Su, y = r ? Wt : rn;
    return function(T) {
      if (!!Gt(T))
        for (var S = _(T.parentNode), D = 0; S; ) {
          if (t(S, T) && D++, S === T)
            return D -= f, l && D ? D % l == 0 && D < 0 == l < 0 : !D;
          S = y(S);
        }
    };
  }, _e = { "*": function() {
    return function() {
      return true;
    };
  }(), type: function(e) {
    return e = e.toLowerCase(), function(t) {
      return t.nodeName.toLowerCase() === e;
    };
  }, attr: function(e, t, r, n) {
    return t = ms[t], function(l) {
      var f;
      switch (e) {
        case "for":
          f = l.htmlFor;
          break;
        case "class":
          f = l.className, f === "" && l.getAttribute("class") == null && (f = null);
          break;
        case "href":
        case "src":
          f = l.getAttribute(e, 2);
          break;
        case "title":
          f = l.getAttribute("title") || null;
          break;
        case "id":
        case "lang":
        case "dir":
        case "accessKey":
        case "hidden":
        case "tabIndex":
        case "style":
          if (l.getAttribute) {
            f = l.getAttribute(e);
            break;
          }
        default:
          if (l.hasAttribute && !l.hasAttribute(e))
            break;
          f = l[e] != null ? l[e] : l.getAttribute && l.getAttribute(e);
          break;
      }
      if (f != null)
        return f = f + "", n && (f = f.toLowerCase(), r = r.toLowerCase()), t(f, r);
    };
  }, ":first-child": function(e) {
    return !Wt(e) && Gt(e);
  }, ":last-child": function(e) {
    return !rn(e) && Gt(e);
  }, ":only-child": function(e) {
    return !Wt(e) && !rn(e) && Gt(e);
  }, ":nth-child": function(e, t) {
    return _a(e, function() {
      return true;
    }, t);
  }, ":nth-last-child": function(e) {
    return _e[":nth-child"](e, true);
  }, ":root": function(e) {
    return e.ownerDocument.documentElement === e;
  }, ":empty": function(e) {
    return !e.firstChild;
  }, ":not": function(e) {
    var t = va(e);
    return function(r) {
      return !t(r);
    };
  }, ":first-of-type": function(e) {
    if (!!Gt(e)) {
      for (var t = e.nodeName; e = Wt(e); )
        if (e.nodeName === t)
          return;
      return true;
    }
  }, ":last-of-type": function(e) {
    if (!!Gt(e)) {
      for (var t = e.nodeName; e = rn(e); )
        if (e.nodeName === t)
          return;
      return true;
    }
  }, ":only-of-type": function(e) {
    return _e[":first-of-type"](e) && _e[":last-of-type"](e);
  }, ":nth-of-type": function(e, t) {
    return _a(e, function(r, n) {
      return r.nodeName === n.nodeName;
    }, t);
  }, ":nth-last-of-type": function(e) {
    return _e[":nth-of-type"](e, true);
  }, ":checked": function(e) {
    return !!(e.checked || e.selected);
  }, ":indeterminate": function(e) {
    return !_e[":checked"](e);
  }, ":enabled": function(e) {
    return !e.disabled && e.type !== "hidden";
  }, ":disabled": function(e) {
    return !!e.disabled;
  }, ":target": function(e) {
    return e.id === tn.location.hash.substring(1);
  }, ":focus": function(e) {
    return e === e.ownerDocument.activeElement;
  }, ":is": function(e) {
    return va(e);
  }, ":matches": function(e) {
    return _e[":is"](e);
  }, ":nth-match": function(e, t) {
    var r = e.split(/\s*,\s*/), n = r.shift(), l = va(r.join(","));
    return _a(n, l, t);
  }, ":nth-last-match": function(e) {
    return _e[":nth-match"](e, true);
  }, ":links-here": function(e) {
    return e + "" == tn.location + "";
  }, ":lang": function(e) {
    return function(t) {
      for (; t; ) {
        if (t.lang)
          return t.lang.indexOf(e) === 0;
        t = t.parentNode;
      }
    };
  }, ":dir": function(e) {
    return function(t) {
      for (; t; ) {
        if (t.dir)
          return t.dir === e;
        t = t.parentNode;
      }
    };
  }, ":scope": function(e, t) {
    var r = t || e.ownerDocument;
    return r.nodeType === 9 ? e === r.documentElement : e === r;
  }, ":any-link": function(e) {
    return typeof e.href == "string";
  }, ":local-link": function(e) {
    if (e.nodeName)
      return e.href && e.host === tn.location.host;
    var t = +e + 1;
    return function(r) {
      if (!!r.href) {
        var n = tn.location + "", l = r + "";
        return ps(n, t) === ps(l, t);
      }
    };
  }, ":default": function(e) {
    return !!e.defaultSelected;
  }, ":valid": function(e) {
    return e.willValidate || e.validity && e.validity.valid;
  }, ":invalid": function(e) {
    return !_e[":valid"](e);
  }, ":in-range": function(e) {
    return e.value > e.min && e.value <= e.max;
  }, ":out-of-range": function(e) {
    return !_e[":in-range"](e);
  }, ":required": function(e) {
    return !!e.required;
  }, ":optional": function(e) {
    return !e.required;
  }, ":read-only": function(e) {
    if (e.readOnly)
      return true;
    var t = e.getAttribute("contenteditable"), r = e.contentEditable, n = e.nodeName.toLowerCase();
    return n = n !== "input" && n !== "textarea", (n || e.disabled) && t == null && r !== "true";
  }, ":read-write": function(e) {
    return !_e[":read-only"](e);
  }, ":hover": function() {
    throw new Error(":hover is not supported.");
  }, ":active": function() {
    throw new Error(":active is not supported.");
  }, ":link": function() {
    throw new Error(":link is not supported.");
  }, ":visited": function() {
    throw new Error(":visited is not supported.");
  }, ":column": function() {
    throw new Error(":column is not supported.");
  }, ":nth-column": function() {
    throw new Error(":nth-column is not supported.");
  }, ":nth-last-column": function() {
    throw new Error(":nth-last-column is not supported.");
  }, ":current": function() {
    throw new Error(":current is not supported.");
  }, ":past": function() {
    throw new Error(":past is not supported.");
  }, ":future": function() {
    throw new Error(":future is not supported.");
  }, ":contains": function(e) {
    return function(t) {
      var r = t.innerText || t.textContent || t.value || "";
      return r.indexOf(e) !== -1;
    };
  }, ":has": function(e) {
    return function(t) {
      return gs(e, t).length > 0;
    };
  } }, ms = { "-": function() {
    return true;
  }, "=": function(e, t) {
    return e === t;
  }, "*=": function(e, t) {
    return e.indexOf(t) !== -1;
  }, "~=": function(e, t) {
    var r, n, l, f;
    for (n = 0; ; n = r + 1) {
      if (r = e.indexOf(t, n), r === -1)
        return false;
      if (l = e[r - 1], f = e[r + t.length], (!l || l === " ") && (!f || f === " "))
        return true;
    }
  }, "|=": function(e, t) {
    var r = e.indexOf(t), n;
    if (r === 0)
      return n = e[r + t.length], n === "-" || !n;
  }, "^=": function(e, t) {
    return e.indexOf(t) === 0;
  }, "$=": function(e, t) {
    var r = e.lastIndexOf(t);
    return r !== -1 && r + t.length === e.length;
  }, "!=": function(e, t) {
    return e !== t;
  } }, gr = { " ": function(e) {
    return function(t) {
      for (; t = t.parentNode; )
        if (e(t))
          return t;
    };
  }, ">": function(e) {
    return function(t) {
      if (t = t.parentNode)
        return e(t) && t;
    };
  }, "+": function(e) {
    return function(t) {
      if (t = Wt(t))
        return e(t) && t;
    };
  }, "~": function(e) {
    return function(t) {
      for (; t = Wt(t); )
        if (e(t))
          return t;
    };
  }, noop: function(e) {
    return function(t) {
      return e(t) && t;
    };
  }, ref: function(e, t) {
    var r;
    function n(l) {
      for (var f = l.ownerDocument, _ = f.getElementsByTagName("*"), y = _.length; y--; )
        if (r = _[y], n.test(l))
          return r = null, true;
      r = null;
    }
    return n.combinator = function(l) {
      if (!(!r || !r.getAttribute)) {
        var f = r.getAttribute(t) || "";
        if (f[0] === "#" && (f = f.substring(1)), f === l.id && e(r))
          return r;
      }
    }, n;
  } }, P = { escape: /\\(?:[^0-9A-Fa-f\r\n]|[0-9A-Fa-f]{1,6}[\r\n\t ]?)/g, str_escape: /(escape)|\\(\n|\r\n?|\f)/g, nonascii: /[\u00A0-\uFFFF]/, cssid: /(?:(?!-?[0-9])(?:escape|nonascii|[-_a-zA-Z0-9])+)/, qname: /^ *(cssid|\*)/, simple: /^(?:([.#]cssid)|pseudo|attr)/, ref: /^ *\/(cssid)\/ */, combinator: /^(?: +([^ \w*.#\\]) +|( )+|([^ \w*.#\\]))(?! *$)/, attr: /^\[(cssid)(?:([^\w]?=)(inside))?\]/, pseudo: /^(:cssid)(?:\((inside)\))?/, inside: /(?:"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|<[^"'>]*>|\\["'>]|[^"'>])*/, ident: /^(cssid)$/ };
  P.cssid = Me(P.cssid, "nonascii", P.nonascii);
  P.cssid = Me(P.cssid, "escape", P.escape);
  P.qname = Me(P.qname, "cssid", P.cssid);
  P.simple = Me(P.simple, "cssid", P.cssid);
  P.ref = Me(P.ref, "cssid", P.cssid);
  P.attr = Me(P.attr, "cssid", P.cssid);
  P.pseudo = Me(P.pseudo, "cssid", P.cssid);
  P.inside = Me(P.inside, `[^"'>]*`, P.inside);
  P.attr = Me(P.attr, "inside", xs("\\[", "\\]"));
  P.pseudo = Me(P.pseudo, "inside", xs("\\(", "\\)"));
  P.simple = Me(P.simple, "pseudo", P.pseudo);
  P.simple = Me(P.simple, "attr", P.attr);
  P.ident = Me(P.ident, "cssid", P.cssid);
  P.str_escape = Me(P.str_escape, "escape", P.escape);
  var br = function(e) {
    for (var t = e.replace(/^\s+|\s+$/g, ""), r, n = [], l = [], f, _, y, T, S; t; ) {
      if (y = P.qname.exec(t))
        t = t.substring(y[0].length), _ = yt(y[1]), l.push(nn(_, true));
      else if (y = P.simple.exec(t))
        t = t.substring(y[0].length), _ = "*", l.push(nn(_, true)), l.push(nn(y));
      else
        throw new SyntaxError("Invalid selector.");
      for (; y = P.simple.exec(t); )
        t = t.substring(y[0].length), l.push(nn(y));
      if (t[0] === "!" && (t = t.substring(1), f = Du(), f.qname = _, l.push(f.simple)), y = P.ref.exec(t)) {
        t = t.substring(y[0].length), S = gr.ref(Ea(l), yt(y[1])), n.push(S.combinator), l = [];
        continue;
      }
      if (y = P.combinator.exec(t)) {
        if (t = t.substring(y[0].length), T = y[1] || y[2] || y[3], T === ",") {
          n.push(gr.noop(Ea(l)));
          break;
        }
      } else
        T = "noop";
      if (!gr[T])
        throw new SyntaxError("Bad combinator.");
      n.push(gr[T](Ea(l))), l = [];
    }
    return r = Lu(n), r.qname = _, r.sel = t, f && (f.lname = r.qname, f.test = r, f.qname = f.qname, f.sel = r.sel, r = f), S && (S.test = r, S.qname = r.qname, S.sel = r.sel, r = S), r;
  }, nn = function(e, t) {
    if (t)
      return e === "*" ? _e["*"] : _e.type(e);
    if (e[1])
      return e[1][0] === "." ? _e.attr("class", "~=", yt(e[1].substring(1)), false) : _e.attr("id", "=", yt(e[1].substring(1)), false);
    if (e[2])
      return e[3] ? _e[yt(e[2])](hs(e[3])) : _e[yt(e[2])];
    if (e[4]) {
      var r = e[6], n = /["'\s]\s*I$/i.test(r);
      return n && (r = r.replace(/\s*I$/i, "")), _e.attr(yt(e[4]), e[5] || "-", hs(r), n);
    }
    throw new SyntaxError("Unknown Selector.");
  }, Ea = function(e) {
    var t = e.length, r;
    return t < 2 ? e[0] : function(n) {
      if (!!n) {
        for (r = 0; r < t; r++)
          if (!e[r](n))
            return;
        return true;
      }
    };
  }, Lu = function(e) {
    return e.length < 2 ? function(t) {
      return !!e[0](t);
    } : function(t) {
      for (var r = e.length; r--; )
        if (!(t = e[r](t)))
          return;
      return true;
    };
  }, Du = function() {
    var e;
    function t(r) {
      for (var n = r.ownerDocument, l = n.getElementsByTagName(t.lname), f = l.length; f--; )
        if (t.test(l[f]) && e === r)
          return e = null, true;
      e = null;
    }
    return t.simple = function(r) {
      return e = r, true;
    }, t;
  }, va = function(e) {
    for (var t = br(e), r = [t]; t.sel; )
      t = br(t.sel), r.push(t);
    return r.length < 2 ? t : function(n) {
      for (var l = r.length, f = 0; f < l; f++)
        if (r[f](n))
          return true;
    };
  }, gs = function(e, t) {
    for (var r = [], n = br(e), l = t.getElementsByTagName(n.qname), f = 0, _; _ = l[f++]; )
      n(_) && r.push(_);
    if (n.sel) {
      for (; n.sel; )
        for (n = br(n.sel), l = t.getElementsByTagName(n.qname), f = 0; _ = l[f++]; )
          n(_) && Cu.call(r, _) === -1 && r.push(_);
      r.sort(ku);
    }
    return r;
  };
  bs.exports = Yt = function(e, t) {
    var r, n;
    if (t.nodeType !== 11 && e.indexOf(" ") === -1) {
      if (e[0] === "#" && t.rooted && /^#[A-Z_][-A-Z0-9_]*$/i.test(e) && t.doc._hasMultipleElementsWithId && (r = e.substring(1), !t.doc._hasMultipleElementsWithId(r)))
        return n = t.doc.getElementById(r), n ? [n] : [];
      if (e[0] === "." && /^\.\w+$/.test(e))
        return t.getElementsByClassName(e.substring(1));
      if (/^\w+$/.test(e))
        return t.getElementsByTagName(e);
    }
    return gs(e, t);
  };
  Yt.selectors = _e;
  Yt.operators = ms;
  Yt.combinators = gr;
  Yt.matches = function(e, t) {
    var r = { sel: t };
    do
      if (r = br(r.sel), r(e))
        return true;
    while (r.sel);
    return false;
  };
});
var sn = O((Hf, _s) => {
  var Ru = we(), Mu = ta(), ya = function(e, t) {
    for (var r = e.createDocumentFragment(), n = 0; n < t.length; n++) {
      var l = t[n], f = l instanceof Ru;
      r.appendChild(f ? l : e.createTextNode(String(l)));
    }
    return r;
  }, Iu = { after: { value: function() {
    var t = Array.prototype.slice.call(arguments), r = this.parentNode, n = this.nextSibling;
    if (r !== null) {
      for (; n && t.some(function(f) {
        return f === n;
      }); )
        n = n.nextSibling;
      var l = ya(this.doc, t);
      r.insertBefore(l, n);
    }
  } }, before: { value: function() {
    var t = Array.prototype.slice.call(arguments), r = this.parentNode, n = this.previousSibling;
    if (r !== null) {
      for (; n && t.some(function(_) {
        return _ === n;
      }); )
        n = n.previousSibling;
      var l = ya(this.doc, t), f = n ? n.nextSibling : r.firstChild;
      r.insertBefore(l, f);
    }
  } }, remove: { value: function() {
    this.parentNode !== null && (this.doc && (this.doc._preremoveNodeIterators(this), this.rooted && this.doc.mutateRemove(this)), this._remove(), this.parentNode = null);
  } }, _remove: { value: function() {
    var t = this.parentNode;
    t !== null && (t._childNodes ? t._childNodes.splice(this.index, 1) : t._firstChild === this && (this._nextSibling === this ? t._firstChild = null : t._firstChild = this._nextSibling), Mu.remove(this), t.modify());
  } }, replaceWith: { value: function() {
    var t = Array.prototype.slice.call(arguments), r = this.parentNode, n = this.nextSibling;
    if (r !== null) {
      for (; n && t.some(function(f) {
        return f === n;
      }); )
        n = n.nextSibling;
      var l = ya(this.doc, t);
      this.parentNode === r ? r.replaceChild(l, this) : r.insertBefore(l, n);
    }
  } } };
  _s.exports = Iu;
});
var wa = O((Pf, vs) => {
  var Es = we(), Ou = { nextElementSibling: { get: function() {
    if (this.parentNode) {
      for (var e = this.nextSibling; e !== null; e = e.nextSibling)
        if (e.nodeType === Es.ELEMENT_NODE)
          return e;
    }
    return null;
  } }, previousElementSibling: { get: function() {
    if (this.parentNode) {
      for (var e = this.previousSibling; e !== null; e = e.previousSibling)
        if (e.nodeType === Es.ELEMENT_NODE)
          return e;
    }
    return null;
  } } };
  vs.exports = Ou;
});
var Ta = O((Bf, ws) => {
  ws.exports = ys;
  var $t = he();
  function ys(e) {
    this.element = e;
  }
  Object.defineProperties(ys.prototype, { length: { get: $t.shouldOverride }, item: { value: $t.shouldOverride }, getNamedItem: { value: function(t) {
    return this.element.getAttributeNode(t);
  } }, getNamedItemNS: { value: function(t, r) {
    return this.element.getAttributeNodeNS(t, r);
  } }, setNamedItem: { value: $t.nyi }, setNamedItemNS: { value: $t.nyi }, removeNamedItem: { value: function(t) {
    var r = this.element.getAttributeNode(t);
    if (r)
      return this.element.removeAttribute(t), r;
    $t.NotFoundError();
  } }, removeNamedItemNS: { value: function(t, r) {
    var n = this.element.getAttributeNodeNS(t, r);
    if (n)
      return this.element.removeAttributeNS(t, r), n;
    $t.NotFoundError();
  } } });
});
var Xt = O((Uf, As) => {
  As.exports = wt;
  var ka = en(), ue = he(), tt = ue.NAMESPACE, on = ma(), Ye = we(), Sa = It(), qu = ra(), cn = ls(), Kt = Kr(), Fu = ba(), Na = an(), Ts = Jr(), Hu = sn(), Pu = wa(), ks = Ta(), Ss = Object.create(null);
  function wt(e, t, r, n) {
    Ts.call(this), this.nodeType = Ye.ELEMENT_NODE, this.ownerDocument = e, this.localName = t, this.namespaceURI = r, this.prefix = n, this._tagName = void 0, this._attrsByQName = Object.create(null), this._attrsByLName = Object.create(null), this._attrKeys = [];
  }
  function Ns(e, t) {
    if (e.nodeType === Ye.TEXT_NODE)
      t.push(e._data);
    else
      for (var r = 0, n = e.childNodes.length; r < n; r++)
        Ns(e.childNodes[r], t);
  }
  wt.prototype = Object.create(Ts.prototype, { isHTML: { get: function() {
    return this.namespaceURI === tt.HTML && this.ownerDocument.isHTML;
  } }, tagName: { get: function() {
    if (this._tagName === void 0) {
      var t;
      if (this.prefix === null ? t = this.localName : t = this.prefix + ":" + this.localName, this.isHTML) {
        var r = Ss[t];
        r || (Ss[t] = r = ue.toASCIIUpperCase(t)), t = r;
      }
      this._tagName = t;
    }
    return this._tagName;
  } }, nodeName: { get: function() {
    return this.tagName;
  } }, nodeValue: { get: function() {
    return null;
  }, set: function() {
  } }, textContent: { get: function() {
    var e = [];
    return Ns(this, e), e.join("");
  }, set: function(e) {
    this.removeChildren(), e != null && e !== "" && this._appendChild(this.ownerDocument.createTextNode(e));
  } }, innerHTML: { get: function() {
    return this.serialize();
  }, set: ue.nyi }, outerHTML: { get: function() {
    return qu.serializeOne(this, { nodeType: 0 });
  }, set: function(e) {
    var t = this.ownerDocument, r = this.parentNode;
    if (r !== null) {
      r.nodeType === Ye.DOCUMENT_NODE && ue.NoModificationAllowedError(), r.nodeType === Ye.DOCUMENT_FRAGMENT_NODE && (r = r.ownerDocument.createElement("body"));
      var n = t.implementation.mozHTMLParser(t._address, r);
      n.parse(e === null ? "" : String(e), true), this.replaceWith(n._asDocumentFragment());
    }
  } }, _insertAdjacent: { value: function(t, r) {
    var n = false;
    switch (t) {
      case "beforebegin":
        n = true;
      case "afterend":
        var l = this.parentNode;
        return l === null ? null : l.insertBefore(r, n ? this : this.nextSibling);
      case "afterbegin":
        n = true;
      case "beforeend":
        return this.insertBefore(r, n ? this.firstChild : null);
      default:
        return ue.SyntaxError();
    }
  } }, insertAdjacentElement: { value: function(t, r) {
    if (r.nodeType !== Ye.ELEMENT_NODE)
      throw new TypeError("not an element");
    return t = ue.toASCIILowerCase(String(t)), this._insertAdjacent(t, r);
  } }, insertAdjacentText: { value: function(t, r) {
    var n = this.ownerDocument.createTextNode(r);
    t = ue.toASCIILowerCase(String(t)), this._insertAdjacent(t, n);
  } }, insertAdjacentHTML: { value: function(t, r) {
    t = ue.toASCIILowerCase(String(t)), r = String(r);
    var n;
    switch (t) {
      case "beforebegin":
      case "afterend":
        n = this.parentNode, (n === null || n.nodeType === Ye.DOCUMENT_NODE) && ue.NoModificationAllowedError();
        break;
      case "afterbegin":
      case "beforeend":
        n = this;
        break;
      default:
        ue.SyntaxError();
    }
    (!(n instanceof wt) || n.ownerDocument.isHTML && n.localName === "html" && n.namespaceURI === tt.HTML) && (n = n.ownerDocument.createElementNS(tt.HTML, "body"));
    var l = this.ownerDocument.implementation.mozHTMLParser(this.ownerDocument._address, n);
    l.parse(r, true), this._insertAdjacent(t, l._asDocumentFragment());
  } }, children: { get: function() {
    return this._children || (this._children = new Cs(this)), this._children;
  } }, attributes: { get: function() {
    return this._attributes || (this._attributes = new Ca(this)), this._attributes;
  } }, firstElementChild: { get: function() {
    for (var e = this.firstChild; e !== null; e = e.nextSibling)
      if (e.nodeType === Ye.ELEMENT_NODE)
        return e;
    return null;
  } }, lastElementChild: { get: function() {
    for (var e = this.lastChild; e !== null; e = e.previousSibling)
      if (e.nodeType === Ye.ELEMENT_NODE)
        return e;
    return null;
  } }, childElementCount: { get: function() {
    return this.children.length;
  } }, nextElement: { value: function(e) {
    e || (e = this.ownerDocument.documentElement);
    var t = this.firstElementChild;
    if (!t) {
      if (this === e)
        return null;
      t = this.nextElementSibling;
    }
    if (t)
      return t;
    for (var r = this.parentElement; r && r !== e; r = r.parentElement)
      if (t = r.nextElementSibling, t)
        return t;
    return null;
  } }, getElementsByTagName: { value: function(t) {
    var r;
    return t ? (t === "*" ? r = function() {
      return true;
    } : this.isHTML ? r = Bu(t) : r = Aa(t), new cn(this, r)) : new Sa();
  } }, getElementsByTagNameNS: { value: function(t, r) {
    var n;
    return t === "*" && r === "*" ? n = function() {
      return true;
    } : t === "*" ? n = Aa(r) : r === "*" ? n = Uu(t) : n = Vu(t, r), new cn(this, n);
  } }, getElementsByClassName: { value: function(t) {
    if (t = String(t).trim(), t === "") {
      var r = new Sa();
      return r;
    }
    return t = t.split(/[ \t\r\n\f]+/), new cn(this, zu(t));
  } }, getElementsByName: { value: function(t) {
    return new cn(this, ju(String(t)));
  } }, clone: { value: function() {
    var t;
    this.namespaceURI !== tt.HTML || this.prefix || !this.ownerDocument.isHTML ? t = this.ownerDocument.createElementNS(this.namespaceURI, this.prefix !== null ? this.prefix + ":" + this.localName : this.localName) : t = this.ownerDocument.createElement(this.localName);
    for (var r = 0, n = this._attrKeys.length; r < n; r++) {
      var l = this._attrKeys[r], f = this._attrsByLName[l], _ = f.cloneNode();
      _._setOwnerElement(t), t._attrsByLName[l] = _, t._addQName(_);
    }
    return t._attrKeys = this._attrKeys.concat(), t;
  } }, isEqual: { value: function(t) {
    if (this.localName !== t.localName || this.namespaceURI !== t.namespaceURI || this.prefix !== t.prefix || this._numattrs !== t._numattrs)
      return false;
    for (var r = 0, n = this._numattrs; r < n; r++) {
      var l = this._attr(r);
      if (!t.hasAttributeNS(l.namespaceURI, l.localName) || t.getAttributeNS(l.namespaceURI, l.localName) !== l.value)
        return false;
    }
    return true;
  } }, _lookupNamespacePrefix: { value: function(t, r) {
    if (this.namespaceURI && this.namespaceURI === t && this.prefix !== null && r.lookupNamespaceURI(this.prefix) === t)
      return this.prefix;
    for (var n = 0, l = this._numattrs; n < l; n++) {
      var f = this._attr(n);
      if (f.prefix === "xmlns" && f.value === t && r.lookupNamespaceURI(f.localName) === t)
        return f.localName;
    }
    var _ = this.parentElement;
    return _ ? _._lookupNamespacePrefix(t, r) : null;
  } }, lookupNamespaceURI: { value: function(t) {
    if ((t === "" || t === void 0) && (t = null), this.namespaceURI !== null && this.prefix === t)
      return this.namespaceURI;
    for (var r = 0, n = this._numattrs; r < n; r++) {
      var l = this._attr(r);
      if (l.namespaceURI === tt.XMLNS && (l.prefix === "xmlns" && l.localName === t || t === null && l.prefix === null && l.localName === "xmlns"))
        return l.value || null;
    }
    var f = this.parentElement;
    return f ? f.lookupNamespaceURI(t) : null;
  } }, getAttribute: { value: function(t) {
    var r = this.getAttributeNode(t);
    return r ? r.value : null;
  } }, getAttributeNS: { value: function(t, r) {
    var n = this.getAttributeNodeNS(t, r);
    return n ? n.value : null;
  } }, getAttributeNode: { value: function(t) {
    t = String(t), /[A-Z]/.test(t) && this.isHTML && (t = ue.toASCIILowerCase(t));
    var r = this._attrsByQName[t];
    return r ? (Array.isArray(r) && (r = r[0]), r) : null;
  } }, getAttributeNodeNS: { value: function(t, r) {
    t = t == null ? "" : String(t), r = String(r);
    var n = this._attrsByLName[t + "|" + r];
    return n || null;
  } }, hasAttribute: { value: function(t) {
    return t = String(t), /[A-Z]/.test(t) && this.isHTML && (t = ue.toASCIILowerCase(t)), this._attrsByQName[t] !== void 0;
  } }, hasAttributeNS: { value: function(t, r) {
    t = t == null ? "" : String(t), r = String(r);
    var n = t + "|" + r;
    return this._attrsByLName[n] !== void 0;
  } }, hasAttributes: { value: function() {
    return this._numattrs > 0;
  } }, toggleAttribute: { value: function(t, r) {
    t = String(t), ka.isValidName(t) || ue.InvalidCharacterError(), /[A-Z]/.test(t) && this.isHTML && (t = ue.toASCIILowerCase(t));
    var n = this._attrsByQName[t];
    return n === void 0 ? r === void 0 || r === true ? (this._setAttribute(t, ""), true) : false : r === void 0 || r === false ? (this.removeAttribute(t), false) : true;
  } }, _setAttribute: { value: function(t, r) {
    var n = this._attrsByQName[t], l;
    n ? Array.isArray(n) && (n = n[0]) : (n = this._newattr(t), l = true), n.value = r, this._attributes && (this._attributes[t] = n), l && this._newattrhook && this._newattrhook(t, r);
  } }, setAttribute: { value: function(t, r) {
    t = String(t), ka.isValidName(t) || ue.InvalidCharacterError(), /[A-Z]/.test(t) && this.isHTML && (t = ue.toASCIILowerCase(t)), this._setAttribute(t, String(r));
  } }, _setAttributeNS: { value: function(t, r, n) {
    var l = r.indexOf(":"), f, _;
    l < 0 ? (f = null, _ = r) : (f = r.substring(0, l), _ = r.substring(l + 1)), (t === "" || t === void 0) && (t = null);
    var y = (t === null ? "" : t) + "|" + _, T = this._attrsByLName[y], S;
    T || (T = new _r(this, _, f, t), S = true, this._attrsByLName[y] = T, this._attributes && (this._attributes[this._attrKeys.length] = T), this._attrKeys.push(y), this._addQName(T)), T.value = n, S && this._newattrhook && this._newattrhook(r, n);
  } }, setAttributeNS: { value: function(t, r, n) {
    t = t == null || t === "" ? null : String(t), r = String(r), ka.isValidQName(r) || ue.InvalidCharacterError();
    var l = r.indexOf(":"), f = l < 0 ? null : r.substring(0, l);
    (f !== null && t === null || f === "xml" && t !== tt.XML || (r === "xmlns" || f === "xmlns") && t !== tt.XMLNS || t === tt.XMLNS && !(r === "xmlns" || f === "xmlns")) && ue.NamespaceError(), this._setAttributeNS(t, r, String(n));
  } }, setAttributeNode: { value: function(t) {
    if (t.ownerElement !== null && t.ownerElement !== this)
      throw new Kt(Kt.INUSE_ATTRIBUTE_ERR);
    var r = null, n = this._attrsByQName[t.name];
    if (n) {
      if (Array.isArray(n) || (n = [n]), n.some(function(l) {
        return l === t;
      }))
        return t;
      if (t.ownerElement !== null)
        throw new Kt(Kt.INUSE_ATTRIBUTE_ERR);
      n.forEach(function(l) {
        this.removeAttributeNode(l);
      }, this), r = n[0];
    }
    return this.setAttributeNodeNS(t), r;
  } }, setAttributeNodeNS: { value: function(t) {
    if (t.ownerElement !== null)
      throw new Kt(Kt.INUSE_ATTRIBUTE_ERR);
    var r = t.namespaceURI, n = (r === null ? "" : r) + "|" + t.localName, l = this._attrsByLName[n];
    return l && this.removeAttributeNode(l), t._setOwnerElement(this), this._attrsByLName[n] = t, this._attributes && (this._attributes[this._attrKeys.length] = t), this._attrKeys.push(n), this._addQName(t), this._newattrhook && this._newattrhook(t.name, t.value), l || null;
  } }, removeAttribute: { value: function(t) {
    t = String(t), /[A-Z]/.test(t) && this.isHTML && (t = ue.toASCIILowerCase(t));
    var r = this._attrsByQName[t];
    if (!!r) {
      Array.isArray(r) ? r.length > 2 ? r = r.shift() : (this._attrsByQName[t] = r[1], r = r[0]) : this._attrsByQName[t] = void 0;
      var n = r.namespaceURI, l = (n === null ? "" : n) + "|" + r.localName;
      this._attrsByLName[l] = void 0;
      var f = this._attrKeys.indexOf(l);
      this._attributes && (Array.prototype.splice.call(this._attributes, f, 1), this._attributes[t] = void 0), this._attrKeys.splice(f, 1);
      var _ = r.onchange;
      r._setOwnerElement(null), _ && _.call(r, this, r.localName, r.value, null), this.rooted && this.ownerDocument.mutateRemoveAttr(r);
    }
  } }, removeAttributeNS: { value: function(t, r) {
    t = t == null ? "" : String(t), r = String(r);
    var n = t + "|" + r, l = this._attrsByLName[n];
    if (!!l) {
      this._attrsByLName[n] = void 0;
      var f = this._attrKeys.indexOf(n);
      this._attributes && Array.prototype.splice.call(this._attributes, f, 1), this._attrKeys.splice(f, 1), this._removeQName(l);
      var _ = l.onchange;
      l._setOwnerElement(null), _ && _.call(l, this, l.localName, l.value, null), this.rooted && this.ownerDocument.mutateRemoveAttr(l);
    }
  } }, removeAttributeNode: { value: function(t) {
    var r = t.namespaceURI, n = (r === null ? "" : r) + "|" + t.localName;
    return this._attrsByLName[n] !== t && ue.NotFoundError(), this.removeAttributeNS(r, t.localName), t;
  } }, getAttributeNames: { value: function() {
    var t = this;
    return this._attrKeys.map(function(r) {
      return t._attrsByLName[r].name;
    });
  } }, _getattr: { value: function(t) {
    var r = this._attrsByQName[t];
    return r ? r.value : null;
  } }, _setattr: { value: function(t, r) {
    var n = this._attrsByQName[t], l;
    n || (n = this._newattr(t), l = true), n.value = String(r), this._attributes && (this._attributes[t] = n), l && this._newattrhook && this._newattrhook(t, r);
  } }, _newattr: { value: function(t) {
    var r = new _r(this, t, null, null), n = "|" + t;
    return this._attrsByQName[t] = r, this._attrsByLName[n] = r, this._attributes && (this._attributes[this._attrKeys.length] = r), this._attrKeys.push(n), r;
  } }, _addQName: { value: function(e) {
    var t = e.name, r = this._attrsByQName[t];
    r ? Array.isArray(r) ? r.push(e) : this._attrsByQName[t] = [r, e] : this._attrsByQName[t] = e, this._attributes && (this._attributes[t] = e);
  } }, _removeQName: { value: function(e) {
    var t = e.name, r = this._attrsByQName[t];
    if (Array.isArray(r)) {
      var n = r.indexOf(e);
      ue.assert(n !== -1), r.length === 2 ? (this._attrsByQName[t] = r[1 - n], this._attributes && (this._attributes[t] = this._attrsByQName[t])) : (r.splice(n, 1), this._attributes && this._attributes[t] === e && (this._attributes[t] = r[0]));
    } else
      ue.assert(r === e), this._attrsByQName[t] = void 0, this._attributes && (this._attributes[t] = void 0);
  } }, _numattrs: { get: function() {
    return this._attrKeys.length;
  } }, _attr: { value: function(e) {
    return this._attrsByLName[this._attrKeys[e]];
  } }, id: on.property({ name: "id" }), className: on.property({ name: "class" }), classList: { get: function() {
    var e = this;
    if (this._classList)
      return this._classList;
    var t = new Fu(function() {
      return e.className || "";
    }, function(r) {
      e.className = r;
    });
    return this._classList = t, t;
  }, set: function(e) {
    this.className = e;
  } }, matches: { value: function(e) {
    return Na.matches(this, e);
  } }, closest: { value: function(e) {
    var t = this;
    do {
      if (t.matches && t.matches(e))
        return t;
      t = t.parentElement || t.parentNode;
    } while (t !== null && t.nodeType === Ye.ELEMENT_NODE);
    return null;
  } }, querySelector: { value: function(e) {
    return Na(e, this)[0];
  } }, querySelectorAll: { value: function(e) {
    var t = Na(e, this);
    return t.item ? t : new Sa(t);
  } } });
  Object.defineProperties(wt.prototype, Hu);
  Object.defineProperties(wt.prototype, Pu);
  on.registerChangeHandler(wt, "id", function(e, t, r, n) {
    e.rooted && (r && e.ownerDocument.delId(r, e), n && e.ownerDocument.addId(n, e));
  });
  on.registerChangeHandler(wt, "class", function(e, t, r, n) {
    e._classList && e._classList._update();
  });
  function _r(e, t, r, n, l) {
    this.localName = t, this.prefix = r === null || r === "" ? null : "" + r, this.namespaceURI = n === null || n === "" ? null : "" + n, this.data = l, this._setOwnerElement(e);
  }
  _r.prototype = Object.create(Object.prototype, { ownerElement: { get: function() {
    return this._ownerElement;
  } }, _setOwnerElement: { value: function(t) {
    this._ownerElement = t, this.prefix === null && this.namespaceURI === null && t ? this.onchange = t._attributeChangeHandlers[this.localName] : this.onchange = null;
  } }, name: { get: function() {
    return this.prefix ? this.prefix + ":" + this.localName : this.localName;
  } }, specified: { get: function() {
    return true;
  } }, value: { get: function() {
    return this.data;
  }, set: function(e) {
    var t = this.data;
    e = e === void 0 ? "" : e + "", e !== t && (this.data = e, this.ownerElement && (this.onchange && this.onchange(this.ownerElement, this.localName, t, e), this.ownerElement.rooted && this.ownerElement.ownerDocument.mutateAttr(this, t)));
  } }, cloneNode: { value: function(t) {
    return new _r(null, this.localName, this.prefix, this.namespaceURI, this.data);
  } }, nodeType: { get: function() {
    return Ye.ATTRIBUTE_NODE;
  } }, nodeName: { get: function() {
    return this.name;
  } }, nodeValue: { get: function() {
    return this.value;
  }, set: function(e) {
    this.value = e;
  } }, textContent: { get: function() {
    return this.value;
  }, set: function(e) {
    e == null && (e = ""), this.value = e;
  } } });
  wt._Attr = _r;
  function Ca(e) {
    ks.call(this, e);
    for (var t in e._attrsByQName)
      this[t] = e._attrsByQName[t];
    for (var r = 0; r < e._attrKeys.length; r++)
      this[r] = e._attrsByLName[e._attrKeys[r]];
  }
  Ca.prototype = Object.create(ks.prototype, { length: { get: function() {
    return this.element._attrKeys.length;
  }, set: function() {
  } }, item: { value: function(e) {
    return e = e >>> 0, e >= this.length ? null : this.element._attrsByLName[this.element._attrKeys[e]];
  } } });
  global.Symbol && global.Symbol.iterator && (Ca.prototype[global.Symbol.iterator] = function() {
    var e = 0, t = this.length, r = this;
    return { next: function() {
      return e < t ? { value: r.item(e++) } : { done: true };
    } };
  });
  function Cs(e) {
    this.element = e, this.updateCache();
  }
  Cs.prototype = Object.create(Object.prototype, { length: { get: function() {
    return this.updateCache(), this.childrenByNumber.length;
  } }, item: { value: function(t) {
    return this.updateCache(), this.childrenByNumber[t] || null;
  } }, namedItem: { value: function(t) {
    return this.updateCache(), this.childrenByName[t] || null;
  } }, namedItems: { get: function() {
    return this.updateCache(), this.childrenByName;
  } }, updateCache: { value: function() {
    var t = /^(a|applet|area|embed|form|frame|frameset|iframe|img|object)$/;
    if (this.lastModTime !== this.element.lastModTime) {
      this.lastModTime = this.element.lastModTime;
      for (var r = this.childrenByNumber && this.childrenByNumber.length || 0, n = 0; n < r; n++)
        this[n] = void 0;
      this.childrenByNumber = [], this.childrenByName = Object.create(null);
      for (var l = this.element.firstChild; l !== null; l = l.nextSibling)
        if (l.nodeType === Ye.ELEMENT_NODE) {
          this[this.childrenByNumber.length] = l, this.childrenByNumber.push(l);
          var f = l.getAttribute("id");
          f && !this.childrenByName[f] && (this.childrenByName[f] = l);
          var _ = l.getAttribute("name");
          _ && this.element.namespaceURI === tt.HTML && t.test(this.element.localName) && !this.childrenByName[_] && (this.childrenByName[f] = l);
        }
    }
  } } });
  function Aa(e) {
    return function(t) {
      return t.localName === e;
    };
  }
  function Bu(e) {
    var t = ue.toASCIILowerCase(e);
    return t === e ? Aa(e) : function(r) {
      return r.isHTML ? r.localName === t : r.localName === e;
    };
  }
  function Uu(e) {
    return function(t) {
      return t.namespaceURI === e;
    };
  }
  function Vu(e, t) {
    return function(r) {
      return r.namespaceURI === e && r.localName === t;
    };
  }
  function zu(e) {
    return function(t) {
      return e.every(function(r) {
        return t.classList.contains(r);
      });
    };
  }
  function ju(e) {
    return function(t) {
      return t.namespaceURI !== tt.HTML ? false : t.getAttribute("name") === e;
    };
  }
});
var La = O((Vf, Is) => {
  Is.exports = Ms;
  var Ls = we(), Wu = It(), Ds = he(), Rs = Ds.HierarchyRequestError, Gu = Ds.NotFoundError;
  function Ms() {
    Ls.call(this);
  }
  Ms.prototype = Object.create(Ls.prototype, { hasChildNodes: { value: function() {
    return false;
  } }, firstChild: { value: null }, lastChild: { value: null }, insertBefore: { value: function(e, t) {
    if (!e.nodeType)
      throw new TypeError("not a node");
    Rs();
  } }, replaceChild: { value: function(e, t) {
    if (!e.nodeType)
      throw new TypeError("not a node");
    Rs();
  } }, removeChild: { value: function(e) {
    if (!e.nodeType)
      throw new TypeError("not a node");
    Gu();
  } }, removeChildren: { value: function() {
  } }, childNodes: { get: function() {
    return this._childNodes || (this._childNodes = new Wu()), this._childNodes;
  } } });
});
var Er = O((zf, Fs) => {
  Fs.exports = ln;
  var Os = La(), qs = he(), Yu = sn(), $u = wa();
  function ln() {
    Os.call(this);
  }
  ln.prototype = Object.create(Os.prototype, { substringData: { value: function(t, r) {
    if (arguments.length < 2)
      throw new TypeError("Not enough arguments");
    return t = t >>> 0, r = r >>> 0, (t > this.data.length || t < 0 || r < 0) && qs.IndexSizeError(), this.data.substring(t, t + r);
  } }, appendData: { value: function(t) {
    if (arguments.length < 1)
      throw new TypeError("Not enough arguments");
    this.data += String(t);
  } }, insertData: { value: function(t, r) {
    return this.replaceData(t, 0, r);
  } }, deleteData: { value: function(t, r) {
    return this.replaceData(t, r, "");
  } }, replaceData: { value: function(t, r, n) {
    var l = this.data, f = l.length;
    t = t >>> 0, r = r >>> 0, n = String(n), (t > f || t < 0) && qs.IndexSizeError(), t + r > f && (r = f - t);
    var _ = l.substring(0, t), y = l.substring(t + r);
    this.data = _ + n + y;
  } }, isEqual: { value: function(t) {
    return this._data === t._data;
  } }, length: { get: function() {
    return this.data.length;
  } } });
  Object.defineProperties(ln.prototype, Yu);
  Object.defineProperties(ln.prototype, $u);
});
var Ra = O((jf, Us) => {
  Us.exports = Da;
  var Hs = he(), Ps = we(), Bs = Er();
  function Da(e, t) {
    Bs.call(this), this.nodeType = Ps.TEXT_NODE, this.ownerDocument = e, this._data = t, this._index = void 0;
  }
  var un = { get: function() {
    return this._data;
  }, set: function(e) {
    e == null ? e = "" : e = String(e), e !== this._data && (this._data = e, this.rooted && this.ownerDocument.mutateValue(this), this.parentNode && this.parentNode._textchangehook && this.parentNode._textchangehook(this));
  } };
  Da.prototype = Object.create(Bs.prototype, { nodeName: { value: "#text" }, nodeValue: un, textContent: un, data: { get: un.get, set: function(e) {
    un.set.call(this, e === null ? "" : String(e));
  } }, splitText: { value: function(t) {
    (t > this._data.length || t < 0) && Hs.IndexSizeError();
    var r = this._data.substring(t), n = this.ownerDocument.createTextNode(r);
    this.data = this.data.substring(0, t);
    var l = this.parentNode;
    return l !== null && l.insertBefore(n, this.nextSibling), n;
  } }, wholeText: { get: function() {
    for (var t = this.textContent, r = this.nextSibling; r && r.nodeType === Ps.TEXT_NODE; r = r.nextSibling)
      t += r.textContent;
    return t;
  } }, replaceWholeText: { value: Hs.nyi }, clone: { value: function() {
    return new Da(this.ownerDocument, this._data);
  } } });
});
var Ia = O((Wf, zs) => {
  zs.exports = Ma;
  var Ku = we(), Vs = Er();
  function Ma(e, t) {
    Vs.call(this), this.nodeType = Ku.COMMENT_NODE, this.ownerDocument = e, this._data = t;
  }
  var fn = { get: function() {
    return this._data;
  }, set: function(e) {
    e == null ? e = "" : e = String(e), this._data = e, this.rooted && this.ownerDocument.mutateValue(this);
  } };
  Ma.prototype = Object.create(Vs.prototype, { nodeName: { value: "#comment" }, nodeValue: fn, textContent: fn, data: { get: fn.get, set: function(e) {
    fn.set.call(this, e === null ? "" : String(e));
  } }, clone: { value: function() {
    return new Ma(this.ownerDocument, this._data);
  } } });
});
var Fa = O((Gf, Gs) => {
  Gs.exports = qa;
  var Xu = we(), Qu = It(), js = Jr(), Oa = Xt(), Zu = an(), Ws = he();
  function qa(e) {
    js.call(this), this.nodeType = Xu.DOCUMENT_FRAGMENT_NODE, this.ownerDocument = e;
  }
  qa.prototype = Object.create(js.prototype, { nodeName: { value: "#document-fragment" }, nodeValue: { get: function() {
    return null;
  }, set: function() {
  } }, textContent: Object.getOwnPropertyDescriptor(Oa.prototype, "textContent"), querySelector: { value: function(e) {
    var t = this.querySelectorAll(e);
    return t.length ? t[0] : null;
  } }, querySelectorAll: { value: function(e) {
    var t = Object.create(this);
    t.isHTML = true, t.getElementsByTagName = Oa.prototype.getElementsByTagName, t.nextElement = Object.getOwnPropertyDescriptor(Oa.prototype, "firstElementChild").get;
    var r = Zu(e, t);
    return r.item ? r : new Qu(r);
  } }, clone: { value: function() {
    return new qa(this.ownerDocument);
  } }, isEqual: { value: function(t) {
    return true;
  } }, innerHTML: { get: function() {
    return this.serialize();
  }, set: Ws.nyi }, outerHTML: { get: function() {
    return this.serialize();
  }, set: Ws.nyi } });
});
var Pa = O((Yf, $s) => {
  $s.exports = Ha;
  var Ju = we(), Ys = Er();
  function Ha(e, t, r) {
    Ys.call(this), this.nodeType = Ju.PROCESSING_INSTRUCTION_NODE, this.ownerDocument = e, this.target = t, this._data = r;
  }
  var dn = { get: function() {
    return this._data;
  }, set: function(e) {
    e == null ? e = "" : e = String(e), this._data = e, this.rooted && this.ownerDocument.mutateValue(this);
  } };
  Ha.prototype = Object.create(Ys.prototype, { nodeName: { get: function() {
    return this.target;
  } }, nodeValue: dn, textContent: dn, data: { get: dn.get, set: function(e) {
    dn.set.call(this, e === null ? "" : String(e));
  } }, clone: { value: function() {
    return new Ha(this.ownerDocument, this.target, this._data);
  } }, isEqual: { value: function(t) {
    return this.target === t.target && this._data === t._data;
  } } });
});
var vr = O(($f, Ks) => {
  var Ba = { FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3, SHOW_ALL: 4294967295, SHOW_ELEMENT: 1, SHOW_ATTRIBUTE: 2, SHOW_TEXT: 4, SHOW_CDATA_SECTION: 8, SHOW_ENTITY_REFERENCE: 16, SHOW_ENTITY: 32, SHOW_PROCESSING_INSTRUCTION: 64, SHOW_COMMENT: 128, SHOW_DOCUMENT: 256, SHOW_DOCUMENT_TYPE: 512, SHOW_DOCUMENT_FRAGMENT: 1024, SHOW_NOTATION: 2048 };
  Ks.exports = Ba.constructor = Ba.prototype = Ba;
});
var Va = O((Xf, Qs) => {
  Qs.exports = { nextSkippingChildren: e0, nextAncestorSibling: Ua, next: t0, previous: r0, deepLastChild: Xs };
  function e0(e, t) {
    return e === t ? null : e.nextSibling !== null ? e.nextSibling : Ua(e, t);
  }
  function Ua(e, t) {
    for (e = e.parentNode; e !== null; e = e.parentNode) {
      if (e === t)
        return null;
      if (e.nextSibling !== null)
        return e.nextSibling;
    }
    return null;
  }
  function t0(e, t) {
    var r;
    return r = e.firstChild, r !== null ? r : e === t ? null : (r = e.nextSibling, r !== null ? r : Ua(e, t));
  }
  function Xs(e) {
    for (; e.lastChild; )
      e = e.lastChild;
    return e;
  }
  function r0(e, t) {
    var r;
    return r = e.previousSibling, r !== null ? Xs(r) : (r = e.parentNode, r === t ? null : r);
  }
});
var ao = O((Qf, no) => {
  no.exports = ro;
  var n0 = we(), Te = vr(), Zs = Va(), Js = he(), za = { first: "firstChild", last: "lastChild", next: "firstChild", previous: "lastChild" }, ja = { first: "nextSibling", last: "previousSibling", next: "nextSibling", previous: "previousSibling" };
  function eo(e, t) {
    var r, n, l, f, _;
    for (n = e._currentNode[za[t]]; n !== null; ) {
      if (f = e._internalFilter(n), f === Te.FILTER_ACCEPT)
        return e._currentNode = n, n;
      if (f === Te.FILTER_SKIP && (r = n[za[t]], r !== null)) {
        n = r;
        continue;
      }
      for (; n !== null; ) {
        if (_ = n[ja[t]], _ !== null) {
          n = _;
          break;
        }
        if (l = n.parentNode, l === null || l === e.root || l === e._currentNode)
          return null;
        n = l;
      }
    }
    return null;
  }
  function to(e, t) {
    var r, n, l;
    if (r = e._currentNode, r === e.root)
      return null;
    for (; ; ) {
      for (l = r[ja[t]]; l !== null; ) {
        if (r = l, n = e._internalFilter(r), n === Te.FILTER_ACCEPT)
          return e._currentNode = r, r;
        l = r[za[t]], (n === Te.FILTER_REJECT || l === null) && (l = r[ja[t]]);
      }
      if (r = r.parentNode, r === null || r === e.root || e._internalFilter(r) === Te.FILTER_ACCEPT)
        return null;
    }
  }
  function ro(e, t, r) {
    (!e || !e.nodeType) && Js.NotSupportedError(), this._root = e, this._whatToShow = Number(t) || 0, this._filter = r || null, this._active = false, this._currentNode = e;
  }
  Object.defineProperties(ro.prototype, { root: { get: function() {
    return this._root;
  } }, whatToShow: { get: function() {
    return this._whatToShow;
  } }, filter: { get: function() {
    return this._filter;
  } }, currentNode: { get: function() {
    return this._currentNode;
  }, set: function(t) {
    if (!(t instanceof n0))
      throw new TypeError("Not a Node");
    this._currentNode = t;
  } }, _internalFilter: { value: function(t) {
    var r, n;
    if (this._active && Js.InvalidStateError(), !(1 << t.nodeType - 1 & this._whatToShow))
      return Te.FILTER_SKIP;
    if (n = this._filter, n === null)
      r = Te.FILTER_ACCEPT;
    else {
      this._active = true;
      try {
        typeof n == "function" ? r = n(t) : r = n.acceptNode(t);
      } finally {
        this._active = false;
      }
    }
    return +r;
  } }, parentNode: { value: function() {
    for (var t = this._currentNode; t !== this.root; ) {
      if (t = t.parentNode, t === null)
        return null;
      if (this._internalFilter(t) === Te.FILTER_ACCEPT)
        return this._currentNode = t, t;
    }
    return null;
  } }, firstChild: { value: function() {
    return eo(this, "first");
  } }, lastChild: { value: function() {
    return eo(this, "last");
  } }, previousSibling: { value: function() {
    return to(this, "previous");
  } }, nextSibling: { value: function() {
    return to(this, "next");
  } }, previousNode: { value: function() {
    var t, r, n, l;
    for (t = this._currentNode; t !== this._root; ) {
      for (n = t.previousSibling; n; n = t.previousSibling)
        if (t = n, r = this._internalFilter(t), r !== Te.FILTER_REJECT) {
          for (l = t.lastChild; l && (t = l, r = this._internalFilter(t), r !== Te.FILTER_REJECT); l = t.lastChild)
            ;
          if (r === Te.FILTER_ACCEPT)
            return this._currentNode = t, t;
        }
      if (t === this.root || t.parentNode === null)
        return null;
      if (t = t.parentNode, this._internalFilter(t) === Te.FILTER_ACCEPT)
        return this._currentNode = t, t;
    }
    return null;
  } }, nextNode: { value: function() {
    var t, r, n, l;
    t = this._currentNode, r = Te.FILTER_ACCEPT;
    e:
      for (; ; ) {
        for (n = t.firstChild; n; n = t.firstChild) {
          if (t = n, r = this._internalFilter(t), r === Te.FILTER_ACCEPT)
            return this._currentNode = t, t;
          if (r === Te.FILTER_REJECT)
            break;
        }
        for (l = Zs.nextSkippingChildren(t, this.root); l; l = Zs.nextSkippingChildren(t, this.root)) {
          if (t = l, r = this._internalFilter(t), r === Te.FILTER_ACCEPT)
            return this._currentNode = t, t;
          if (r === Te.FILTER_SKIP)
            continue e;
        }
        return null;
      }
  } }, toString: { value: function() {
    return "[object TreeWalker]";
  } } });
});
var uo = O((Zf, lo) => {
  lo.exports = co;
  var Wa = vr(), Ga = Va(), io = he();
  function a0(e, t, r) {
    return r ? Ga.next(e, t) : e === t ? null : Ga.previous(e, null);
  }
  function so(e, t) {
    for (; t; t = t.parentNode)
      if (e === t)
        return true;
    return false;
  }
  function oo(e, t) {
    var r, n;
    for (r = e._referenceNode, n = e._pointerBeforeReferenceNode; ; ) {
      if (n === t)
        n = !n;
      else if (r = a0(r, e._root, t), r === null)
        return null;
      var l = e._internalFilter(r);
      if (l === Wa.FILTER_ACCEPT)
        break;
    }
    return e._referenceNode = r, e._pointerBeforeReferenceNode = n, r;
  }
  function co(e, t, r) {
    (!e || !e.nodeType) && io.NotSupportedError(), this._root = e, this._referenceNode = e, this._pointerBeforeReferenceNode = true, this._whatToShow = Number(t) || 0, this._filter = r || null, this._active = false, e.doc._attachNodeIterator(this);
  }
  Object.defineProperties(co.prototype, { root: { get: function() {
    return this._root;
  } }, referenceNode: { get: function() {
    return this._referenceNode;
  } }, pointerBeforeReferenceNode: { get: function() {
    return this._pointerBeforeReferenceNode;
  } }, whatToShow: { get: function() {
    return this._whatToShow;
  } }, filter: { get: function() {
    return this._filter;
  } }, _internalFilter: { value: function(t) {
    var r, n;
    if (this._active && io.InvalidStateError(), !(1 << t.nodeType - 1 & this._whatToShow))
      return Wa.FILTER_SKIP;
    if (n = this._filter, n === null)
      r = Wa.FILTER_ACCEPT;
    else {
      this._active = true;
      try {
        typeof n == "function" ? r = n(t) : r = n.acceptNode(t);
      } finally {
        this._active = false;
      }
    }
    return +r;
  } }, _preremove: { value: function(t) {
    if (!so(t, this._root) && !!so(t, this._referenceNode)) {
      if (this._pointerBeforeReferenceNode) {
        for (var r = t; r.lastChild; )
          r = r.lastChild;
        if (r = Ga.next(r, this.root), r) {
          this._referenceNode = r;
          return;
        }
        this._pointerBeforeReferenceNode = false;
      }
      if (t.previousSibling === null)
        this._referenceNode = t.parentNode;
      else {
        this._referenceNode = t.previousSibling;
        var n;
        for (n = this._referenceNode.lastChild; n; n = this._referenceNode.lastChild)
          this._referenceNode = n;
      }
    }
  } }, nextNode: { value: function() {
    return oo(this, true);
  } }, previousNode: { value: function() {
    return oo(this, false);
  } }, detach: { value: function() {
  } }, toString: { value: function() {
    return "[object NodeIterator]";
  } } });
});
var hn = O((Jf, fo) => {
  fo.exports = ke;
  function ke(e) {
    if (!e)
      return Object.create(ke.prototype);
    this.url = e.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, "");
    var t = ke.pattern.exec(this.url);
    if (t) {
      if (t[2] && (this.scheme = t[2]), t[4]) {
        var r = t[4].match(ke.userinfoPattern);
        if (r && (this.username = r[1], this.password = r[3], t[4] = t[4].substring(r[0].length)), t[4].match(ke.portPattern)) {
          var n = t[4].lastIndexOf(":");
          this.host = t[4].substring(0, n), this.port = t[4].substring(n + 1);
        } else
          this.host = t[4];
      }
      t[5] && (this.path = t[5]), t[6] && (this.query = t[7]), t[8] && (this.fragment = t[9]);
    }
  }
  ke.pattern = /^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/;
  ke.userinfoPattern = /^([^@:]*)(:([^@]*))?@/;
  ke.portPattern = /:\d+$/;
  ke.authorityPattern = /^[^:\/?#]+:\/\//;
  ke.hierarchyPattern = /^[^:\/?#]+:\//;
  ke.percentEncode = function(t) {
    var r = t.charCodeAt(0);
    if (r < 256)
      return "%" + r.toString(16);
    throw Error("can't percent-encode codepoints > 255 yet");
  };
  ke.prototype = { constructor: ke, isAbsolute: function() {
    return !!this.scheme;
  }, isAuthorityBased: function() {
    return ke.authorityPattern.test(this.url);
  }, isHierarchical: function() {
    return ke.hierarchyPattern.test(this.url);
  }, toString: function() {
    var e = "";
    return this.scheme !== void 0 && (e += this.scheme + ":"), this.isAbsolute() && (e += "//", (this.username || this.password) && (e += this.username || "", this.password && (e += ":" + this.password), e += "@"), this.host && (e += this.host)), this.port !== void 0 && (e += ":" + this.port), this.path !== void 0 && (e += this.path), this.query !== void 0 && (e += "?" + this.query), this.fragment !== void 0 && (e += "#" + this.fragment), e;
  }, resolve: function(e) {
    var t = this, r = new ke(e), n = new ke();
    return r.scheme !== void 0 ? (n.scheme = r.scheme, n.username = r.username, n.password = r.password, n.host = r.host, n.port = r.port, n.path = f(r.path), n.query = r.query) : (n.scheme = t.scheme, r.host !== void 0 ? (n.username = r.username, n.password = r.password, n.host = r.host, n.port = r.port, n.path = f(r.path), n.query = r.query) : (n.username = t.username, n.password = t.password, n.host = t.host, n.port = t.port, r.path ? (r.path.charAt(0) === "/" ? n.path = f(r.path) : (n.path = l(t.path, r.path), n.path = f(n.path)), n.query = r.query) : (n.path = t.path, r.query !== void 0 ? n.query = r.query : n.query = t.query))), n.fragment = r.fragment, n.toString();
    function l(_, y) {
      if (t.host !== void 0 && !t.path)
        return "/" + y;
      var T = _.lastIndexOf("/");
      return T === -1 ? y : _.substring(0, T + 1) + y;
    }
    function f(_) {
      if (!_)
        return _;
      for (var y = ""; _.length > 0; ) {
        if (_ === "." || _ === "..") {
          _ = "";
          break;
        }
        var T = _.substring(0, 2), S = _.substring(0, 3), D = _.substring(0, 4);
        if (S === "../")
          _ = _.substring(3);
        else if (T === "./")
          _ = _.substring(2);
        else if (S === "/./")
          _ = "/" + _.substring(3);
        else if (T === "/." && _.length === 2)
          _ = "/";
        else if (D === "/../" || S === "/.." && _.length === 3)
          _ = "/" + _.substring(4), y = y.replace(/\/?[^\/]*$/, "");
        else {
          var ae = _.match(/(\/?([^\/]*))/)[0];
          y += ae, _ = _.substring(ae.length);
        }
      }
      return y;
    }
  } };
});
var po = O((ed, xo) => {
  xo.exports = Ya;
  var ho = zt();
  function Ya(e, t) {
    ho.call(this, e, t);
  }
  Ya.prototype = Object.create(ho.prototype, { constructor: { value: Ya } });
});
var $a = O((td, mo) => {
  mo.exports = { Event: zt(), UIEvent: Kn(), MouseEvent: Qn(), CustomEvent: po() };
});
var bo = O((go) => {
  var ct = Object.create(null);
  (function() {
    function e() {
      this._listeners = Object.create(null);
    }
    e.prototype = { constructor: e, addListener: function(f, _) {
      this._listeners[f] || (this._listeners[f] = []), this._listeners[f].push(_);
    }, fire: function(f) {
      if (typeof f == "string" && (f = { type: f }), typeof f.target != "undefined" && (f.target = this), typeof f.type == "undefined")
        throw new Error("Event object missing 'type' property.");
      if (this._listeners[f.type])
        for (var _ = this._listeners[f.type].concat(), y = 0, T = _.length; y < T; y++)
          _[y].call(this, f);
    }, removeListener: function(f, _) {
      if (this._listeners[f]) {
        for (var y = this._listeners[f], T = 0, S = y.length; T < S; T++)
          if (y[T] === _) {
            y.splice(T, 1);
            break;
          }
      }
    } };
    function t(f) {
      this._input = f.replace(/(\r|\n){1,2}/g, `
`), this._line = 1, this._col = 1, this._cursor = 0;
    }
    t.prototype = { constructor: t, getCol: function() {
      return this._col;
    }, getLine: function() {
      return this._line;
    }, eof: function() {
      return this._cursor === this._input.length;
    }, peek: function(f) {
      var _ = null;
      return f = typeof f == "undefined" ? 1 : f, this._cursor < this._input.length && (_ = this._input.charAt(this._cursor + f - 1)), _;
    }, read: function() {
      var f = null;
      return this._cursor < this._input.length && (this._input.charAt(this._cursor) === `
` ? (this._line++, this._col = 1) : this._col++, f = this._input.charAt(this._cursor++)), f;
    }, mark: function() {
      this._bookmark = { cursor: this._cursor, line: this._line, col: this._col };
    }, reset: function() {
      this._bookmark && (this._cursor = this._bookmark.cursor, this._line = this._bookmark.line, this._col = this._bookmark.col, delete this._bookmark);
    }, readTo: function(f) {
      for (var _ = "", y; _.length < f.length || _.lastIndexOf(f) !== _.length - f.length; )
        if (y = this.read(), y)
          _ += y;
        else
          throw new Error('Expected "' + f + '" at line ' + this._line + ", col " + this._col + ".");
      return _;
    }, readWhile: function(f) {
      for (var _ = "", y = this.read(); y !== null && f(y); )
        _ += y, y = this.read();
      return _;
    }, readMatch: function(f) {
      var _ = this._input.substring(this._cursor), y = null;
      return typeof f == "string" ? _.indexOf(f) === 0 && (y = this.readCount(f.length)) : f instanceof RegExp && f.test(_) && (y = this.readCount(RegExp.lastMatch.length)), y;
    }, readCount: function(f) {
      for (var _ = ""; f--; )
        _ += this.read();
      return _;
    } };
    function r(f, _, y) {
      Error.call(this), this.name = this.constructor.name, this.col = y, this.line = _, this.message = f;
    }
    r.prototype = Object.create(Error.prototype), r.prototype.constructor = r;
    function n(f, _, y, T) {
      this.col = y, this.line = _, this.text = f, this.type = T;
    }
    n.fromToken = function(f) {
      return new n(f.value, f.startLine, f.startCol);
    }, n.prototype = { constructor: n, valueOf: function() {
      return this.toString();
    }, toString: function() {
      return this.text;
    } };
    function l(f, _) {
      this._reader = f ? new t(f.toString()) : null, this._token = null, this._tokenData = _, this._lt = [], this._ltIndex = 0, this._ltIndexCache = [];
    }
    l.createTokenData = function(f) {
      var _ = [], y = Object.create(null), T = f.concat([]), S = 0, D = T.length + 1;
      for (T.UNKNOWN = -1, T.unshift({ name: "EOF" }); S < D; S++)
        _.push(T[S].name), T[T[S].name] = S, T[S].text && (y[T[S].text] = S);
      return T.name = function(ae) {
        return _[ae];
      }, T.type = function(ae) {
        return y[ae];
      }, T;
    }, l.prototype = { constructor: l, match: function(f, _) {
      f instanceof Array || (f = [f]);
      for (var y = this.get(_), T = 0, S = f.length; T < S; )
        if (y === f[T++])
          return true;
      return this.unget(), false;
    }, mustMatch: function(f, _) {
      var y;
      if (f instanceof Array || (f = [f]), !this.match.apply(this, arguments))
        throw y = this.LT(1), new r("Expected " + this._tokenData[f[0]].name + " at line " + y.startLine + ", col " + y.startCol + ".", y.startLine, y.startCol);
    }, advance: function(f, _) {
      for (; this.LA(0) !== 0 && !this.match(f, _); )
        this.get();
      return this.LA(0);
    }, get: function(f) {
      var _ = this._tokenData, y = 0, T, S;
      if (this._lt.length && this._ltIndex >= 0 && this._ltIndex < this._lt.length) {
        for (y++, this._token = this._lt[this._ltIndex++], S = _[this._token.type]; S.channel !== void 0 && f !== S.channel && this._ltIndex < this._lt.length; )
          this._token = this._lt[this._ltIndex++], S = _[this._token.type], y++;
        if ((S.channel === void 0 || f === S.channel) && this._ltIndex <= this._lt.length)
          return this._ltIndexCache.push(y), this._token.type;
      }
      return T = this._getToken(), T.type > -1 && !_[T.type].hide && (T.channel = _[T.type].channel, this._token = T, this._lt.push(T), this._ltIndexCache.push(this._lt.length - this._ltIndex + y), this._lt.length > 5 && this._lt.shift(), this._ltIndexCache.length > 5 && this._ltIndexCache.shift(), this._ltIndex = this._lt.length), S = _[T.type], S && (S.hide || S.channel !== void 0 && f !== S.channel) ? this.get(f) : T.type;
    }, LA: function(f) {
      var _ = f, y;
      if (f > 0) {
        if (f > 5)
          throw new Error("Too much lookahead.");
        for (; _; )
          y = this.get(), _--;
        for (; _ < f; )
          this.unget(), _++;
      } else if (f < 0)
        if (this._lt[this._ltIndex + f])
          y = this._lt[this._ltIndex + f].type;
        else
          throw new Error("Too much lookbehind.");
      else
        y = this._token.type;
      return y;
    }, LT: function(f) {
      return this.LA(f), this._lt[this._ltIndex + f - 1];
    }, peek: function() {
      return this.LA(1);
    }, token: function() {
      return this._token;
    }, tokenName: function(f) {
      return f < 0 || f > this._tokenData.length ? "UNKNOWN_TOKEN" : this._tokenData[f].name;
    }, tokenType: function(f) {
      return this._tokenData[f] || -1;
    }, unget: function() {
      if (this._ltIndexCache.length)
        this._ltIndex -= this._ltIndexCache.pop(), this._token = this._lt[this._ltIndex - 1];
      else
        throw new Error("Too much lookahead.");
    } }, ct.util = { __proto__: null, StringReader: t, SyntaxError: r, SyntaxUnit: n, EventTarget: e, TokenStreamBase: l };
  })();
  (function() {
    var e = ct.util.EventTarget, t = ct.util.TokenStreamBase; ct.util.StringReader; var n = ct.util.SyntaxError, l = ct.util.SyntaxUnit, f = { __proto__: null, aliceblue: "#f0f8ff", antiquewhite: "#faebd7", aqua: "#00ffff", aquamarine: "#7fffd4", azure: "#f0ffff", beige: "#f5f5dc", bisque: "#ffe4c4", black: "#000000", blanchedalmond: "#ffebcd", blue: "#0000ff", blueviolet: "#8a2be2", brown: "#a52a2a", burlywood: "#deb887", cadetblue: "#5f9ea0", chartreuse: "#7fff00", chocolate: "#d2691e", coral: "#ff7f50", cornflowerblue: "#6495ed", cornsilk: "#fff8dc", crimson: "#dc143c", cyan: "#00ffff", darkblue: "#00008b", darkcyan: "#008b8b", darkgoldenrod: "#b8860b", darkgray: "#a9a9a9", darkgrey: "#a9a9a9", darkgreen: "#006400", darkkhaki: "#bdb76b", darkmagenta: "#8b008b", darkolivegreen: "#556b2f", darkorange: "#ff8c00", darkorchid: "#9932cc", darkred: "#8b0000", darksalmon: "#e9967a", darkseagreen: "#8fbc8f", darkslateblue: "#483d8b", darkslategray: "#2f4f4f", darkslategrey: "#2f4f4f", darkturquoise: "#00ced1", darkviolet: "#9400d3", deeppink: "#ff1493", deepskyblue: "#00bfff", dimgray: "#696969", dimgrey: "#696969", dodgerblue: "#1e90ff", firebrick: "#b22222", floralwhite: "#fffaf0", forestgreen: "#228b22", fuchsia: "#ff00ff", gainsboro: "#dcdcdc", ghostwhite: "#f8f8ff", gold: "#ffd700", goldenrod: "#daa520", gray: "#808080", grey: "#808080", green: "#008000", greenyellow: "#adff2f", honeydew: "#f0fff0", hotpink: "#ff69b4", indianred: "#cd5c5c", indigo: "#4b0082", ivory: "#fffff0", khaki: "#f0e68c", lavender: "#e6e6fa", lavenderblush: "#fff0f5", lawngreen: "#7cfc00", lemonchiffon: "#fffacd", lightblue: "#add8e6", lightcoral: "#f08080", lightcyan: "#e0ffff", lightgoldenrodyellow: "#fafad2", lightgray: "#d3d3d3", lightgrey: "#d3d3d3", lightgreen: "#90ee90", lightpink: "#ffb6c1", lightsalmon: "#ffa07a", lightseagreen: "#20b2aa", lightskyblue: "#87cefa", lightslategray: "#778899", lightslategrey: "#778899", lightsteelblue: "#b0c4de", lightyellow: "#ffffe0", lime: "#00ff00", limegreen: "#32cd32", linen: "#faf0e6", magenta: "#ff00ff", maroon: "#800000", mediumaquamarine: "#66cdaa", mediumblue: "#0000cd", mediumorchid: "#ba55d3", mediumpurple: "#9370d8", mediumseagreen: "#3cb371", mediumslateblue: "#7b68ee", mediumspringgreen: "#00fa9a", mediumturquoise: "#48d1cc", mediumvioletred: "#c71585", midnightblue: "#191970", mintcream: "#f5fffa", mistyrose: "#ffe4e1", moccasin: "#ffe4b5", navajowhite: "#ffdead", navy: "#000080", oldlace: "#fdf5e6", olive: "#808000", olivedrab: "#6b8e23", orange: "#ffa500", orangered: "#ff4500", orchid: "#da70d6", palegoldenrod: "#eee8aa", palegreen: "#98fb98", paleturquoise: "#afeeee", palevioletred: "#d87093", papayawhip: "#ffefd5", peachpuff: "#ffdab9", peru: "#cd853f", pink: "#ffc0cb", plum: "#dda0dd", powderblue: "#b0e0e6", purple: "#800080", red: "#ff0000", rosybrown: "#bc8f8f", royalblue: "#4169e1", saddlebrown: "#8b4513", salmon: "#fa8072", sandybrown: "#f4a460", seagreen: "#2e8b57", seashell: "#fff5ee", sienna: "#a0522d", silver: "#c0c0c0", skyblue: "#87ceeb", slateblue: "#6a5acd", slategray: "#708090", slategrey: "#708090", snow: "#fffafa", springgreen: "#00ff7f", steelblue: "#4682b4", tan: "#d2b48c", teal: "#008080", thistle: "#d8bfd8", tomato: "#ff6347", turquoise: "#40e0d0", violet: "#ee82ee", wheat: "#f5deb3", white: "#ffffff", whitesmoke: "#f5f5f5", yellow: "#ffff00", yellowgreen: "#9acd32", currentColor: "The value of the 'color' property.", activeBorder: "Active window border.", activecaption: "Active window caption.", appworkspace: "Background color of multiple document interface.", background: "Desktop background.", buttonface: "The face background color for 3-D elements that appear 3-D due to one layer of surrounding border.", buttonhighlight: "The color of the border facing the light source for 3-D elements that appear 3-D due to one layer of surrounding border.", buttonshadow: "The color of the border away from the light source for 3-D elements that appear 3-D due to one layer of surrounding border.", buttontext: "Text on push buttons.", captiontext: "Text in caption, size box, and scrollbar arrow box.", graytext: "Grayed (disabled) text. This color is set to #000 if the current display driver does not support a solid gray color.", greytext: "Greyed (disabled) text. This color is set to #000 if the current display driver does not support a solid grey color.", highlight: "Item(s) selected in a control.", highlighttext: "Text of item(s) selected in a control.", inactiveborder: "Inactive window border.", inactivecaption: "Inactive window caption.", inactivecaptiontext: "Color of text in an inactive caption.", infobackground: "Background color for tooltip controls.", infotext: "Text color for tooltip controls.", menu: "Menu background.", menutext: "Text in menus.", scrollbar: "Scroll bar gray area.", threeddarkshadow: "The color of the darker (generally outer) of the two borders away from the light source for 3-D elements that appear 3-D due to two concentric layers of surrounding border.", threedface: "The face background color for 3-D elements that appear 3-D due to two concentric layers of surrounding border.", threedhighlight: "The color of the lighter (generally outer) of the two borders facing the light source for 3-D elements that appear 3-D due to two concentric layers of surrounding border.", threedlightshadow: "The color of the darker (generally inner) of the two borders facing the light source for 3-D elements that appear 3-D due to two concentric layers of surrounding border.", threedshadow: "The color of the lighter (generally inner) of the two borders away from the light source for 3-D elements that appear 3-D due to two concentric layers of surrounding border.", window: "Window background.", windowframe: "Window frame.", windowtext: "Text in windows." };
    function _(c, h, m) {
      l.call(this, c, h, m, S.COMBINATOR_TYPE), this.type = "unknown", /^\s+$/.test(c) ? this.type = "descendant" : c === ">" ? this.type = "child" : c === "+" ? this.type = "adjacent-sibling" : c === "~" && (this.type = "sibling");
    }
    _.prototype = new l(), _.prototype.constructor = _;
    function y(c, h) {
      l.call(this, "(" + c + (h !== null ? ":" + h : "") + ")", c.startLine, c.startCol, S.MEDIA_FEATURE_TYPE), this.name = c, this.value = h;
    }
    y.prototype = new l(), y.prototype.constructor = y;
    function T(c, h, m, a, o) {
      l.call(this, (c ? c + " " : "") + (h || "") + (h && m.length > 0 ? " and " : "") + m.join(" and "), a, o, S.MEDIA_QUERY_TYPE), this.modifier = c, this.mediaType = h, this.features = m;
    }
    T.prototype = new l(), T.prototype.constructor = T;
    function S(c) {
      e.call(this), this.options = c || {}, this._tokenStream = null;
    }
    S.DEFAULT_TYPE = 0, S.COMBINATOR_TYPE = 1, S.MEDIA_FEATURE_TYPE = 2, S.MEDIA_QUERY_TYPE = 3, S.PROPERTY_NAME_TYPE = 4, S.PROPERTY_VALUE_TYPE = 5, S.PROPERTY_VALUE_PART_TYPE = 6, S.SELECTOR_TYPE = 7, S.SELECTOR_PART_TYPE = 8, S.SELECTOR_SUB_PART_TYPE = 9, S.prototype = function() {
      var c = new e(), h, m = { __proto__: null, constructor: S, DEFAULT_TYPE: 0, COMBINATOR_TYPE: 1, MEDIA_FEATURE_TYPE: 2, MEDIA_QUERY_TYPE: 3, PROPERTY_NAME_TYPE: 4, PROPERTY_VALUE_TYPE: 5, PROPERTY_VALUE_PART_TYPE: 6, SELECTOR_TYPE: 7, SELECTOR_PART_TYPE: 8, SELECTOR_SUB_PART_TYPE: 9, _stylesheet: function() {
        var a = this._tokenStream, o, u, b;
        for (this.fire("startstylesheet"), this._charset(), this._skipCruft(); a.peek() === d.IMPORT_SYM; )
          this._import(), this._skipCruft();
        for (; a.peek() === d.NAMESPACE_SYM; )
          this._namespace(), this._skipCruft();
        for (b = a.peek(); b > d.EOF; ) {
          try {
            switch (b) {
              case d.MEDIA_SYM:
                this._media(), this._skipCruft();
                break;
              case d.PAGE_SYM:
                this._page(), this._skipCruft();
                break;
              case d.FONT_FACE_SYM:
                this._font_face(), this._skipCruft();
                break;
              case d.KEYFRAMES_SYM:
                this._keyframes(), this._skipCruft();
                break;
              case d.VIEWPORT_SYM:
                this._viewport(), this._skipCruft();
                break;
              case d.DOCUMENT_SYM:
                this._document(), this._skipCruft();
                break;
              case d.UNKNOWN_SYM:
                if (a.get(), this.options.strict)
                  throw new n("Unknown @ rule.", a.LT(0).startLine, a.LT(0).startCol);
                for (this.fire({ type: "error", error: null, message: "Unknown @ rule: " + a.LT(0).value + ".", line: a.LT(0).startLine, col: a.LT(0).startCol }), o = 0; a.advance([d.LBRACE, d.RBRACE]) === d.LBRACE; )
                  o++;
                for (; o; )
                  a.advance([d.RBRACE]), o--;
                break;
              case d.S:
                this._readWhitespace();
                break;
              default:
                if (!this._ruleset())
                  switch (b) {
                    case d.CHARSET_SYM:
                      throw u = a.LT(1), this._charset(false), new n("@charset not allowed here.", u.startLine, u.startCol);
                    case d.IMPORT_SYM:
                      throw u = a.LT(1), this._import(false), new n("@import not allowed here.", u.startLine, u.startCol);
                    case d.NAMESPACE_SYM:
                      throw u = a.LT(1), this._namespace(false), new n("@namespace not allowed here.", u.startLine, u.startCol);
                    default:
                      a.get(), this._unexpectedToken(a.token());
                  }
            }
          } catch (w) {
            if (w instanceof n && !this.options.strict)
              this.fire({ type: "error", error: w, message: w.message, line: w.line, col: w.col });
            else
              throw w;
          }
          b = a.peek();
        }
        b !== d.EOF && this._unexpectedToken(a.token()), this.fire("endstylesheet");
      }, _charset: function(a) {
        var o = this._tokenStream, u, b, w, I;
        o.match(d.CHARSET_SYM) && (w = o.token().startLine, I = o.token().startCol, this._readWhitespace(), o.mustMatch(d.STRING), b = o.token(), u = b.value, this._readWhitespace(), o.mustMatch(d.SEMICOLON), a !== false && this.fire({ type: "charset", charset: u, line: w, col: I }));
      }, _import: function(a) {
        var o = this._tokenStream, u, b, w = [];
        o.mustMatch(d.IMPORT_SYM), b = o.token(), this._readWhitespace(), o.mustMatch([d.STRING, d.URI]), u = o.token().value.replace(/^(?:url\()?["']?([^"']+?)["']?\)?$/, "$1"), this._readWhitespace(), w = this._media_query_list(), o.mustMatch(d.SEMICOLON), this._readWhitespace(), a !== false && this.fire({ type: "import", uri: u, media: w, line: b.startLine, col: b.startCol });
      }, _namespace: function(a) {
        var o = this._tokenStream, u, b, w, I;
        o.mustMatch(d.NAMESPACE_SYM), u = o.token().startLine, b = o.token().startCol, this._readWhitespace(), o.match(d.IDENT) && (w = o.token().value, this._readWhitespace()), o.mustMatch([d.STRING, d.URI]), I = o.token().value.replace(/(?:url\()?["']([^"']+)["']\)?/, "$1"), this._readWhitespace(), o.mustMatch(d.SEMICOLON), this._readWhitespace(), a !== false && this.fire({ type: "namespace", prefix: w, uri: I, line: u, col: b });
      }, _media: function() {
        var a = this._tokenStream, o, u, b;
        for (a.mustMatch(d.MEDIA_SYM), o = a.token().startLine, u = a.token().startCol, this._readWhitespace(), b = this._media_query_list(), a.mustMatch(d.LBRACE), this._readWhitespace(), this.fire({ type: "startmedia", media: b, line: o, col: u }); ; )
          if (a.peek() === d.PAGE_SYM)
            this._page();
          else if (a.peek() === d.FONT_FACE_SYM)
            this._font_face();
          else if (a.peek() === d.VIEWPORT_SYM)
            this._viewport();
          else if (a.peek() === d.DOCUMENT_SYM)
            this._document();
          else if (!this._ruleset())
            break;
        a.mustMatch(d.RBRACE), this._readWhitespace(), this.fire({ type: "endmedia", media: b, line: o, col: u });
      }, _media_query_list: function() {
        var a = this._tokenStream, o = [];
        for (this._readWhitespace(), (a.peek() === d.IDENT || a.peek() === d.LPAREN) && o.push(this._media_query()); a.match(d.COMMA); )
          this._readWhitespace(), o.push(this._media_query());
        return o;
      }, _media_query: function() {
        var a = this._tokenStream, o = null, u = null, b = null, w = [];
        if (a.match(d.IDENT) && (u = a.token().value.toLowerCase(), u !== "only" && u !== "not" ? (a.unget(), u = null) : b = a.token()), this._readWhitespace(), a.peek() === d.IDENT ? (o = this._media_type(), b === null && (b = a.token())) : a.peek() === d.LPAREN && (b === null && (b = a.LT(1)), w.push(this._media_expression())), o === null && w.length === 0)
          return null;
        for (this._readWhitespace(); a.match(d.IDENT); )
          a.token().value.toLowerCase() !== "and" && this._unexpectedToken(a.token()), this._readWhitespace(), w.push(this._media_expression());
        return new T(u, o, w, b.startLine, b.startCol);
      }, _media_type: function() {
        return this._media_feature();
      }, _media_expression: function() {
        var a = this._tokenStream, o = null, u, b = null;
        return a.mustMatch(d.LPAREN), o = this._media_feature(), this._readWhitespace(), a.match(d.COLON) && (this._readWhitespace(), u = a.LT(1), b = this._expression()), a.mustMatch(d.RPAREN), this._readWhitespace(), new y(o, b ? new l(b, u.startLine, u.startCol) : null);
      }, _media_feature: function() {
        var a = this._tokenStream;
        return this._readWhitespace(), a.mustMatch(d.IDENT), l.fromToken(a.token());
      }, _page: function() {
        var a = this._tokenStream, o, u, b = null, w = null;
        a.mustMatch(d.PAGE_SYM), o = a.token().startLine, u = a.token().startCol, this._readWhitespace(), a.match(d.IDENT) && (b = a.token().value, b.toLowerCase() === "auto" && this._unexpectedToken(a.token())), a.peek() === d.COLON && (w = this._pseudo_page()), this._readWhitespace(), this.fire({ type: "startpage", id: b, pseudo: w, line: o, col: u }), this._readDeclarations(true, true), this.fire({ type: "endpage", id: b, pseudo: w, line: o, col: u });
      }, _margin: function() {
        var a = this._tokenStream, o, u, b = this._margin_sym();
        return b ? (o = a.token().startLine, u = a.token().startCol, this.fire({ type: "startpagemargin", margin: b, line: o, col: u }), this._readDeclarations(true), this.fire({ type: "endpagemargin", margin: b, line: o, col: u }), true) : false;
      }, _margin_sym: function() {
        var a = this._tokenStream;
        return a.match([d.TOPLEFTCORNER_SYM, d.TOPLEFT_SYM, d.TOPCENTER_SYM, d.TOPRIGHT_SYM, d.TOPRIGHTCORNER_SYM, d.BOTTOMLEFTCORNER_SYM, d.BOTTOMLEFT_SYM, d.BOTTOMCENTER_SYM, d.BOTTOMRIGHT_SYM, d.BOTTOMRIGHTCORNER_SYM, d.LEFTTOP_SYM, d.LEFTMIDDLE_SYM, d.LEFTBOTTOM_SYM, d.RIGHTTOP_SYM, d.RIGHTMIDDLE_SYM, d.RIGHTBOTTOM_SYM]) ? l.fromToken(a.token()) : null;
      }, _pseudo_page: function() {
        var a = this._tokenStream;
        return a.mustMatch(d.COLON), a.mustMatch(d.IDENT), a.token().value;
      }, _font_face: function() {
        var a = this._tokenStream, o, u;
        a.mustMatch(d.FONT_FACE_SYM), o = a.token().startLine, u = a.token().startCol, this._readWhitespace(), this.fire({ type: "startfontface", line: o, col: u }), this._readDeclarations(true), this.fire({ type: "endfontface", line: o, col: u });
      }, _viewport: function() {
        var a = this._tokenStream, o, u;
        a.mustMatch(d.VIEWPORT_SYM), o = a.token().startLine, u = a.token().startCol, this._readWhitespace(), this.fire({ type: "startviewport", line: o, col: u }), this._readDeclarations(true), this.fire({ type: "endviewport", line: o, col: u });
      }, _document: function() {
        var a = this._tokenStream, o, u = [], b = "";
        for (a.mustMatch(d.DOCUMENT_SYM), o = a.token(), /^@\-([^\-]+)\-/.test(o.value) && (b = RegExp.$1), this._readWhitespace(), u.push(this._document_function()); a.match(d.COMMA); )
          this._readWhitespace(), u.push(this._document_function());
        for (a.mustMatch(d.LBRACE), this._readWhitespace(), this.fire({ type: "startdocument", functions: u, prefix: b, line: o.startLine, col: o.startCol }); ; )
          if (a.peek() === d.PAGE_SYM)
            this._page();
          else if (a.peek() === d.FONT_FACE_SYM)
            this._font_face();
          else if (a.peek() === d.VIEWPORT_SYM)
            this._viewport();
          else if (a.peek() === d.MEDIA_SYM)
            this._media();
          else if (!this._ruleset())
            break;
        a.mustMatch(d.RBRACE), this._readWhitespace(), this.fire({ type: "enddocument", functions: u, prefix: b, line: o.startLine, col: o.startCol });
      }, _document_function: function() {
        var a = this._tokenStream, o;
        return a.match(d.URI) ? (o = a.token().value, this._readWhitespace()) : o = this._function(), o;
      }, _operator: function(a) {
        var o = this._tokenStream, u = null;
        return (o.match([d.SLASH, d.COMMA]) || a && o.match([d.PLUS, d.STAR, d.MINUS])) && (u = o.token(), this._readWhitespace()), u ? re.fromToken(u) : null;
      }, _combinator: function() {
        var a = this._tokenStream, o = null, u;
        return a.match([d.PLUS, d.GREATER, d.TILDE]) && (u = a.token(), o = new _(u.value, u.startLine, u.startCol), this._readWhitespace()), o;
      }, _unary_operator: function() {
        var a = this._tokenStream;
        return a.match([d.MINUS, d.PLUS]) ? a.token().value : null;
      }, _property: function() {
        var a = this._tokenStream, o = null, u = null, b, w, I, L;
        return a.peek() === d.STAR && this.options.starHack && (a.get(), w = a.token(), u = w.value, I = w.startLine, L = w.startCol), a.match(d.IDENT) && (w = a.token(), b = w.value, b.charAt(0) === "_" && this.options.underscoreHack && (u = "_", b = b.substring(1)), o = new ae(b, u, I || w.startLine, L || w.startCol), this._readWhitespace()), o;
      }, _ruleset: function() {
        var a = this._tokenStream, o, u;
        try {
          u = this._selectors_group();
        } catch (b) {
          if (b instanceof n && !this.options.strict) {
            if (this.fire({ type: "error", error: b, message: b.message, line: b.line, col: b.col }), o = a.advance([d.RBRACE]), o !== d.RBRACE)
              throw b;
          } else
            throw b;
          return true;
        }
        return u && (this.fire({ type: "startrule", selectors: u, line: u[0].line, col: u[0].col }), this._readDeclarations(true), this.fire({ type: "endrule", selectors: u, line: u[0].line, col: u[0].col })), u;
      }, _selectors_group: function() {
        var a = this._tokenStream, o = [], u;
        if (u = this._selector(), u !== null)
          for (o.push(u); a.match(d.COMMA); )
            this._readWhitespace(), u = this._selector(), u !== null ? o.push(u) : this._unexpectedToken(a.LT(1));
        return o.length ? o : null;
      }, _selector: function() {
        var a = this._tokenStream, o = [], u = null, b = null, w = null;
        if (u = this._simple_selector_sequence(), u === null)
          return null;
        o.push(u);
        do
          if (b = this._combinator(), b !== null)
            o.push(b), u = this._simple_selector_sequence(), u === null ? this._unexpectedToken(a.LT(1)) : o.push(u);
          else if (this._readWhitespace())
            w = new _(a.token().value, a.token().startLine, a.token().startCol), b = this._combinator(), u = this._simple_selector_sequence(), u === null ? b !== null && this._unexpectedToken(a.LT(1)) : (b !== null ? o.push(b) : o.push(w), o.push(u));
          else
            break;
        while (true);
        return new V(o, o[0].line, o[0].col);
      }, _simple_selector_sequence: function() {
        var a = this._tokenStream, o = null, u = [], b = "", w = [function() {
          return a.match(d.HASH) ? new U(a.token().value, "id", a.token().startLine, a.token().startCol) : null;
        }, this._class, this._attrib, this._pseudo, this._negation], I = 0, L = w.length, oe = null, We, dt;
        for (We = a.LT(1).startLine, dt = a.LT(1).startCol, o = this._type_selector(), o || (o = this._universal()), o !== null && (b += o); a.peek() !== d.S; ) {
          for (; I < L && oe === null; )
            oe = w[I++].call(this);
          if (oe === null) {
            if (b === "")
              return null;
            break;
          } else
            I = 0, u.push(oe), b += oe.toString(), oe = null;
        }
        return b !== "" ? new ve(o, u, b, We, dt) : null;
      }, _type_selector: function() {
        var a = this._tokenStream, o = this._namespace_prefix(), u = this._element_name();
        return u ? (o && (u.text = o + u.text, u.col -= o.length), u) : (o && (a.unget(), o.length > 1 && a.unget()), null);
      }, _class: function() {
        var a = this._tokenStream, o;
        return a.match(d.DOT) ? (a.mustMatch(d.IDENT), o = a.token(), new U("." + o.value, "class", o.startLine, o.startCol - 1)) : null;
      }, _element_name: function() {
        var a = this._tokenStream, o;
        return a.match(d.IDENT) ? (o = a.token(), new U(o.value, "elementName", o.startLine, o.startCol)) : null;
      }, _namespace_prefix: function() {
        var a = this._tokenStream, o = "";
        return (a.LA(1) === d.PIPE || a.LA(2) === d.PIPE) && (a.match([d.IDENT, d.STAR]) && (o += a.token().value), a.mustMatch(d.PIPE), o += "|"), o.length ? o : null;
      }, _universal: function() {
        var a = this._tokenStream, o = "", u;
        return u = this._namespace_prefix(), u && (o += u), a.match(d.STAR) && (o += "*"), o.length ? o : null;
      }, _attrib: function() {
        var a = this._tokenStream, o = null, u, b;
        return a.match(d.LBRACKET) ? (b = a.token(), o = b.value, o += this._readWhitespace(), u = this._namespace_prefix(), u && (o += u), a.mustMatch(d.IDENT), o += a.token().value, o += this._readWhitespace(), a.match([d.PREFIXMATCH, d.SUFFIXMATCH, d.SUBSTRINGMATCH, d.EQUALS, d.INCLUDES, d.DASHMATCH]) && (o += a.token().value, o += this._readWhitespace(), a.mustMatch([d.IDENT, d.STRING]), o += a.token().value, o += this._readWhitespace()), a.mustMatch(d.RBRACKET), new U(o + "]", "attribute", b.startLine, b.startCol)) : null;
      }, _pseudo: function() {
        var a = this._tokenStream, o = null, u = ":", b, w;
        return a.match(d.COLON) && (a.match(d.COLON) && (u += ":"), a.match(d.IDENT) ? (o = a.token().value, b = a.token().startLine, w = a.token().startCol - u.length) : a.peek() === d.FUNCTION && (b = a.LT(1).startLine, w = a.LT(1).startCol - u.length, o = this._functional_pseudo()), o && (o = new U(u + o, "pseudo", b, w))), o;
      }, _functional_pseudo: function() {
        var a = this._tokenStream, o = null;
        return a.match(d.FUNCTION) && (o = a.token().value, o += this._readWhitespace(), o += this._expression(), a.mustMatch(d.RPAREN), o += ")"), o;
      }, _expression: function() {
        for (var a = this._tokenStream, o = ""; a.match([d.PLUS, d.MINUS, d.DIMENSION, d.NUMBER, d.STRING, d.IDENT, d.LENGTH, d.FREQ, d.ANGLE, d.TIME, d.RESOLUTION, d.SLASH]); )
          o += a.token().value, o += this._readWhitespace();
        return o.length ? o : null;
      }, _negation: function() {
        var a = this._tokenStream, o, u, b = "", w, I = null;
        return a.match(d.NOT) && (b = a.token().value, o = a.token().startLine, u = a.token().startCol, b += this._readWhitespace(), w = this._negation_arg(), b += w, b += this._readWhitespace(), a.match(d.RPAREN), b += a.token().value, I = new U(b, "not", o, u), I.args.push(w)), I;
      }, _negation_arg: function() {
        var a = this._tokenStream, o = [this._type_selector, this._universal, function() {
          return a.match(d.HASH) ? new U(a.token().value, "id", a.token().startLine, a.token().startCol) : null;
        }, this._class, this._attrib, this._pseudo], u = null, b = 0, w = o.length, I, L, oe;
        for (I = a.LT(1).startLine, L = a.LT(1).startCol; b < w && u === null; )
          u = o[b].call(this), b++;
        return u === null && this._unexpectedToken(a.LT(1)), u.type === "elementName" ? oe = new ve(u, [], u.toString(), I, L) : oe = new ve(null, [u], u.toString(), I, L), oe;
      }, _declaration: function() {
        var a = this._tokenStream, o = null, u = null, b = null, w = null, I = "";
        if (o = this._property(), o !== null) {
          a.mustMatch(d.COLON), this._readWhitespace(), u = this._expr(), (!u || u.length === 0) && this._unexpectedToken(a.LT(1)), b = this._prio(), I = o.toString(), (this.options.starHack && o.hack === "*" || this.options.underscoreHack && o.hack === "_") && (I = o.text);
          try {
            this._validateProperty(I, u);
          } catch (L) {
            w = L;
          }
          return this.fire({ type: "property", property: o, value: u, important: b, line: o.line, col: o.col, invalid: w }), true;
        } else
          return false;
      }, _prio: function() {
        var a = this._tokenStream, o = a.match(d.IMPORTANT_SYM);
        return this._readWhitespace(), o;
      }, _expr: function(a) {
        var o = [], u = null, b = null;
        if (u = this._term(a), u !== null) {
          o.push(u);
          do {
            if (b = this._operator(a), b && o.push(b), u = this._term(a), u === null)
              break;
            o.push(u);
          } while (true);
        }
        return o.length > 0 ? new ce(o, o[0].line, o[0].col) : null;
      }, _term: function(a) {
        var o = this._tokenStream, u = null, b = null, w = null, I, L, oe;
        return u = this._unary_operator(), u !== null && (L = o.token().startLine, oe = o.token().startCol), o.peek() === d.IE_FUNCTION && this.options.ieFilters ? (b = this._ie_function(), u === null && (L = o.token().startLine, oe = o.token().startCol)) : a && o.match([d.LPAREN, d.LBRACE, d.LBRACKET]) ? (I = o.token(), w = I.endChar, b = I.value + this._expr(a).text, u === null && (L = o.token().startLine, oe = o.token().startCol), o.mustMatch(d.type(w)), b += w, this._readWhitespace()) : o.match([d.NUMBER, d.PERCENTAGE, d.LENGTH, d.ANGLE, d.TIME, d.FREQ, d.STRING, d.IDENT, d.URI, d.UNICODE_RANGE]) ? (b = o.token().value, u === null && (L = o.token().startLine, oe = o.token().startCol), this._readWhitespace()) : (I = this._hexcolor(), I === null ? (u === null && (L = o.LT(1).startLine, oe = o.LT(1).startCol), b === null && (o.LA(3) === d.EQUALS && this.options.ieFilters ? b = this._ie_function() : b = this._function())) : (b = I.value, u === null && (L = I.startLine, oe = I.startCol))), b !== null ? new re(u !== null ? u + b : b, L, oe) : null;
      }, _function: function() {
        var a = this._tokenStream, o = null, u = null, b;
        if (a.match(d.FUNCTION)) {
          if (o = a.token().value, this._readWhitespace(), u = this._expr(true), o += u, this.options.ieFilters && a.peek() === d.EQUALS)
            do
              for (this._readWhitespace() && (o += a.token().value), a.LA(0) === d.COMMA && (o += a.token().value), a.match(d.IDENT), o += a.token().value, a.match(d.EQUALS), o += a.token().value, b = a.peek(); b !== d.COMMA && b !== d.S && b !== d.RPAREN; )
                a.get(), o += a.token().value, b = a.peek();
            while (a.match([d.COMMA, d.S]));
          a.match(d.RPAREN), o += ")", this._readWhitespace();
        }
        return o;
      }, _ie_function: function() {
        var a = this._tokenStream, o = null, u;
        if (a.match([d.IE_FUNCTION, d.FUNCTION])) {
          o = a.token().value;
          do
            for (this._readWhitespace() && (o += a.token().value), a.LA(0) === d.COMMA && (o += a.token().value), a.match(d.IDENT), o += a.token().value, a.match(d.EQUALS), o += a.token().value, u = a.peek(); u !== d.COMMA && u !== d.S && u !== d.RPAREN; )
              a.get(), o += a.token().value, u = a.peek();
          while (a.match([d.COMMA, d.S]));
          a.match(d.RPAREN), o += ")", this._readWhitespace();
        }
        return o;
      }, _hexcolor: function() {
        var a = this._tokenStream, o = null, u;
        if (a.match(d.HASH)) {
          if (o = a.token(), u = o.value, !/#[a-f0-9]{3,6}/i.test(u))
            throw new n("Expected a hex color but found '" + u + "' at line " + o.startLine + ", col " + o.startCol + ".", o.startLine, o.startCol);
          this._readWhitespace();
        }
        return o;
      }, _keyframes: function() {
        var a = this._tokenStream, o, u, b, w = "";
        for (a.mustMatch(d.KEYFRAMES_SYM), o = a.token(), /^@\-([^\-]+)\-/.test(o.value) && (w = RegExp.$1), this._readWhitespace(), b = this._keyframe_name(), this._readWhitespace(), a.mustMatch(d.LBRACE), this.fire({ type: "startkeyframes", name: b, prefix: w, line: o.startLine, col: o.startCol }), this._readWhitespace(), u = a.peek(); u === d.IDENT || u === d.PERCENTAGE; )
          this._keyframe_rule(), this._readWhitespace(), u = a.peek();
        this.fire({ type: "endkeyframes", name: b, prefix: w, line: o.startLine, col: o.startCol }), this._readWhitespace(), a.mustMatch(d.RBRACE);
      }, _keyframe_name: function() {
        var a = this._tokenStream;
        return a.mustMatch([d.IDENT, d.STRING]), l.fromToken(a.token());
      }, _keyframe_rule: function() {
        var a = this._key_list();
        this.fire({ type: "startkeyframerule", keys: a, line: a[0].line, col: a[0].col }), this._readDeclarations(true), this.fire({ type: "endkeyframerule", keys: a, line: a[0].line, col: a[0].col });
      }, _key_list: function() {
        var a = this._tokenStream, o = [];
        for (o.push(this._key()), this._readWhitespace(); a.match(d.COMMA); )
          this._readWhitespace(), o.push(this._key()), this._readWhitespace();
        return o;
      }, _key: function() {
        var a = this._tokenStream, o;
        if (a.match(d.PERCENTAGE))
          return l.fromToken(a.token());
        if (a.match(d.IDENT)) {
          if (o = a.token(), /from|to/i.test(o.value))
            return l.fromToken(o);
          a.unget();
        }
        this._unexpectedToken(a.LT(1));
      }, _skipCruft: function() {
        for (; this._tokenStream.match([d.S, d.CDO, d.CDC]); )
          ;
      }, _readDeclarations: function(a, o) {
        var u = this._tokenStream, b;
        this._readWhitespace(), a && u.mustMatch(d.LBRACE), this._readWhitespace();
        try {
          for (; ; ) {
            if (!(u.match(d.SEMICOLON) || o && this._margin()))
              if (this._declaration()) {
                if (!u.match(d.SEMICOLON))
                  break;
              } else
                break;
            this._readWhitespace();
          }
          u.mustMatch(d.RBRACE), this._readWhitespace();
        } catch (w) {
          if (w instanceof n && !this.options.strict) {
            if (this.fire({ type: "error", error: w, message: w.message, line: w.line, col: w.col }), b = u.advance([d.SEMICOLON, d.RBRACE]), b === d.SEMICOLON)
              this._readDeclarations(false, o);
            else if (b !== d.RBRACE)
              throw w;
          } else
            throw w;
        }
      }, _readWhitespace: function() {
        for (var a = this._tokenStream, o = ""; a.match(d.S); )
          o += a.token().value;
        return o;
      }, _unexpectedToken: function(a) {
        throw new n("Unexpected token '" + a.value + "' at line " + a.startLine + ", col " + a.startCol + ".", a.startLine, a.startCol);
      }, _verifyEnd: function() {
        this._tokenStream.LA(1) !== d.EOF && this._unexpectedToken(this._tokenStream.LT(1));
      }, _validateProperty: function(a, o) {
        Xe.validate(a, o);
      }, parse: function(a) {
        this._tokenStream = new p(a, d), this._stylesheet();
      }, parseStyleSheet: function(a) {
        return this.parse(a);
      }, parseMediaQuery: function(a) {
        this._tokenStream = new p(a, d);
        var o = this._media_query();
        return this._verifyEnd(), o;
      }, parsePropertyValue: function(a) {
        this._tokenStream = new p(a, d), this._readWhitespace();
        var o = this._expr();
        return this._readWhitespace(), this._verifyEnd(), o;
      }, parseRule: function(a) {
        this._tokenStream = new p(a, d), this._readWhitespace();
        var o = this._ruleset();
        return this._readWhitespace(), this._verifyEnd(), o;
      }, parseSelector: function(a) {
        this._tokenStream = new p(a, d), this._readWhitespace();
        var o = this._selector();
        return this._readWhitespace(), this._verifyEnd(), o;
      }, parseStyleAttribute: function(a) {
        a += "}", this._tokenStream = new p(a, d), this._readDeclarations();
      } };
      for (h in m)
        Object.prototype.hasOwnProperty.call(m, h) && (c[h] = m[h]);
      return c;
    }();
    var D = { __proto__: null, "align-items": "flex-start | flex-end | center | baseline | stretch", "align-content": "flex-start | flex-end | center | space-between | space-around | stretch", "align-self": "auto | flex-start | flex-end | center | baseline | stretch", "-webkit-align-items": "flex-start | flex-end | center | baseline | stretch", "-webkit-align-content": "flex-start | flex-end | center | space-between | space-around | stretch", "-webkit-align-self": "auto | flex-start | flex-end | center | baseline | stretch", "alignment-adjust": "auto | baseline | before-edge | text-before-edge | middle | central | after-edge | text-after-edge | ideographic | alphabetic | hanging | mathematical | <percentage> | <length>", "alignment-baseline": "baseline | use-script | before-edge | text-before-edge | after-edge | text-after-edge | central | middle | ideographic | alphabetic | hanging | mathematical", animation: 1, "animation-delay": { multi: "<time>", comma: true }, "animation-direction": { multi: "normal | alternate", comma: true }, "animation-duration": { multi: "<time>", comma: true }, "animation-fill-mode": { multi: "none | forwards | backwards | both", comma: true }, "animation-iteration-count": { multi: "<number> | infinite", comma: true }, "animation-name": { multi: "none | <ident>", comma: true }, "animation-play-state": { multi: "running | paused", comma: true }, "animation-timing-function": 1, "-moz-animation-delay": { multi: "<time>", comma: true }, "-moz-animation-direction": { multi: "normal | alternate", comma: true }, "-moz-animation-duration": { multi: "<time>", comma: true }, "-moz-animation-iteration-count": { multi: "<number> | infinite", comma: true }, "-moz-animation-name": { multi: "none | <ident>", comma: true }, "-moz-animation-play-state": { multi: "running | paused", comma: true }, "-ms-animation-delay": { multi: "<time>", comma: true }, "-ms-animation-direction": { multi: "normal | alternate", comma: true }, "-ms-animation-duration": { multi: "<time>", comma: true }, "-ms-animation-iteration-count": { multi: "<number> | infinite", comma: true }, "-ms-animation-name": { multi: "none | <ident>", comma: true }, "-ms-animation-play-state": { multi: "running | paused", comma: true }, "-webkit-animation-delay": { multi: "<time>", comma: true }, "-webkit-animation-direction": { multi: "normal | alternate", comma: true }, "-webkit-animation-duration": { multi: "<time>", comma: true }, "-webkit-animation-fill-mode": { multi: "none | forwards | backwards | both", comma: true }, "-webkit-animation-iteration-count": { multi: "<number> | infinite", comma: true }, "-webkit-animation-name": { multi: "none | <ident>", comma: true }, "-webkit-animation-play-state": { multi: "running | paused", comma: true }, "-o-animation-delay": { multi: "<time>", comma: true }, "-o-animation-direction": { multi: "normal | alternate", comma: true }, "-o-animation-duration": { multi: "<time>", comma: true }, "-o-animation-iteration-count": { multi: "<number> | infinite", comma: true }, "-o-animation-name": { multi: "none | <ident>", comma: true }, "-o-animation-play-state": { multi: "running | paused", comma: true }, appearance: "icon | window | desktop | workspace | document | tooltip | dialog | button | push-button | hyperlink | radio | radio-button | checkbox | menu-item | tab | menu | menubar | pull-down-menu | pop-up-menu | list-menu | radio-group | checkbox-group | outline-tree | range | field | combo-box | signature | password | normal | none | inherit", azimuth: function(c) {
      var h = "<angle> | leftwards | rightwards | inherit", m = "left-side | far-left | left | center-left | center | center-right | right | far-right | right-side", a = false, o = false, u;
      if (A.isAny(c, h) || (A.isAny(c, "behind") && (a = true, o = true), A.isAny(c, m) && (o = true, a || A.isAny(c, "behind"))), c.hasNext())
        throw u = c.next(), o ? new se("Expected end of value but found '" + u + "'.", u.line, u.col) : new se("Expected (<'azimuth'>) but found '" + u + "'.", u.line, u.col);
    }, "backface-visibility": "visible | hidden", background: 1, "background-attachment": { multi: "<attachment>", comma: true }, "background-clip": { multi: "<box>", comma: true }, "background-color": "<color> | inherit", "background-image": { multi: "<bg-image>", comma: true }, "background-origin": { multi: "<box>", comma: true }, "background-position": { multi: "<bg-position>", comma: true }, "background-repeat": { multi: "<repeat-style>" }, "background-size": { multi: "<bg-size>", comma: true }, "baseline-shift": "baseline | sub | super | <percentage> | <length>", behavior: 1, binding: 1, bleed: "<length>", "bookmark-label": "<content> | <attr> | <string>", "bookmark-level": "none | <integer>", "bookmark-state": "open | closed", "bookmark-target": "none | <uri> | <attr>", border: "<border-width> || <border-style> || <color>", "border-bottom": "<border-width> || <border-style> || <color>", "border-bottom-color": "<color> | inherit", "border-bottom-left-radius": "<x-one-radius>", "border-bottom-right-radius": "<x-one-radius>", "border-bottom-style": "<border-style>", "border-bottom-width": "<border-width>", "border-collapse": "collapse | separate | inherit", "border-color": { multi: "<color> | inherit", max: 4 }, "border-image": 1, "border-image-outset": { multi: "<length> | <number>", max: 4 }, "border-image-repeat": { multi: "stretch | repeat | round", max: 2 }, "border-image-slice": function(c) {
      var h = false, m = "<number> | <percentage>", a = false, o = 0, u = 4, b;
      for (A.isAny(c, "fill") && (a = true, h = true); c.hasNext() && o < u && (h = A.isAny(c, m), !!h); )
        o++;
      if (a ? h = true : A.isAny(c, "fill"), c.hasNext())
        throw b = c.next(), h ? new se("Expected end of value but found '" + b + "'.", b.line, b.col) : new se("Expected ([<number> | <percentage>]{1,4} && fill?) but found '" + b + "'.", b.line, b.col);
    }, "border-image-source": "<image> | none", "border-image-width": { multi: "<length> | <percentage> | <number> | auto", max: 4 }, "border-left": "<border-width> || <border-style> || <color>", "border-left-color": "<color> | inherit", "border-left-style": "<border-style>", "border-left-width": "<border-width>", "border-radius": function(c) {
      for (var h = false, m = "<length> | <percentage> | inherit", a = false, o = 0, u = 8, b; c.hasNext() && o < u; ) {
        if (h = A.isAny(c, m), !h)
          if (String(c.peek()) === "/" && o > 0 && !a)
            a = true, u = o + 5, c.next();
          else
            break;
        o++;
      }
      if (c.hasNext())
        throw b = c.next(), h ? new se("Expected end of value but found '" + b + "'.", b.line, b.col) : new se("Expected (<'border-radius'>) but found '" + b + "'.", b.line, b.col);
    }, "border-right": "<border-width> || <border-style> || <color>", "border-right-color": "<color> | inherit", "border-right-style": "<border-style>", "border-right-width": "<border-width>", "border-spacing": { multi: "<length> | inherit", max: 2 }, "border-style": { multi: "<border-style>", max: 4 }, "border-top": "<border-width> || <border-style> || <color>", "border-top-color": "<color> | inherit", "border-top-left-radius": "<x-one-radius>", "border-top-right-radius": "<x-one-radius>", "border-top-style": "<border-style>", "border-top-width": "<border-width>", "border-width": { multi: "<border-width>", max: 4 }, bottom: "<margin-width> | inherit", "-moz-box-align": "start | end | center | baseline | stretch", "-moz-box-decoration-break": "slice |clone", "-moz-box-direction": "normal | reverse | inherit", "-moz-box-flex": "<number>", "-moz-box-flex-group": "<integer>", "-moz-box-lines": "single | multiple", "-moz-box-ordinal-group": "<integer>", "-moz-box-orient": "horizontal | vertical | inline-axis | block-axis | inherit", "-moz-box-pack": "start | end | center | justify", "-o-box-decoration-break": "slice | clone", "-webkit-box-align": "start | end | center | baseline | stretch", "-webkit-box-decoration-break": "slice |clone", "-webkit-box-direction": "normal | reverse | inherit", "-webkit-box-flex": "<number>", "-webkit-box-flex-group": "<integer>", "-webkit-box-lines": "single | multiple", "-webkit-box-ordinal-group": "<integer>", "-webkit-box-orient": "horizontal | vertical | inline-axis | block-axis | inherit", "-webkit-box-pack": "start | end | center | justify", "box-decoration-break": "slice | clone", "box-shadow": function(c) {
      var h;
      if (!A.isAny(c, "none"))
        Xe.multiProperty("<shadow>", c, true, 1 / 0);
      else if (c.hasNext())
        throw h = c.next(), new se("Expected end of value but found '" + h + "'.", h.line, h.col);
    }, "box-sizing": "content-box | border-box | inherit", "break-after": "auto | always | avoid | left | right | page | column | avoid-page | avoid-column", "break-before": "auto | always | avoid | left | right | page | column | avoid-page | avoid-column", "break-inside": "auto | avoid | avoid-page | avoid-column", "caption-side": "top | bottom | inherit", clear: "none | right | left | both | inherit", clip: 1, color: "<color> | inherit", "color-profile": 1, "column-count": "<integer> | auto", "column-fill": "auto | balance", "column-gap": "<length> | normal", "column-rule": "<border-width> || <border-style> || <color>", "column-rule-color": "<color>", "column-rule-style": "<border-style>", "column-rule-width": "<border-width>", "column-span": "none | all", "column-width": "<length> | auto", columns: 1, content: 1, "counter-increment": 1, "counter-reset": 1, crop: "<shape> | auto", cue: "cue-after | cue-before | inherit", "cue-after": 1, "cue-before": 1, cursor: 1, direction: "ltr | rtl | inherit", display: "inline | block | list-item | inline-block | table | inline-table | table-row-group | table-header-group | table-footer-group | table-row | table-column-group | table-column | table-cell | table-caption | grid | inline-grid | run-in | ruby | ruby-base | ruby-text | ruby-base-container | ruby-text-container | contents | none | inherit | -moz-box | -moz-inline-block | -moz-inline-box | -moz-inline-grid | -moz-inline-stack | -moz-inline-table | -moz-grid | -moz-grid-group | -moz-grid-line | -moz-groupbox | -moz-deck | -moz-popup | -moz-stack | -moz-marker | -webkit-box | -webkit-inline-box | -ms-flexbox | -ms-inline-flexbox | flex | -webkit-flex | inline-flex | -webkit-inline-flex", "dominant-baseline": 1, "drop-initial-after-adjust": "central | middle | after-edge | text-after-edge | ideographic | alphabetic | mathematical | <percentage> | <length>", "drop-initial-after-align": "baseline | use-script | before-edge | text-before-edge | after-edge | text-after-edge | central | middle | ideographic | alphabetic | hanging | mathematical", "drop-initial-before-adjust": "before-edge | text-before-edge | central | middle | hanging | mathematical | <percentage> | <length>", "drop-initial-before-align": "caps-height | baseline | use-script | before-edge | text-before-edge | after-edge | text-after-edge | central | middle | ideographic | alphabetic | hanging | mathematical", "drop-initial-size": "auto | line | <length> | <percentage>", "drop-initial-value": "initial | <integer>", elevation: "<angle> | below | level | above | higher | lower | inherit", "empty-cells": "show | hide | inherit", filter: 1, fit: "fill | hidden | meet | slice", "fit-position": 1, flex: "<flex>", "flex-basis": "<width>", "flex-direction": "row | row-reverse | column | column-reverse", "flex-flow": "<flex-direction> || <flex-wrap>", "flex-grow": "<number>", "flex-shrink": "<number>", "flex-wrap": "nowrap | wrap | wrap-reverse", "-webkit-flex": "<flex>", "-webkit-flex-basis": "<width>", "-webkit-flex-direction": "row | row-reverse | column | column-reverse", "-webkit-flex-flow": "<flex-direction> || <flex-wrap>", "-webkit-flex-grow": "<number>", "-webkit-flex-shrink": "<number>", "-webkit-flex-wrap": "nowrap | wrap | wrap-reverse", "-ms-flex": "<flex>", "-ms-flex-align": "start | end | center | stretch | baseline", "-ms-flex-direction": "row | row-reverse | column | column-reverse | inherit", "-ms-flex-order": "<number>", "-ms-flex-pack": "start | end | center | justify", "-ms-flex-wrap": "nowrap | wrap | wrap-reverse", float: "left | right | none | inherit", "float-offset": 1, font: 1, "font-family": 1, "font-feature-settings": "<feature-tag-value> | normal | inherit", "font-kerning": "auto | normal | none | initial | inherit | unset", "font-size": "<absolute-size> | <relative-size> | <length> | <percentage> | inherit", "font-size-adjust": "<number> | none | inherit", "font-stretch": "normal | ultra-condensed | extra-condensed | condensed | semi-condensed | semi-expanded | expanded | extra-expanded | ultra-expanded | inherit", "font-style": "normal | italic | oblique | inherit", "font-variant": "normal | small-caps | inherit", "font-variant-caps": "normal | small-caps | all-small-caps | petite-caps | all-petite-caps | unicase | titling-caps", "font-variant-position": "normal | sub | super | inherit | initial | unset", "font-weight": "normal | bold | bolder | lighter | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | inherit", grid: 1, "grid-area": 1, "grid-auto-columns": 1, "grid-auto-flow": 1, "grid-auto-position": 1, "grid-auto-rows": 1, "grid-cell-stacking": "columns | rows | layer", "grid-column": 1, "grid-columns": 1, "grid-column-align": "start | end | center | stretch", "grid-column-sizing": 1, "grid-column-start": 1, "grid-column-end": 1, "grid-column-span": "<integer>", "grid-flow": "none | rows | columns", "grid-layer": "<integer>", "grid-row": 1, "grid-rows": 1, "grid-row-align": "start | end | center | stretch", "grid-row-start": 1, "grid-row-end": 1, "grid-row-span": "<integer>", "grid-row-sizing": 1, "grid-template": 1, "grid-template-areas": 1, "grid-template-columns": 1, "grid-template-rows": 1, "hanging-punctuation": 1, height: "<margin-width> | <content-sizing> | inherit", "hyphenate-after": "<integer> | auto", "hyphenate-before": "<integer> | auto", "hyphenate-character": "<string> | auto", "hyphenate-lines": "no-limit | <integer>", "hyphenate-resource": 1, hyphens: "none | manual | auto", icon: 1, "image-orientation": "angle | auto", "image-rendering": 1, "image-resolution": 1, "ime-mode": "auto | normal | active | inactive | disabled | inherit", "inline-box-align": "initial | last | <integer>", "justify-content": "flex-start | flex-end | center | space-between | space-around", "-webkit-justify-content": "flex-start | flex-end | center | space-between | space-around", left: "<margin-width> | inherit", "letter-spacing": "<length> | normal | inherit", "line-height": "<number> | <length> | <percentage> | normal | inherit", "line-break": "auto | loose | normal | strict", "line-stacking": 1, "line-stacking-ruby": "exclude-ruby | include-ruby", "line-stacking-shift": "consider-shifts | disregard-shifts", "line-stacking-strategy": "inline-line-height | block-line-height | max-height | grid-height", "list-style": 1, "list-style-image": "<uri> | none | inherit", "list-style-position": "inside | outside | inherit", "list-style-type": "disc | circle | square | decimal | decimal-leading-zero | lower-roman | upper-roman | lower-greek | lower-latin | upper-latin | armenian | georgian | lower-alpha | upper-alpha | none | inherit", margin: { multi: "<margin-width> | inherit", max: 4 }, "margin-bottom": "<margin-width> | inherit", "margin-left": "<margin-width> | inherit", "margin-right": "<margin-width> | inherit", "margin-top": "<margin-width> | inherit", mark: 1, "mark-after": 1, "mark-before": 1, marks: 1, "marquee-direction": 1, "marquee-play-count": 1, "marquee-speed": 1, "marquee-style": 1, "max-height": "<length> | <percentage> | <content-sizing> | none | inherit", "max-width": "<length> | <percentage> | <content-sizing> | none | inherit", "min-height": "<length> | <percentage> | <content-sizing> | contain-floats | -moz-contain-floats | -webkit-contain-floats | inherit", "min-width": "<length> | <percentage> | <content-sizing> | contain-floats | -moz-contain-floats | -webkit-contain-floats | inherit", "move-to": 1, "nav-down": 1, "nav-index": 1, "nav-left": 1, "nav-right": 1, "nav-up": 1, "object-fit": "fill | contain | cover | none | scale-down", "object-position": "<bg-position>", opacity: "<number> | inherit", order: "<integer>", "-webkit-order": "<integer>", orphans: "<integer> | inherit", outline: 1, "outline-color": "<color> | invert | inherit", "outline-offset": 1, "outline-style": "<border-style> | inherit", "outline-width": "<border-width> | inherit", overflow: "visible | hidden | scroll | auto | inherit", "overflow-style": 1, "overflow-wrap": "normal | break-word", "overflow-x": 1, "overflow-y": 1, padding: { multi: "<padding-width> | inherit", max: 4 }, "padding-bottom": "<padding-width> | inherit", "padding-left": "<padding-width> | inherit", "padding-right": "<padding-width> | inherit", "padding-top": "<padding-width> | inherit", page: 1, "page-break-after": "auto | always | avoid | left | right | inherit", "page-break-before": "auto | always | avoid | left | right | inherit", "page-break-inside": "auto | avoid | inherit", "page-policy": 1, pause: 1, "pause-after": 1, "pause-before": 1, perspective: 1, "perspective-origin": 1, phonemes: 1, pitch: 1, "pitch-range": 1, "play-during": 1, "pointer-events": "auto | none | visiblePainted | visibleFill | visibleStroke | visible | painted | fill | stroke | all | inherit", position: "static | relative | absolute | fixed | inherit", "presentation-level": 1, "punctuation-trim": 1, quotes: 1, "rendering-intent": 1, resize: 1, rest: 1, "rest-after": 1, "rest-before": 1, richness: 1, right: "<margin-width> | inherit", rotation: 1, "rotation-point": 1, "ruby-align": 1, "ruby-overhang": 1, "ruby-position": 1, "ruby-span": 1, size: 1, speak: "normal | none | spell-out | inherit", "speak-header": "once | always | inherit", "speak-numeral": "digits | continuous | inherit", "speak-punctuation": "code | none | inherit", "speech-rate": 1, src: 1, stress: 1, "string-set": 1, "table-layout": "auto | fixed | inherit", "tab-size": "<integer> | <length>", target: 1, "target-name": 1, "target-new": 1, "target-position": 1, "text-align": "left | right | center | justify | match-parent | start | end | inherit", "text-align-last": 1, "text-decoration": 1, "text-emphasis": 1, "text-height": 1, "text-indent": "<length> | <percentage> | inherit", "text-justify": "auto | none | inter-word | inter-ideograph | inter-cluster | distribute | kashida", "text-outline": 1, "text-overflow": 1, "text-rendering": "auto | optimizeSpeed | optimizeLegibility | geometricPrecision | inherit", "text-shadow": 1, "text-transform": "capitalize | uppercase | lowercase | none | inherit", "text-wrap": "normal | none | avoid", top: "<margin-width> | inherit", "-ms-touch-action": "auto | none | pan-x | pan-y | pan-left | pan-right | pan-up | pan-down | manipulation", "touch-action": "auto | none | pan-x | pan-y | pan-left | pan-right | pan-up | pan-down | manipulation", transform: 1, "transform-origin": 1, "transform-style": 1, transition: 1, "transition-delay": 1, "transition-duration": 1, "transition-property": 1, "transition-timing-function": 1, "unicode-bidi": "normal | embed | isolate | bidi-override | isolate-override | plaintext | inherit", "user-modify": "read-only | read-write | write-only | inherit", "user-select": "none | text | toggle | element | elements | all | inherit", "vertical-align": "auto | use-script | baseline | sub | super | top | text-top | central | middle | bottom | text-bottom | <percentage> | <length> | inherit", visibility: "visible | hidden | collapse | inherit", "voice-balance": 1, "voice-duration": 1, "voice-family": 1, "voice-pitch": 1, "voice-pitch-range": 1, "voice-rate": 1, "voice-stress": 1, "voice-volume": 1, volume: 1, "white-space": "normal | pre | nowrap | pre-wrap | pre-line | inherit | -pre-wrap | -o-pre-wrap | -moz-pre-wrap | -hp-pre-wrap", "white-space-collapse": 1, widows: "<integer> | inherit", width: "<length> | <percentage> | <content-sizing> | auto | inherit", "will-change": { multi: "<ident>", comma: true }, "word-break": "normal | keep-all | break-all", "word-spacing": "<length> | normal | inherit", "word-wrap": "normal | break-word", "writing-mode": "horizontal-tb | vertical-rl | vertical-lr | lr-tb | rl-tb | tb-rl | bt-rl | tb-lr | bt-lr | lr-bt | rl-bt | lr | rl | tb | inherit", "z-index": "<integer> | auto | inherit", zoom: "<number> | <percentage> | normal" };
    function ae(c, h, m, a) {
      l.call(this, c, m, a, S.PROPERTY_NAME_TYPE), this.hack = h;
    }
    ae.prototype = new l(), ae.prototype.constructor = ae, ae.prototype.toString = function() {
      return (this.hack ? this.hack : "") + this.text;
    };
    function ce(c, h, m) {
      l.call(this, c.join(" "), h, m, S.PROPERTY_VALUE_TYPE), this.parts = c;
    }
    ce.prototype = new l(), ce.prototype.constructor = ce;
    function g(c) {
      this._i = 0, this._parts = c.parts, this._marks = [], this.value = c;
    }
    g.prototype.count = function() {
      return this._parts.length;
    }, g.prototype.isFirst = function() {
      return this._i === 0;
    }, g.prototype.hasNext = function() {
      return this._i < this._parts.length;
    }, g.prototype.mark = function() {
      this._marks.push(this._i);
    }, g.prototype.peek = function(c) {
      return this.hasNext() ? this._parts[this._i + (c || 0)] : null;
    }, g.prototype.next = function() {
      return this.hasNext() ? this._parts[this._i++] : null;
    }, g.prototype.previous = function() {
      return this._i > 0 ? this._parts[--this._i] : null;
    }, g.prototype.restore = function() {
      this._marks.length && (this._i = this._marks.pop());
    };
    function re(c, h, m) {
      l.call(this, c, h, m, S.PROPERTY_VALUE_PART_TYPE), this.type = "unknown";
      var a;
      if (/^([+\-]?[\d\.]+)([a-z]+)$/i.test(c))
        switch (this.type = "dimension", this.value = +RegExp.$1, this.units = RegExp.$2, this.units.toLowerCase()) {
          case "em":
          case "rem":
          case "ex":
          case "px":
          case "cm":
          case "mm":
          case "in":
          case "pt":
          case "pc":
          case "ch":
          case "vh":
          case "vw":
          case "vmax":
          case "vmin":
            this.type = "length";
            break;
          case "fr":
            this.type = "grid";
            break;
          case "deg":
          case "rad":
          case "grad":
            this.type = "angle";
            break;
          case "ms":
          case "s":
            this.type = "time";
            break;
          case "hz":
          case "khz":
            this.type = "frequency";
            break;
          case "dpi":
          case "dpcm":
            this.type = "resolution";
            break;
        }
      else
        /^([+\-]?[\d\.]+)%$/i.test(c) ? (this.type = "percentage", this.value = +RegExp.$1) : /^([+\-]?\d+)$/i.test(c) ? (this.type = "integer", this.value = +RegExp.$1) : /^([+\-]?[\d\.]+)$/i.test(c) ? (this.type = "number", this.value = +RegExp.$1) : /^#([a-f0-9]{3,6})/i.test(c) ? (this.type = "color", a = RegExp.$1, a.length === 3 ? (this.red = parseInt(a.charAt(0) + a.charAt(0), 16), this.green = parseInt(a.charAt(1) + a.charAt(1), 16), this.blue = parseInt(a.charAt(2) + a.charAt(2), 16)) : (this.red = parseInt(a.substring(0, 2), 16), this.green = parseInt(a.substring(2, 4), 16), this.blue = parseInt(a.substring(4, 6), 16))) : /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.test(c) ? (this.type = "color", this.red = +RegExp.$1, this.green = +RegExp.$2, this.blue = +RegExp.$3) : /^rgb\(\s*(\d+)%\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/i.test(c) ? (this.type = "color", this.red = +RegExp.$1 * 255 / 100, this.green = +RegExp.$2 * 255 / 100, this.blue = +RegExp.$3 * 255 / 100) : /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d\.]+)\s*\)/i.test(c) ? (this.type = "color", this.red = +RegExp.$1, this.green = +RegExp.$2, this.blue = +RegExp.$3, this.alpha = +RegExp.$4) : /^rgba\(\s*(\d+)%\s*,\s*(\d+)%\s*,\s*(\d+)%\s*,\s*([\d\.]+)\s*\)/i.test(c) ? (this.type = "color", this.red = +RegExp.$1 * 255 / 100, this.green = +RegExp.$2 * 255 / 100, this.blue = +RegExp.$3 * 255 / 100, this.alpha = +RegExp.$4) : /^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/i.test(c) ? (this.type = "color", this.hue = +RegExp.$1, this.saturation = +RegExp.$2 / 100, this.lightness = +RegExp.$3 / 100) : /^hsla\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*,\s*([\d\.]+)\s*\)/i.test(c) ? (this.type = "color", this.hue = +RegExp.$1, this.saturation = +RegExp.$2 / 100, this.lightness = +RegExp.$3 / 100, this.alpha = +RegExp.$4) : /^url\(["']?([^\)"']+)["']?\)/i.test(c) ? (this.type = "uri", this.uri = RegExp.$1) : /^([^\(]+)\(/i.test(c) ? (this.type = "function", this.name = RegExp.$1, this.value = c) : /^"([^\n\r\f\\"]|\\\r\n|\\[^\r0-9a-f]|\\[0-9a-f]{1,6}(\r\n|[ \n\r\t\f])?)*"/i.test(c) ? (this.type = "string", this.value = re.parseString(c)) : /^'([^\n\r\f\\']|\\\r\n|\\[^\r0-9a-f]|\\[0-9a-f]{1,6}(\r\n|[ \n\r\t\f])?)*'/i.test(c) ? (this.type = "string", this.value = re.parseString(c)) : f[c.toLowerCase()] ? (this.type = "color", a = f[c.toLowerCase()].substring(1), this.red = parseInt(a.substring(0, 2), 16), this.green = parseInt(a.substring(2, 4), 16), this.blue = parseInt(a.substring(4, 6), 16)) : /^[\,\/]$/.test(c) ? (this.type = "operator", this.value = c) : /^[a-z\-_\u0080-\uFFFF][a-z0-9\-_\u0080-\uFFFF]*$/i.test(c) && (this.type = "identifier", this.value = c);
    }
    re.prototype = new l(), re.prototype.constructor = re, re.parseString = function(c) {
      c = c.slice(1, -1);
      var h = function(m, a) {
        if (/^(\n|\r\n|\r|\f)$/.test(a))
          return "";
        var o = /^[0-9a-f]{1,6}/i.exec(a);
        if (o) {
          var u = parseInt(o[0], 16);
          return String.fromCodePoint ? String.fromCodePoint(u) : String.fromCharCode(u);
        }
        return a;
      };
      return c.replace(/\\(\r\n|[^\r0-9a-f]|[0-9a-f]{1,6}(\r\n|[ \n\r\t\f])?)/ig, h);
    }, re.serializeString = function(c) {
      var h = function(m, a) {
        if (a === '"')
          return "\\" + a;
        var o = String.codePointAt ? String.codePointAt(0) : String.charCodeAt(0);
        return "\\" + o.toString(16) + " ";
      };
      return '"' + c.replace(/["\r\n\f]/g, h) + '"';
    }, re.fromToken = function(c) {
      return new re(c.value, c.startLine, c.startCol);
    };
    var $ = { __proto__: null, ":first-letter": 1, ":first-line": 1, ":before": 1, ":after": 1 };
    $.ELEMENT = 1, $.CLASS = 2, $.isElement = function(c) {
      return c.indexOf("::") === 0 || $[c.toLowerCase()] === $.ELEMENT;
    };
    function V(c, h, m) {
      l.call(this, c.join(" "), h, m, S.SELECTOR_TYPE), this.parts = c, this.specificity = ie.calculate(this);
    }
    V.prototype = new l(), V.prototype.constructor = V;
    function ve(c, h, m, a, o) {
      l.call(this, m, a, o, S.SELECTOR_PART_TYPE), this.elementName = c, this.modifiers = h;
    }
    ve.prototype = new l(), ve.prototype.constructor = ve;
    function U(c, h, m, a) {
      l.call(this, c, m, a, S.SELECTOR_SUB_PART_TYPE), this.type = h, this.args = [];
    }
    U.prototype = new l(), U.prototype.constructor = U;
    function ie(c, h, m, a) {
      this.a = c, this.b = h, this.c = m, this.d = a;
    }
    ie.prototype = { constructor: ie, compare: function(c) {
      var h = ["a", "b", "c", "d"], m, a;
      for (m = 0, a = h.length; m < a; m++) {
        if (this[h[m]] < c[h[m]])
          return -1;
        if (this[h[m]] > c[h[m]])
          return 1;
      }
      return 0;
    }, valueOf: function() {
      return this.a * 1e3 + this.b * 100 + this.c * 10 + this.d;
    }, toString: function() {
      return this.a + "," + this.b + "," + this.c + "," + this.d;
    } }, ie.calculate = function(c) {
      var h, m, a, o = 0, u = 0, b = 0;
      function w(I) {
        var L, oe, We, dt, He = I.elementName ? I.elementName.text : "", kt;
        for (He && He.charAt(He.length - 1) !== "*" && b++, L = 0, We = I.modifiers.length; L < We; L++)
          switch (kt = I.modifiers[L], kt.type) {
            case "class":
            case "attribute":
              u++;
              break;
            case "id":
              o++;
              break;
            case "pseudo":
              $.isElement(kt.text) ? b++ : u++;
              break;
            case "not":
              for (oe = 0, dt = kt.args.length; oe < dt; oe++)
                w(kt.args[oe]);
          }
      }
      for (h = 0, m = c.parts.length; h < m; h++)
        a = c.parts[h], a instanceof ve && w(a);
      return new ie(0, o, u, b);
    };
    var be = /^[0-9a-fA-F]$/, ne = /\n|\r\n|\r|\f/;
    function Oe(c) {
      return c !== null && be.test(c);
    }
    function qe(c) {
      return c !== null && /\d/.test(c);
    }
    function Le(c) {
      return c !== null && /\s/.test(c);
    }
    function De(c) {
      return c !== null && ne.test(c);
    }
    function ft(c) {
      return c !== null && /[a-z_\u0080-\uFFFF\\]/i.test(c);
    }
    function k(c) {
      return c !== null && (ft(c) || /[0-9\-\\]/.test(c));
    }
    function Fe(c) {
      return c !== null && (ft(c) || /\-\\/.test(c));
    }
    function je(c, h) {
      for (var m in h)
        Object.prototype.hasOwnProperty.call(h, m) && (c[m] = h[m]);
      return c;
    }
    function p(c) {
      t.call(this, c, d);
    }
    p.prototype = je(new t(), { _getToken: function(c) {
      var h, m = this._reader, a = null, o = m.getLine(), u = m.getCol();
      for (h = m.read(); h; ) {
        switch (h) {
          case "/":
            m.peek() === "*" ? a = this.commentToken(h, o, u) : a = this.charToken(h, o, u);
            break;
          case "|":
          case "~":
          case "^":
          case "$":
          case "*":
            m.peek() === "=" ? a = this.comparisonToken(h, o, u) : a = this.charToken(h, o, u);
            break;
          case '"':
          case "'":
            a = this.stringToken(h, o, u);
            break;
          case "#":
            k(m.peek()) ? a = this.hashToken(h, o, u) : a = this.charToken(h, o, u);
            break;
          case ".":
            qe(m.peek()) ? a = this.numberToken(h, o, u) : a = this.charToken(h, o, u);
            break;
          case "-":
            m.peek() === "-" ? a = this.htmlCommentEndToken(h, o, u) : ft(m.peek()) ? a = this.identOrFunctionToken(h, o, u) : a = this.charToken(h, o, u);
            break;
          case "!":
            a = this.importantToken(h, o, u);
            break;
          case "@":
            a = this.atRuleToken(h, o, u);
            break;
          case ":":
            a = this.notToken(h, o, u);
            break;
          case "<":
            a = this.htmlCommentStartToken(h, o, u);
            break;
          case "U":
          case "u":
            if (m.peek() === "+") {
              a = this.unicodeRangeToken(h, o, u);
              break;
            }
          default:
            qe(h) ? a = this.numberToken(h, o, u) : Le(h) ? a = this.whitespaceToken(h, o, u) : Fe(h) ? a = this.identOrFunctionToken(h, o, u) : a = this.charToken(h, o, u);
        }
        break;
      }
      return !a && h === null && (a = this.createToken(d.EOF, null, o, u)), a;
    }, createToken: function(c, h, m, a, o) {
      var u = this._reader;
      return o = o || {}, { value: h, type: c, channel: o.channel, endChar: o.endChar, hide: o.hide || false, startLine: m, startCol: a, endLine: u.getLine(), endCol: u.getCol() };
    }, atRuleToken: function(c, h, m) {
      var a = c, o = this._reader, u = d.CHAR, b;
      return o.mark(), b = this.readName(), a = c + b, u = d.type(a.toLowerCase()), (u === d.CHAR || u === d.UNKNOWN) && (a.length > 1 ? u = d.UNKNOWN_SYM : (u = d.CHAR, a = c, o.reset())), this.createToken(u, a, h, m);
    }, charToken: function(c, h, m) {
      var a = d.type(c), o = {};
      return a === -1 ? a = d.CHAR : o.endChar = d[a].endChar, this.createToken(a, c, h, m, o);
    }, commentToken: function(c, h, m) {
      var a = this.readComment(c);
      return this.createToken(d.COMMENT, a, h, m);
    }, comparisonToken: function(c, h, m) {
      var a = this._reader, o = c + a.read(), u = d.type(o) || d.CHAR;
      return this.createToken(u, o, h, m);
    }, hashToken: function(c, h, m) {
      var a = this.readName(c);
      return this.createToken(d.HASH, a, h, m);
    }, htmlCommentStartToken: function(c, h, m) {
      var a = this._reader, o = c;
      return a.mark(), o += a.readCount(3), o === "<!--" ? this.createToken(d.CDO, o, h, m) : (a.reset(), this.charToken(c, h, m));
    }, htmlCommentEndToken: function(c, h, m) {
      var a = this._reader, o = c;
      return a.mark(), o += a.readCount(2), o === "-->" ? this.createToken(d.CDC, o, h, m) : (a.reset(), this.charToken(c, h, m));
    }, identOrFunctionToken: function(c, h, m) {
      var a = this._reader, o = this.readName(c), u = d.IDENT, b = ["url(", "url-prefix(", "domain("];
      return a.peek() === "(" ? (o += a.read(), b.indexOf(o.toLowerCase()) > -1 ? (u = d.URI, o = this.readURI(o), b.indexOf(o.toLowerCase()) > -1 && (u = d.FUNCTION)) : u = d.FUNCTION) : a.peek() === ":" && o.toLowerCase() === "progid" && (o += a.readTo("("), u = d.IE_FUNCTION), this.createToken(u, o, h, m);
    }, importantToken: function(c, h, m) {
      var a = this._reader, o = c, u = d.CHAR, b, w;
      for (a.mark(), w = a.read(); w; ) {
        if (w === "/") {
          if (a.peek() !== "*")
            break;
          if (b = this.readComment(w), b === "")
            break;
        } else if (Le(w))
          o += w + this.readWhitespace();
        else if (/i/i.test(w)) {
          b = a.readCount(8), /mportant/i.test(b) && (o += w + b, u = d.IMPORTANT_SYM);
          break;
        } else
          break;
        w = a.read();
      }
      return u === d.CHAR ? (a.reset(), this.charToken(c, h, m)) : this.createToken(u, o, h, m);
    }, notToken: function(c, h, m) {
      var a = this._reader, o = c;
      return a.mark(), o += a.readCount(4), o.toLowerCase() === ":not(" ? this.createToken(d.NOT, o, h, m) : (a.reset(), this.charToken(c, h, m));
    }, numberToken: function(c, h, m) {
      var a = this._reader, o = this.readNumber(c), u, b = d.NUMBER, w = a.peek();
      return Fe(w) ? (u = this.readName(a.read()), o += u, /^em$|^ex$|^px$|^gd$|^rem$|^vw$|^vh$|^vmax$|^vmin$|^ch$|^cm$|^mm$|^in$|^pt$|^pc$/i.test(u) ? b = d.LENGTH : /^deg|^rad$|^grad$/i.test(u) ? b = d.ANGLE : /^ms$|^s$/i.test(u) ? b = d.TIME : /^hz$|^khz$/i.test(u) ? b = d.FREQ : /^dpi$|^dpcm$/i.test(u) ? b = d.RESOLUTION : b = d.DIMENSION) : w === "%" && (o += a.read(), b = d.PERCENTAGE), this.createToken(b, o, h, m);
    }, stringToken: function(c, h, m) {
      for (var a = c, o = c, u = this._reader, b = c, w = d.STRING, I = u.read(); I && (o += I, !(I === a && b !== "\\")); ) {
        if (De(u.peek()) && I !== "\\") {
          w = d.INVALID;
          break;
        }
        b = I, I = u.read();
      }
      return I === null && (w = d.INVALID), this.createToken(w, o, h, m);
    }, unicodeRangeToken: function(c, h, m) {
      var a = this._reader, o = c, u, b = d.CHAR;
      return a.peek() === "+" && (a.mark(), o += a.read(), o += this.readUnicodeRangePart(true), o.length === 2 ? a.reset() : (b = d.UNICODE_RANGE, o.indexOf("?") === -1 && a.peek() === "-" && (a.mark(), u = a.read(), u += this.readUnicodeRangePart(false), u.length === 1 ? a.reset() : o += u))), this.createToken(b, o, h, m);
    }, whitespaceToken: function(c, h, m) {
      var a = c + this.readWhitespace();
      return this.createToken(d.S, a, h, m);
    }, readUnicodeRangePart: function(c) {
      for (var h = this._reader, m = "", a = h.peek(); Oe(a) && m.length < 6; )
        h.read(), m += a, a = h.peek();
      if (c)
        for (; a === "?" && m.length < 6; )
          h.read(), m += a, a = h.peek();
      return m;
    }, readWhitespace: function() {
      for (var c = this._reader, h = "", m = c.peek(); Le(m); )
        c.read(), h += m, m = c.peek();
      return h;
    }, readNumber: function(c) {
      for (var h = this._reader, m = c, a = c === ".", o = h.peek(); o; ) {
        if (qe(o))
          m += h.read();
        else if (o === ".") {
          if (a)
            break;
          a = true, m += h.read();
        } else
          break;
        o = h.peek();
      }
      return m;
    }, readString: function() {
      for (var c = this._reader, h = c.read(), m = h, a = h, o = c.peek(); o && (o = c.read(), m += o, !(o === h && a !== "\\")); ) {
        if (De(c.peek()) && o !== "\\") {
          m = "";
          break;
        }
        a = o, o = c.peek();
      }
      return o === null && (m = ""), m;
    }, readURI: function(c) {
      var h = this._reader, m = c, a = "", o = h.peek();
      for (h.mark(); o && Le(o); )
        h.read(), o = h.peek();
      for (o === "'" || o === '"' ? a = this.readString() : a = this.readURL(), o = h.peek(); o && Le(o); )
        h.read(), o = h.peek();
      return a === "" || o !== ")" ? (m = c, h.reset()) : m += a + h.read(), m;
    }, readURL: function() {
      for (var c = this._reader, h = "", m = c.peek(); /^[!#$%&\\*-~]$/.test(m); )
        h += c.read(), m = c.peek();
      return h;
    }, readName: function(c) {
      for (var h = this._reader, m = c || "", a = h.peek(); ; )
        if (a === "\\")
          m += this.readEscape(h.read()), a = h.peek();
        else if (a && k(a))
          m += h.read(), a = h.peek();
        else
          break;
      return m;
    }, readEscape: function(c) {
      var h = this._reader, m = c || "", a = 0, o = h.peek();
      if (Oe(o))
        do
          m += h.read(), o = h.peek();
        while (o && Oe(o) && ++a < 6);
      return m.length === 3 && /\s/.test(o) || m.length === 7 || m.length === 1 ? h.read() : o = "", m + o;
    }, readComment: function(c) {
      var h = this._reader, m = c || "", a = h.read();
      if (a === "*") {
        for (; a; ) {
          if (m += a, m.length > 2 && a === "*" && h.peek() === "/") {
            m += h.read();
            break;
          }
          a = h.read();
        }
        return m;
      } else
        return "";
    } });
    var d = [{ name: "CDO" }, { name: "CDC" }, { name: "S", whitespace: true }, { name: "COMMENT", comment: true, hide: true, channel: "comment" }, { name: "INCLUDES", text: "~=" }, { name: "DASHMATCH", text: "|=" }, { name: "PREFIXMATCH", text: "^=" }, { name: "SUFFIXMATCH", text: "$=" }, { name: "SUBSTRINGMATCH", text: "*=" }, { name: "STRING" }, { name: "IDENT" }, { name: "HASH" }, { name: "IMPORT_SYM", text: "@import" }, { name: "PAGE_SYM", text: "@page" }, { name: "MEDIA_SYM", text: "@media" }, { name: "FONT_FACE_SYM", text: "@font-face" }, { name: "CHARSET_SYM", text: "@charset" }, { name: "NAMESPACE_SYM", text: "@namespace" }, { name: "VIEWPORT_SYM", text: ["@viewport", "@-ms-viewport", "@-o-viewport"] }, { name: "DOCUMENT_SYM", text: ["@document", "@-moz-document"] }, { name: "UNKNOWN_SYM" }, { name: "KEYFRAMES_SYM", text: ["@keyframes", "@-webkit-keyframes", "@-moz-keyframes", "@-o-keyframes"] }, { name: "IMPORTANT_SYM" }, { name: "LENGTH" }, { name: "ANGLE" }, { name: "TIME" }, { name: "FREQ" }, { name: "DIMENSION" }, { name: "PERCENTAGE" }, { name: "NUMBER" }, { name: "URI" }, { name: "FUNCTION" }, { name: "UNICODE_RANGE" }, { name: "INVALID" }, { name: "PLUS", text: "+" }, { name: "GREATER", text: ">" }, { name: "COMMA", text: "," }, { name: "TILDE", text: "~" }, { name: "NOT" }, { name: "TOPLEFTCORNER_SYM", text: "@top-left-corner" }, { name: "TOPLEFT_SYM", text: "@top-left" }, { name: "TOPCENTER_SYM", text: "@top-center" }, { name: "TOPRIGHT_SYM", text: "@top-right" }, { name: "TOPRIGHTCORNER_SYM", text: "@top-right-corner" }, { name: "BOTTOMLEFTCORNER_SYM", text: "@bottom-left-corner" }, { name: "BOTTOMLEFT_SYM", text: "@bottom-left" }, { name: "BOTTOMCENTER_SYM", text: "@bottom-center" }, { name: "BOTTOMRIGHT_SYM", text: "@bottom-right" }, { name: "BOTTOMRIGHTCORNER_SYM", text: "@bottom-right-corner" }, { name: "LEFTTOP_SYM", text: "@left-top" }, { name: "LEFTMIDDLE_SYM", text: "@left-middle" }, { name: "LEFTBOTTOM_SYM", text: "@left-bottom" }, { name: "RIGHTTOP_SYM", text: "@right-top" }, { name: "RIGHTMIDDLE_SYM", text: "@right-middle" }, { name: "RIGHTBOTTOM_SYM", text: "@right-bottom" }, { name: "RESOLUTION", state: "media" }, { name: "IE_FUNCTION" }, { name: "CHAR" }, { name: "PIPE", text: "|" }, { name: "SLASH", text: "/" }, { name: "MINUS", text: "-" }, { name: "STAR", text: "*" }, { name: "LBRACE", endChar: "}", text: "{" }, { name: "RBRACE", text: "}" }, { name: "LBRACKET", endChar: "]", text: "[" }, { name: "RBRACKET", text: "]" }, { name: "EQUALS", text: "=" }, { name: "COLON", text: ":" }, { name: "SEMICOLON", text: ";" }, { name: "LPAREN", endChar: ")", text: "(" }, { name: "RPAREN", text: ")" }, { name: "DOT", text: "." }];
    (function() {
      var c = [], h = Object.create(null);
      d.UNKNOWN = -1, d.unshift({ name: "EOF" });
      for (var m = 0, a = d.length; m < a; m++)
        if (c.push(d[m].name), d[d[m].name] = m, d[m].text)
          if (d[m].text instanceof Array)
            for (var o = 0; o < d[m].text.length; o++)
              h[d[m].text[o]] = m;
          else
            h[d[m].text] = m;
      d.name = function(u) {
        return c[u];
      }, d.type = function(u) {
        return h[u] || -1;
      };
    })();
    var Xe = { validate: function(c, h) {
      var m = c.toString().toLowerCase(), a = new g(h), o = D[m];
      if (o)
        typeof o != "number" && (typeof o == "string" ? o.indexOf("||") > -1 ? this.groupProperty(o, a) : this.singleProperty(o, a, 1) : o.multi ? this.multiProperty(o.multi, a, o.comma, o.max || 1 / 0) : typeof o == "function" && o(a));
      else if (m.indexOf("-") !== 0)
        throw new se("Unknown property '" + c + "'.", c.line, c.col);
    }, singleProperty: function(c, h, m, a) {
      for (var o = false, u = h.value, b = 0, w; h.hasNext() && b < m && (o = A.isAny(h, c), !!o); )
        b++;
      if (o) {
        if (h.hasNext())
          throw w = h.next(), new se("Expected end of value but found '" + w + "'.", w.line, w.col);
      } else
        throw h.hasNext() && !h.isFirst() ? (w = h.peek(), new se("Expected end of value but found '" + w + "'.", w.line, w.col)) : new se("Expected (" + c + ") but found '" + u + "'.", u.line, u.col);
    }, multiProperty: function(c, h, m, a) {
      for (var o = false, u = h.value, b = 0, w; h.hasNext() && !o && b < a && A.isAny(h, c); )
        if (b++, !h.hasNext())
          o = true;
        else if (m)
          if (String(h.peek()) === ",")
            w = h.next();
          else
            break;
      if (o) {
        if (h.hasNext())
          throw w = h.next(), new se("Expected end of value but found '" + w + "'.", w.line, w.col);
      } else
        throw h.hasNext() && !h.isFirst() ? (w = h.peek(), new se("Expected end of value but found '" + w + "'.", w.line, w.col)) : (w = h.previous(), m && String(w) === "," ? new se("Expected end of value but found '" + w + "'.", w.line, w.col) : new se("Expected (" + c + ") but found '" + u + "'.", u.line, u.col));
    }, groupProperty: function(c, h, m) {
      for (var a = false, o = h.value, u = c.split("||").length, b = { count: 0 }, w = false, I, L; h.hasNext() && !a && (I = A.isAnyOfGroup(h, c), I); ) {
        if (b[I])
          break;
        b[I] = 1, b.count++, w = true, (b.count === u || !h.hasNext()) && (a = true);
      }
      if (a) {
        if (h.hasNext())
          throw L = h.next(), new se("Expected end of value but found '" + L + "'.", L.line, L.col);
      } else
        throw w && h.hasNext() ? (L = h.peek(), new se("Expected end of value but found '" + L + "'.", L.line, L.col)) : new se("Expected (" + c + ") but found '" + o + "'.", o.line, o.col);
    } };
    function se(c, h, m) {
      this.col = m, this.line = h, this.message = c;
    }
    se.prototype = new Error();
    var A = { isLiteral: function(c, h) {
      var m = c.text.toString().toLowerCase(), a = h.split(" | "), o, u, b = false;
      for (o = 0, u = a.length; o < u && !b; o++)
        m === a[o].toLowerCase() && (b = true);
      return b;
    }, isSimple: function(c) {
      return !!this.simple[c];
    }, isComplex: function(c) {
      return !!this.complex[c];
    }, isAny: function(c, h) {
      var m = h.split(" | "), a, o, u = false;
      for (a = 0, o = m.length; a < o && !u && c.hasNext(); a++)
        u = this.isType(c, m[a]);
      return u;
    }, isAnyOfGroup: function(c, h) {
      var m = h.split(" || "), a, o, u = false;
      for (a = 0, o = m.length; a < o && !u; a++)
        u = this.isType(c, m[a]);
      return u ? m[a - 1] : false;
    }, isType: function(c, h) {
      var m = c.peek(), a = false;
      return h.charAt(0) !== "<" ? (a = this.isLiteral(m, h), a && c.next()) : this.simple[h] ? (a = this.simple[h](m), a && c.next()) : a = this.complex[h](c), a;
    }, simple: { __proto__: null, "<absolute-size>": function(c) {
      return A.isLiteral(c, "xx-small | x-small | small | medium | large | x-large | xx-large");
    }, "<attachment>": function(c) {
      return A.isLiteral(c, "scroll | fixed | local");
    }, "<attr>": function(c) {
      return c.type === "function" && c.name === "attr";
    }, "<bg-image>": function(c) {
      return this["<image>"](c) || this["<gradient>"](c) || String(c) === "none";
    }, "<gradient>": function(c) {
      return c.type === "function" && /^(?:\-(?:ms|moz|o|webkit)\-)?(?:repeating\-)?(?:radial\-|linear\-)?gradient/i.test(c);
    }, "<box>": function(c) {
      return A.isLiteral(c, "padding-box | border-box | content-box");
    }, "<content>": function(c) {
      return c.type === "function" && c.name === "content";
    }, "<relative-size>": function(c) {
      return A.isLiteral(c, "smaller | larger");
    }, "<ident>": function(c) {
      return c.type === "identifier";
    }, "<length>": function(c) {
      return c.type === "function" && /^(?:\-(?:ms|moz|o|webkit)\-)?calc/i.test(c) ? true : c.type === "length" || c.type === "number" || c.type === "integer" || String(c) === "0";
    }, "<color>": function(c) {
      return c.type === "color" || String(c) === "transparent" || String(c) === "currentColor";
    }, "<number>": function(c) {
      return c.type === "number" || this["<integer>"](c);
    }, "<integer>": function(c) {
      return c.type === "integer";
    }, "<line>": function(c) {
      return c.type === "integer";
    }, "<angle>": function(c) {
      return c.type === "angle";
    }, "<uri>": function(c) {
      return c.type === "uri";
    }, "<image>": function(c) {
      return this["<uri>"](c);
    }, "<percentage>": function(c) {
      return c.type === "percentage" || String(c) === "0";
    }, "<border-width>": function(c) {
      return this["<length>"](c) || A.isLiteral(c, "thin | medium | thick");
    }, "<border-style>": function(c) {
      return A.isLiteral(c, "none | hidden | dotted | dashed | solid | double | groove | ridge | inset | outset");
    }, "<content-sizing>": function(c) {
      return A.isLiteral(c, "fill-available | -moz-available | -webkit-fill-available | max-content | -moz-max-content | -webkit-max-content | min-content | -moz-min-content | -webkit-min-content | fit-content | -moz-fit-content | -webkit-fit-content");
    }, "<margin-width>": function(c) {
      return this["<length>"](c) || this["<percentage>"](c) || A.isLiteral(c, "auto");
    }, "<padding-width>": function(c) {
      return this["<length>"](c) || this["<percentage>"](c);
    }, "<shape>": function(c) {
      return c.type === "function" && (c.name === "rect" || c.name === "inset-rect");
    }, "<time>": function(c) {
      return c.type === "time";
    }, "<flex-grow>": function(c) {
      return this["<number>"](c);
    }, "<flex-shrink>": function(c) {
      return this["<number>"](c);
    }, "<width>": function(c) {
      return this["<margin-width>"](c);
    }, "<flex-basis>": function(c) {
      return this["<width>"](c);
    }, "<flex-direction>": function(c) {
      return A.isLiteral(c, "row | row-reverse | column | column-reverse");
    }, "<flex-wrap>": function(c) {
      return A.isLiteral(c, "nowrap | wrap | wrap-reverse");
    }, "<feature-tag-value>": function(c) {
      return c.type === "function" && /^[A-Z0-9]{4}$/i.test(c);
    } }, complex: { __proto__: null, "<bg-position>": function(c) {
      for (var h = false, m = "<percentage> | <length>", a = "left | right", o = "top | bottom", u = 0; c.peek(u) && c.peek(u).text !== ","; )
        u++;
      return u < 3 ? A.isAny(c, a + " | center | " + m) ? (h = true, A.isAny(c, o + " | center | " + m)) : A.isAny(c, o) && (h = true, A.isAny(c, a + " | center")) : A.isAny(c, a) ? A.isAny(c, o) ? (h = true, A.isAny(c, m)) : A.isAny(c, m) && (A.isAny(c, o) ? (h = true, A.isAny(c, m)) : A.isAny(c, "center") && (h = true)) : A.isAny(c, o) ? A.isAny(c, a) ? (h = true, A.isAny(c, m)) : A.isAny(c, m) && (A.isAny(c, a) ? (h = true, A.isAny(c, m)) : A.isAny(c, "center") && (h = true)) : A.isAny(c, "center") && A.isAny(c, a + " | " + o) && (h = true, A.isAny(c, m)), h;
    }, "<bg-size>": function(c) {
      var h = false, m = "<percentage> | <length> | auto";
      return A.isAny(c, "cover | contain") ? h = true : A.isAny(c, m) && (h = true, A.isAny(c, m)), h;
    }, "<repeat-style>": function(c) {
      var h = false, m = "repeat | space | round | no-repeat", a;
      return c.hasNext() && (a = c.next(), A.isLiteral(a, "repeat-x | repeat-y") ? h = true : A.isLiteral(a, m) && (h = true, c.hasNext() && A.isLiteral(c.peek(), m) && c.next())), h;
    }, "<shadow>": function(c) {
      var h = false, m = 0, a = false, o = false;
      if (c.hasNext()) {
        for (A.isAny(c, "inset") && (a = true), A.isAny(c, "<color>") && (o = true); A.isAny(c, "<length>") && m < 4; )
          m++;
        c.hasNext() && (o || A.isAny(c, "<color>"), a || A.isAny(c, "inset")), h = m >= 2 && m <= 4;
      }
      return h;
    }, "<x-one-radius>": function(c) {
      var h = false, m = "<length> | <percentage> | inherit";
      return A.isAny(c, m) && (h = true, A.isAny(c, m)), h;
    }, "<flex>": function(c) {
      var h, m = false;
      if (A.isAny(c, "none | inherit") ? m = true : A.isType(c, "<flex-grow>") ? c.peek() ? A.isType(c, "<flex-shrink>") ? c.peek() ? m = A.isType(c, "<flex-basis>") : m = true : A.isType(c, "<flex-basis>") && (m = c.peek() === null) : m = true : A.isType(c, "<flex-basis>") && (m = true), !m)
        throw h = c.peek(), new se("Expected (none | [ <flex-grow> <flex-shrink>? || <flex-basis> ]) but found '" + c.value.text + "'.", h.line, h.col);
      return m;
    } } };
    ct.css = { __proto__: null, Colors: f, Combinator: _, Parser: S, PropertyName: ae, PropertyValue: ce, PropertyValuePart: re, MediaFeature: y, MediaQuery: T, Selector: V, SelectorPart: ve, SelectorSubPart: U, Specificity: ie, TokenStream: p, Tokens: d, ValidationError: se };
  })();
  (function() {
    for (var e in ct)
      go[e] = ct[e];
  })();
});
var xn = O((nd, vo) => {
  var i0 = bo();
  vo.exports = yr;
  function yr(e) {
    this._element = e;
  }
  function _o(e) {
    var t = new i0.css.Parser(), r = { property: Object.create(null), priority: Object.create(null) };
    return t.addListener("property", function(n) {
      n.invalid || (r.property[n.property.text] = n.value.text, n.important && (r.priority[n.property.text] = "important"));
    }), e = ("" + e).replace(/^;/, ""), t.parseStyleAttribute(e), r;
  }
  var Qt = {};
  yr.prototype = Object.create(Object.prototype, { _parsed: { get: function() {
    if (!this._parsedStyles || this.cssText !== this._lastParsedText) {
      var e = this.cssText;
      this._parsedStyles = _o(e), this._lastParsedText = e, delete this._names;
    }
    return this._parsedStyles;
  } }, _serialize: { value: function() {
    var e = this._parsed, t = "";
    for (var r in e.property)
      t && (t += " "), t += r + ": " + e.property[r], e.priority[r] && (t += " !" + e.priority[r]), t += ";";
    this.cssText = t, this._lastParsedText = t, delete this._names;
  } }, cssText: { get: function() {
    return this._element.getAttribute("style");
  }, set: function(e) {
    this._element.setAttribute("style", e);
  } }, length: { get: function() {
    return this._names || (this._names = Object.getOwnPropertyNames(this._parsed.property)), this._names.length;
  } }, item: { value: function(e) {
    return this._names || (this._names = Object.getOwnPropertyNames(this._parsed.property)), this._names[e];
  } }, getPropertyValue: { value: function(e) {
    return e = e.toLowerCase(), this._parsed.property[e] || "";
  } }, getPropertyPriority: { value: function(e) {
    return e = e.toLowerCase(), this._parsed.priority[e] || "";
  } }, setProperty: { value: function(e, t, r) {
    if (e = e.toLowerCase(), t == null && (t = ""), r == null && (r = ""), t !== Qt && (t = "" + t), t === "") {
      this.removeProperty(e);
      return;
    }
    if (!(r !== "" && r !== Qt && !/^important$/i.test(r))) {
      var n = this._parsed;
      if (t === Qt) {
        if (!n.property[e])
          return;
        r !== "" ? n.priority[e] = "important" : delete n.priority[e];
      } else {
        if (t.indexOf(";") !== -1)
          return;
        var l = _o(e + ":" + t);
        if (Object.getOwnPropertyNames(l.property).length === 0 || Object.getOwnPropertyNames(l.priority).length !== 0)
          return;
        for (var f in l.property)
          n.property[f] = l.property[f], r !== Qt && (r !== "" ? n.priority[f] = "important" : n.priority[f] && delete n.priority[f]);
      }
      this._serialize();
    }
  } }, setPropertyValue: { value: function(e, t) {
    return this.setProperty(e, t, Qt);
  } }, setPropertyPriority: { value: function(e, t) {
    return this.setProperty(e, Qt, t);
  } }, removeProperty: { value: function(e) {
    e = e.toLowerCase();
    var t = this._parsed;
    e in t.property && (delete t.property[e], delete t.priority[e], this._serialize());
  } } });
  var Eo = { alignContent: "align-content", alignItems: "align-items", alignmentBaseline: "alignment-baseline", alignSelf: "align-self", animation: "animation", animationDelay: "animation-delay", animationDirection: "animation-direction", animationDuration: "animation-duration", animationFillMode: "animation-fill-mode", animationIterationCount: "animation-iteration-count", animationName: "animation-name", animationPlayState: "animation-play-state", animationTimingFunction: "animation-timing-function", backfaceVisibility: "backface-visibility", background: "background", backgroundAttachment: "background-attachment", backgroundClip: "background-clip", backgroundColor: "background-color", backgroundImage: "background-image", backgroundOrigin: "background-origin", backgroundPosition: "background-position", backgroundPositionX: "background-position-x", backgroundPositionY: "background-position-y", backgroundRepeat: "background-repeat", backgroundSize: "background-size", baselineShift: "baseline-shift", border: "border", borderBottom: "border-bottom", borderBottomColor: "border-bottom-color", borderBottomLeftRadius: "border-bottom-left-radius", borderBottomRightRadius: "border-bottom-right-radius", borderBottomStyle: "border-bottom-style", borderBottomWidth: "border-bottom-width", borderCollapse: "border-collapse", borderColor: "border-color", borderImage: "border-image", borderImageOutset: "border-image-outset", borderImageRepeat: "border-image-repeat", borderImageSlice: "border-image-slice", borderImageSource: "border-image-source", borderImageWidth: "border-image-width", borderLeft: "border-left", borderLeftColor: "border-left-color", borderLeftStyle: "border-left-style", borderLeftWidth: "border-left-width", borderRadius: "border-radius", borderRight: "border-right", borderRightColor: "border-right-color", borderRightStyle: "border-right-style", borderRightWidth: "border-right-width", borderSpacing: "border-spacing", borderStyle: "border-style", borderTop: "border-top", borderTopColor: "border-top-color", borderTopLeftRadius: "border-top-left-radius", borderTopRightRadius: "border-top-right-radius", borderTopStyle: "border-top-style", borderTopWidth: "border-top-width", borderWidth: "border-width", bottom: "bottom", boxShadow: "box-shadow", boxSizing: "box-sizing", breakAfter: "break-after", breakBefore: "break-before", breakInside: "break-inside", captionSide: "caption-side", clear: "clear", clip: "clip", clipPath: "clip-path", clipRule: "clip-rule", color: "color", colorInterpolationFilters: "color-interpolation-filters", columnCount: "column-count", columnFill: "column-fill", columnGap: "column-gap", columnRule: "column-rule", columnRuleColor: "column-rule-color", columnRuleStyle: "column-rule-style", columnRuleWidth: "column-rule-width", columns: "columns", columnSpan: "column-span", columnWidth: "column-width", content: "content", counterIncrement: "counter-increment", counterReset: "counter-reset", cssFloat: "float", cursor: "cursor", direction: "direction", display: "display", dominantBaseline: "dominant-baseline", emptyCells: "empty-cells", enableBackground: "enable-background", fill: "fill", fillOpacity: "fill-opacity", fillRule: "fill-rule", filter: "filter", flex: "flex", flexBasis: "flex-basis", flexDirection: "flex-direction", flexFlow: "flex-flow", flexGrow: "flex-grow", flexShrink: "flex-shrink", flexWrap: "flex-wrap", floodColor: "flood-color", floodOpacity: "flood-opacity", font: "font", fontFamily: "font-family", fontFeatureSettings: "font-feature-settings", fontSize: "font-size", fontSizeAdjust: "font-size-adjust", fontStretch: "font-stretch", fontStyle: "font-style", fontVariant: "font-variant", fontWeight: "font-weight", glyphOrientationHorizontal: "glyph-orientation-horizontal", glyphOrientationVertical: "glyph-orientation-vertical", grid: "grid", gridArea: "grid-area", gridAutoColumns: "grid-auto-columns", gridAutoFlow: "grid-auto-flow", gridAutoRows: "grid-auto-rows", gridColumn: "grid-column", gridColumnEnd: "grid-column-end", gridColumnGap: "grid-column-gap", gridColumnStart: "grid-column-start", gridGap: "grid-gap", gridRow: "grid-row", gridRowEnd: "grid-row-end", gridRowGap: "grid-row-gap", gridRowStart: "grid-row-start", gridTemplate: "grid-template", gridTemplateAreas: "grid-template-areas", gridTemplateColumns: "grid-template-columns", gridTemplateRows: "grid-template-rows", height: "height", imeMode: "ime-mode", justifyContent: "justify-content", kerning: "kerning", layoutGrid: "layout-grid", layoutGridChar: "layout-grid-char", layoutGridLine: "layout-grid-line", layoutGridMode: "layout-grid-mode", layoutGridType: "layout-grid-type", left: "left", letterSpacing: "letter-spacing", lightingColor: "lighting-color", lineBreak: "line-break", lineHeight: "line-height", listStyle: "list-style", listStyleImage: "list-style-image", listStylePosition: "list-style-position", listStyleType: "list-style-type", margin: "margin", marginBottom: "margin-bottom", marginLeft: "margin-left", marginRight: "margin-right", marginTop: "margin-top", marker: "marker", markerEnd: "marker-end", markerMid: "marker-mid", markerStart: "marker-start", mask: "mask", maxHeight: "max-height", maxWidth: "max-width", minHeight: "min-height", minWidth: "min-width", msContentZoomChaining: "-ms-content-zoom-chaining", msContentZooming: "-ms-content-zooming", msContentZoomLimit: "-ms-content-zoom-limit", msContentZoomLimitMax: "-ms-content-zoom-limit-max", msContentZoomLimitMin: "-ms-content-zoom-limit-min", msContentZoomSnap: "-ms-content-zoom-snap", msContentZoomSnapPoints: "-ms-content-zoom-snap-points", msContentZoomSnapType: "-ms-content-zoom-snap-type", msFlowFrom: "-ms-flow-from", msFlowInto: "-ms-flow-into", msFontFeatureSettings: "-ms-font-feature-settings", msGridColumn: "-ms-grid-column", msGridColumnAlign: "-ms-grid-column-align", msGridColumns: "-ms-grid-columns", msGridColumnSpan: "-ms-grid-column-span", msGridRow: "-ms-grid-row", msGridRowAlign: "-ms-grid-row-align", msGridRows: "-ms-grid-rows", msGridRowSpan: "-ms-grid-row-span", msHighContrastAdjust: "-ms-high-contrast-adjust", msHyphenateLimitChars: "-ms-hyphenate-limit-chars", msHyphenateLimitLines: "-ms-hyphenate-limit-lines", msHyphenateLimitZone: "-ms-hyphenate-limit-zone", msHyphens: "-ms-hyphens", msImeAlign: "-ms-ime-align", msOverflowStyle: "-ms-overflow-style", msScrollChaining: "-ms-scroll-chaining", msScrollLimit: "-ms-scroll-limit", msScrollLimitXMax: "-ms-scroll-limit-x-max", msScrollLimitXMin: "-ms-scroll-limit-x-min", msScrollLimitYMax: "-ms-scroll-limit-y-max", msScrollLimitYMin: "-ms-scroll-limit-y-min", msScrollRails: "-ms-scroll-rails", msScrollSnapPointsX: "-ms-scroll-snap-points-x", msScrollSnapPointsY: "-ms-scroll-snap-points-y", msScrollSnapType: "-ms-scroll-snap-type", msScrollSnapX: "-ms-scroll-snap-x", msScrollSnapY: "-ms-scroll-snap-y", msScrollTranslation: "-ms-scroll-translation", msTextCombineHorizontal: "-ms-text-combine-horizontal", msTextSizeAdjust: "-ms-text-size-adjust", msTouchAction: "-ms-touch-action", msTouchSelect: "-ms-touch-select", msUserSelect: "-ms-user-select", msWrapFlow: "-ms-wrap-flow", msWrapMargin: "-ms-wrap-margin", msWrapThrough: "-ms-wrap-through", opacity: "opacity", order: "order", orphans: "orphans", outline: "outline", outlineColor: "outline-color", outlineOffset: "outline-offset", outlineStyle: "outline-style", outlineWidth: "outline-width", overflow: "overflow", overflowX: "overflow-x", overflowY: "overflow-y", padding: "padding", paddingBottom: "padding-bottom", paddingLeft: "padding-left", paddingRight: "padding-right", paddingTop: "padding-top", page: "page", pageBreakAfter: "page-break-after", pageBreakBefore: "page-break-before", pageBreakInside: "page-break-inside", perspective: "perspective", perspectiveOrigin: "perspective-origin", pointerEvents: "pointer-events", position: "position", quotes: "quotes", right: "right", rotate: "rotate", rubyAlign: "ruby-align", rubyOverhang: "ruby-overhang", rubyPosition: "ruby-position", scale: "scale", size: "size", stopColor: "stop-color", stopOpacity: "stop-opacity", stroke: "stroke", strokeDasharray: "stroke-dasharray", strokeDashoffset: "stroke-dashoffset", strokeLinecap: "stroke-linecap", strokeLinejoin: "stroke-linejoin", strokeMiterlimit: "stroke-miterlimit", strokeOpacity: "stroke-opacity", strokeWidth: "stroke-width", tableLayout: "table-layout", textAlign: "text-align", textAlignLast: "text-align-last", textAnchor: "text-anchor", textDecoration: "text-decoration", textIndent: "text-indent", textJustify: "text-justify", textKashida: "text-kashida", textKashidaSpace: "text-kashida-space", textOverflow: "text-overflow", textShadow: "text-shadow", textTransform: "text-transform", textUnderlinePosition: "text-underline-position", top: "top", touchAction: "touch-action", transform: "transform", transformOrigin: "transform-origin", transformStyle: "transform-style", transition: "transition", transitionDelay: "transition-delay", transitionDuration: "transition-duration", transitionProperty: "transition-property", transitionTimingFunction: "transition-timing-function", translate: "translate", unicodeBidi: "unicode-bidi", verticalAlign: "vertical-align", visibility: "visibility", webkitAlignContent: "-webkit-align-content", webkitAlignItems: "-webkit-align-items", webkitAlignSelf: "-webkit-align-self", webkitAnimation: "-webkit-animation", webkitAnimationDelay: "-webkit-animation-delay", webkitAnimationDirection: "-webkit-animation-direction", webkitAnimationDuration: "-webkit-animation-duration", webkitAnimationFillMode: "-webkit-animation-fill-mode", webkitAnimationIterationCount: "-webkit-animation-iteration-count", webkitAnimationName: "-webkit-animation-name", webkitAnimationPlayState: "-webkit-animation-play-state", webkitAnimationTimingFunction: "-webkit-animation-timing-funciton", webkitAppearance: "-webkit-appearance", webkitBackfaceVisibility: "-webkit-backface-visibility", webkitBackgroundClip: "-webkit-background-clip", webkitBackgroundOrigin: "-webkit-background-origin", webkitBackgroundSize: "-webkit-background-size", webkitBorderBottomLeftRadius: "-webkit-border-bottom-left-radius", webkitBorderBottomRightRadius: "-webkit-border-bottom-right-radius", webkitBorderImage: "-webkit-border-image", webkitBorderRadius: "-webkit-border-radius", webkitBorderTopLeftRadius: "-webkit-border-top-left-radius", webkitBorderTopRightRadius: "-webkit-border-top-right-radius", webkitBoxAlign: "-webkit-box-align", webkitBoxDirection: "-webkit-box-direction", webkitBoxFlex: "-webkit-box-flex", webkitBoxOrdinalGroup: "-webkit-box-ordinal-group", webkitBoxOrient: "-webkit-box-orient", webkitBoxPack: "-webkit-box-pack", webkitBoxSizing: "-webkit-box-sizing", webkitColumnBreakAfter: "-webkit-column-break-after", webkitColumnBreakBefore: "-webkit-column-break-before", webkitColumnBreakInside: "-webkit-column-break-inside", webkitColumnCount: "-webkit-column-count", webkitColumnGap: "-webkit-column-gap", webkitColumnRule: "-webkit-column-rule", webkitColumnRuleColor: "-webkit-column-rule-color", webkitColumnRuleStyle: "-webkit-column-rule-style", webkitColumnRuleWidth: "-webkit-column-rule-width", webkitColumns: "-webkit-columns", webkitColumnSpan: "-webkit-column-span", webkitColumnWidth: "-webkit-column-width", webkitFilter: "-webkit-filter", webkitFlex: "-webkit-flex", webkitFlexBasis: "-webkit-flex-basis", webkitFlexDirection: "-webkit-flex-direction", webkitFlexFlow: "-webkit-flex-flow", webkitFlexGrow: "-webkit-flex-grow", webkitFlexShrink: "-webkit-flex-shrink", webkitFlexWrap: "-webkit-flex-wrap", webkitJustifyContent: "-webkit-justify-content", webkitOrder: "-webkit-order", webkitPerspective: "-webkit-perspective-origin", webkitPerspectiveOrigin: "-webkit-perspective-origin", webkitTapHighlightColor: "-webkit-tap-highlight-color", webkitTextFillColor: "-webkit-text-fill-color", webkitTextSizeAdjust: "-webkit-text-size-adjust", webkitTextStroke: "-webkit-text-stroke", webkitTextStrokeColor: "-webkit-text-stroke-color", webkitTextStrokeWidth: "-webkit-text-stroke-width", webkitTransform: "-webkit-transform", webkitTransformOrigin: "-webkit-transform-origin", webkitTransformStyle: "-webkit-transform-style", webkitTransition: "-webkit-transition", webkitTransitionDelay: "-webkit-transition-delay", webkitTransitionDuration: "-webkit-transition-duration", webkitTransitionProperty: "-webkit-transition-property", webkitTransitionTimingFunction: "-webkit-transition-timing-function", webkitUserModify: "-webkit-user-modify", webkitUserSelect: "-webkit-user-select", webkitWritingMode: "-webkit-writing-mode", whiteSpace: "white-space", widows: "widows", width: "width", wordBreak: "word-break", wordSpacing: "word-spacing", wordWrap: "word-wrap", writingMode: "writing-mode", zIndex: "z-index", zoom: "zoom", resize: "resize", userSelect: "user-select" };
  for (var s0 in Eo)
    o0(s0);
  function o0(e) {
    var t = Eo[e];
    Object.defineProperty(yr.prototype, e, { get: function() {
      return this.getPropertyValue(t);
    }, set: function(r) {
      this.setProperty(t, r);
    } }), yr.prototype.hasOwnProperty(t) || Object.defineProperty(yr.prototype, t, { get: function() {
      return this.getPropertyValue(t);
    }, set: function(r) {
      this.setProperty(t, r);
    } });
  }
});
var Ka = O((ad, yo) => {
  var Ee = hn();
  yo.exports = wr;
  function wr() {
  }
  wr.prototype = Object.create(Object.prototype, { _url: { get: function() {
    return new Ee(this.href);
  } }, protocol: { get: function() {
    var e = this._url;
    return e && e.scheme ? e.scheme + ":" : ":";
  }, set: function(e) {
    var t = this.href, r = new Ee(t);
    r.isAbsolute() && (e = e.replace(/:+$/, ""), e = e.replace(/[^-+\.a-zA-Z0-9]/g, Ee.percentEncode), e.length > 0 && (r.scheme = e, t = r.toString())), this.href = t;
  } }, host: { get: function() {
    var e = this._url;
    return e.isAbsolute() && e.isAuthorityBased() ? e.host + (e.port ? ":" + e.port : "") : "";
  }, set: function(e) {
    var t = this.href, r = new Ee(t);
    r.isAbsolute() && r.isAuthorityBased() && (e = e.replace(/[^-+\._~!$&'()*,;:=a-zA-Z0-9]/g, Ee.percentEncode), e.length > 0 && (r.host = e, delete r.port, t = r.toString())), this.href = t;
  } }, hostname: { get: function() {
    var e = this._url;
    return e.isAbsolute() && e.isAuthorityBased() ? e.host : "";
  }, set: function(e) {
    var t = this.href, r = new Ee(t);
    r.isAbsolute() && r.isAuthorityBased() && (e = e.replace(/^\/+/, ""), e = e.replace(/[^-+\._~!$&'()*,;:=a-zA-Z0-9]/g, Ee.percentEncode), e.length > 0 && (r.host = e, t = r.toString())), this.href = t;
  } }, port: { get: function() {
    var e = this._url;
    return e.isAbsolute() && e.isAuthorityBased() && e.port !== void 0 ? e.port : "";
  }, set: function(e) {
    var t = this.href, r = new Ee(t);
    r.isAbsolute() && r.isAuthorityBased() && (e = "" + e, e = e.replace(/[^0-9].*$/, ""), e = e.replace(/^0+/, ""), e.length === 0 && (e = "0"), parseInt(e, 10) <= 65535 && (r.port = e, t = r.toString())), this.href = t;
  } }, pathname: { get: function() {
    var e = this._url;
    return e.isAbsolute() && e.isHierarchical() ? e.path : "";
  }, set: function(e) {
    var t = this.href, r = new Ee(t);
    r.isAbsolute() && r.isHierarchical() && (e.charAt(0) !== "/" && (e = "/" + e), e = e.replace(/[^-+\._~!$&'()*,;:=@\/a-zA-Z0-9]/g, Ee.percentEncode), r.path = e, t = r.toString()), this.href = t;
  } }, search: { get: function() {
    var e = this._url;
    return e.isAbsolute() && e.isHierarchical() && e.query !== void 0 ? "?" + e.query : "";
  }, set: function(e) {
    var t = this.href, r = new Ee(t);
    r.isAbsolute() && r.isHierarchical() && (e.charAt(0) === "?" && (e = e.substring(1)), e = e.replace(/[^-+\._~!$&'()*,;:=@\/?a-zA-Z0-9]/g, Ee.percentEncode), r.query = e, t = r.toString()), this.href = t;
  } }, hash: { get: function() {
    var e = this._url;
    return e == null || e.fragment == null || e.fragment === "" ? "" : "#" + e.fragment;
  }, set: function(e) {
    var t = this.href, r = new Ee(t);
    e.charAt(0) === "#" && (e = e.substring(1)), e = e.replace(/[^-+\._~!$&'()*,;:=@\/?a-zA-Z0-9]/g, Ee.percentEncode), r.fragment = e, t = r.toString(), this.href = t;
  } }, username: { get: function() {
    var e = this._url;
    return e.username || "";
  }, set: function(e) {
    var t = this.href, r = new Ee(t);
    r.isAbsolute() && (e = e.replace(/[\x00-\x1F\x7F-\uFFFF "#<>?`\/@\\:]/g, Ee.percentEncode), r.username = e, t = r.toString()), this.href = t;
  } }, password: { get: function() {
    var e = this._url;
    return e.password || "";
  }, set: function(e) {
    var t = this.href, r = new Ee(t);
    r.isAbsolute() && (e === "" ? r.password = null : (e = e.replace(/[\x00-\x1F\x7F-\uFFFF "#<>?`\/@\\]/g, Ee.percentEncode), r.password = e), t = r.toString()), this.href = t;
  } }, origin: { get: function() {
    var e = this._url;
    if (e == null)
      return "";
    var t = function(r) {
      var n = [e.scheme, e.host, +e.port || r];
      return n[0] + "://" + n[1] + (n[2] === r ? "" : ":" + n[2]);
    };
    switch (e.scheme) {
      case "ftp":
        return t(21);
      case "gopher":
        return t(70);
      case "http":
      case "ws":
        return t(80);
      case "https":
      case "wss":
        return t(443);
      default:
        return e.scheme + "://";
    }
  } } });
  wr._inherit = function(e) {
    Object.getOwnPropertyNames(wr.prototype).forEach(function(t) {
      if (!(t === "constructor" || t === "href")) {
        var r = Object.getOwnPropertyDescriptor(wr.prototype, t);
        Object.defineProperty(e, t, r);
      }
    });
  };
});
var Xa = O((id, wo) => {
  wo.exports = { Window_run: function() {
  }, EventHandlerBuilder_build: function() {
  } };
});
var Qa = O((sd, So) => {
  var To = ma(), c0 = Xa(), l0 = Xr().isApiWritable;
  So.exports = function(e, t, r, n) {
    var l = e.ctor;
    if (l) {
      var f = e.props || {};
      if (e.attributes)
        for (var _ in e.attributes) {
          var y = e.attributes[_];
          (typeof y != "object" || Array.isArray(y)) && (y = { type: y }), y.name || (y.name = _.toLowerCase()), f[_] = To.property(y);
        }
      f.constructor = { value: l, writable: l0 }, l.prototype = Object.create((e.superclass || t).prototype, f), e.events && f0(l, e.events), r[l.name] = l;
    } else
      l = t;
    return (e.tags || e.tag && [e.tag] || []).forEach(function(T) {
      n[T] = l;
    }), l;
  };
  function ko(e, t, r, n) {
    this.body = e, this.document = t, this.form = r, this.element = n;
  }
  ko.prototype.build = c0.EventHandlerBuilder_build;
  function u0(e, t, r, n) {
    var l = e.ownerDocument || Object.create(null), f = e.form || Object.create(null);
    e[t] = new ko(n, l, f, e).build();
  }
  function f0(e, t) {
    var r = e.prototype;
    t.forEach(function(n) {
      Object.defineProperty(r, "on" + n, { get: function() {
        return this._getEventHandler(n);
      }, set: function(l) {
        this._setEventHandler(n, l);
      } }), To.registerChangeHandler(e, "on" + n, u0);
    });
  }
});
var Co = O((od, No) => {
  var d0 = hn(), h0 = Ka();
  No.exports = Za;
  function Za(e, t) {
    this._window = e, this._href = t;
  }
  Za.prototype = Object.create(h0.prototype, { constructor: { value: Za }, href: { get: function() {
    return this._href;
  }, set: function(e) {
    this.assign(e);
  } }, assign: { value: function(e) {
    var t = new d0(this._href), r = t.resolve(e);
    this._href = r;
  } }, replace: { value: function(e) {
    this.assign(e);
  } }, reload: { value: function() {
    this.assign(this.href);
  } }, toString: { value: function() {
    return this.href;
  } } });
});
var Lo = O((cd, Ao) => {
  var x0 = Object.create(null, { appCodeName: { value: "Mozilla" }, appName: { value: "Netscape" }, appVersion: { value: "4.0" }, platform: { value: "" }, product: { value: "Gecko" }, productSub: { value: "20100101" }, userAgent: { value: "" }, vendor: { value: "" }, vendorSub: { value: "" }, taintEnabled: { value: function() {
    return false;
  } } });
  Ao.exports = x0;
});
var Ro = O((ld, Do) => {
  var p0 = { setTimeout, clearTimeout, setInterval, clearInterval };
  Do.exports = p0;
});
var mn = O((ud, Io) => {
  Io.exports = pn;
  var m0 = we(), Mo = La(), g0 = sn();
  function pn(e, t, r, n) {
    Mo.call(this), this.nodeType = m0.DOCUMENT_TYPE_NODE, this.ownerDocument = e || null, this.name = t, this.publicId = r || "", this.systemId = n || "";
  }
  pn.prototype = Object.create(Mo.prototype, { nodeName: { get: function() {
    return this.name;
  } }, nodeValue: { get: function() {
    return null;
  }, set: function() {
  } }, clone: { value: function() {
    return new pn(this.ownerDocument, this.name, this.publicId, this.systemId);
  } }, isEqual: { value: function(t) {
    return this.name === t.name && this.publicId === t.publicId && this.systemId === t.systemId;
  } } });
  Object.defineProperties(pn.prototype, g0);
});
var wn = O((fd, nc) => {
  nc.exports = Y;
  var b0 = kn(), _0 = mn(), Ja = we(), q = he().NAMESPACE, Oo = Tn(), ee = Oo.elements, qt = Function.prototype.apply.bind(Array.prototype.push), gn = -1, Zt = 1, Se = 2, G = 3, rt = 4, E0 = 5, v0 = [], y0 = /^HTML$|^-\/\/W3O\/\/DTD W3 HTML Strict 3\.0\/\/EN\/\/$|^-\/W3C\/DTD HTML 4\.0 Transitional\/EN$|^\+\/\/Silmaril\/\/dtd html Pro v0r11 19970101\/\/|^-\/\/AdvaSoft Ltd\/\/DTD HTML 3\.0 asWedit \+ extensions\/\/|^-\/\/AS\/\/DTD HTML 3\.0 asWedit \+ extensions\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Level 1\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Level 2\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Strict Level 1\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Strict Level 2\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Strict\/\/|^-\/\/IETF\/\/DTD HTML 2\.0\/\/|^-\/\/IETF\/\/DTD HTML 2\.1E\/\/|^-\/\/IETF\/\/DTD HTML 3\.0\/\/|^-\/\/IETF\/\/DTD HTML 3\.2 Final\/\/|^-\/\/IETF\/\/DTD HTML 3\.2\/\/|^-\/\/IETF\/\/DTD HTML 3\/\/|^-\/\/IETF\/\/DTD HTML Level 0\/\/|^-\/\/IETF\/\/DTD HTML Level 1\/\/|^-\/\/IETF\/\/DTD HTML Level 2\/\/|^-\/\/IETF\/\/DTD HTML Level 3\/\/|^-\/\/IETF\/\/DTD HTML Strict Level 0\/\/|^-\/\/IETF\/\/DTD HTML Strict Level 1\/\/|^-\/\/IETF\/\/DTD HTML Strict Level 2\/\/|^-\/\/IETF\/\/DTD HTML Strict Level 3\/\/|^-\/\/IETF\/\/DTD HTML Strict\/\/|^-\/\/IETF\/\/DTD HTML\/\/|^-\/\/Metrius\/\/DTD Metrius Presentational\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 2\.0 HTML Strict\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 2\.0 HTML\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 2\.0 Tables\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 3\.0 HTML Strict\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 3\.0 HTML\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 3\.0 Tables\/\/|^-\/\/Netscape Comm\. Corp\.\/\/DTD HTML\/\/|^-\/\/Netscape Comm\. Corp\.\/\/DTD Strict HTML\/\/|^-\/\/O'Reilly and Associates\/\/DTD HTML 2\.0\/\/|^-\/\/O'Reilly and Associates\/\/DTD HTML Extended 1\.0\/\/|^-\/\/O'Reilly and Associates\/\/DTD HTML Extended Relaxed 1\.0\/\/|^-\/\/SoftQuad Software\/\/DTD HoTMetaL PRO 6\.0::19990601::extensions to HTML 4\.0\/\/|^-\/\/SoftQuad\/\/DTD HoTMetaL PRO 4\.0::19971010::extensions to HTML 4\.0\/\/|^-\/\/Spyglass\/\/DTD HTML 2\.0 Extended\/\/|^-\/\/SQ\/\/DTD HTML 2\.0 HoTMetaL \+ extensions\/\/|^-\/\/Sun Microsystems Corp\.\/\/DTD HotJava HTML\/\/|^-\/\/Sun Microsystems Corp\.\/\/DTD HotJava Strict HTML\/\/|^-\/\/W3C\/\/DTD HTML 3 1995-03-24\/\/|^-\/\/W3C\/\/DTD HTML 3\.2 Draft\/\/|^-\/\/W3C\/\/DTD HTML 3\.2 Final\/\/|^-\/\/W3C\/\/DTD HTML 3\.2\/\/|^-\/\/W3C\/\/DTD HTML 3\.2S Draft\/\/|^-\/\/W3C\/\/DTD HTML 4\.0 Frameset\/\/|^-\/\/W3C\/\/DTD HTML 4\.0 Transitional\/\/|^-\/\/W3C\/\/DTD HTML Experimental 19960712\/\/|^-\/\/W3C\/\/DTD HTML Experimental 970421\/\/|^-\/\/W3C\/\/DTD W3 HTML\/\/|^-\/\/W3O\/\/DTD W3 HTML 3\.0\/\/|^-\/\/WebTechs\/\/DTD Mozilla HTML 2\.0\/\/|^-\/\/WebTechs\/\/DTD Mozilla HTML\/\//i, w0 = "http://www.ibm.com/data/dtd/v11/ibmxhtml1-transitional.dtd", qo = /^-\/\/W3C\/\/DTD HTML 4\.01 Frameset\/\/|^-\/\/W3C\/\/DTD HTML 4\.01 Transitional\/\//i, T0 = /^-\/\/W3C\/\/DTD XHTML 1\.0 Frameset\/\/|^-\/\/W3C\/\/DTD XHTML 1\.0 Transitional\/\//i, Ft = Object.create(null);
  Ft[q.HTML] = { __proto__: null, address: true, applet: true, area: true, article: true, aside: true, base: true, basefont: true, bgsound: true, blockquote: true, body: true, br: true, button: true, caption: true, center: true, col: true, colgroup: true, dd: true, details: true, dir: true, div: true, dl: true, dt: true, embed: true, fieldset: true, figcaption: true, figure: true, footer: true, form: true, frame: true, frameset: true, h1: true, h2: true, h3: true, h4: true, h5: true, h6: true, head: true, header: true, hgroup: true, hr: true, html: true, iframe: true, img: true, input: true, li: true, link: true, listing: true, main: true, marquee: true, menu: true, meta: true, nav: true, noembed: true, noframes: true, noscript: true, object: true, ol: true, p: true, param: true, plaintext: true, pre: true, script: true, section: true, select: true, source: true, style: true, summary: true, table: true, tbody: true, td: true, template: true, textarea: true, tfoot: true, th: true, thead: true, title: true, tr: true, track: true, ul: true, wbr: true, xmp: true };
  Ft[q.SVG] = { __proto__: null, foreignObject: true, desc: true, title: true };
  Ft[q.MATHML] = { __proto__: null, mi: true, mo: true, mn: true, ms: true, mtext: true, "annotation-xml": true };
  var ei = Object.create(null);
  ei[q.HTML] = { __proto__: null, address: true, div: true, p: true };
  var Fo = Object.create(null);
  Fo[q.HTML] = { __proto__: null, dd: true, dt: true };
  var Jt = Object.create(null);
  Jt[q.HTML] = { __proto__: null, table: true, thead: true, tbody: true, tfoot: true, tr: true };
  var Ho = Object.create(null);
  Ho[q.HTML] = { __proto__: null, dd: true, dt: true, li: true, menuitem: true, optgroup: true, option: true, p: true, rb: true, rp: true, rt: true, rtc: true };
  var Po = Object.create(null);
  Po[q.HTML] = { __proto__: null, caption: true, colgroup: true, dd: true, dt: true, li: true, optgroup: true, option: true, p: true, rb: true, rp: true, rt: true, rtc: true, tbody: true, td: true, tfoot: true, th: true, thead: true, tr: true };
  var bn = Object.create(null);
  bn[q.HTML] = { __proto__: null, table: true, template: true, html: true };
  var _n = Object.create(null);
  _n[q.HTML] = { __proto__: null, tbody: true, tfoot: true, thead: true, template: true, html: true };
  var ti = Object.create(null);
  ti[q.HTML] = { __proto__: null, tr: true, template: true, html: true };
  var Bo = Object.create(null);
  Bo[q.HTML] = { __proto__: null, button: true, fieldset: true, input: true, keygen: true, object: true, output: true, select: true, textarea: true, img: true };
  var nt = Object.create(null);
  nt[q.HTML] = { __proto__: null, applet: true, caption: true, html: true, table: true, td: true, th: true, marquee: true, object: true, template: true };
  nt[q.MATHML] = { __proto__: null, mi: true, mo: true, mn: true, ms: true, mtext: true, "annotation-xml": true };
  nt[q.SVG] = { __proto__: null, foreignObject: true, desc: true, title: true };
  var En = Object.create(nt);
  En[q.HTML] = Object.create(nt[q.HTML]);
  En[q.HTML].ol = true;
  En[q.HTML].ul = true;
  var ri = Object.create(nt);
  ri[q.HTML] = Object.create(nt[q.HTML]);
  ri[q.HTML].button = true;
  var Uo = Object.create(null);
  Uo[q.HTML] = { __proto__: null, html: true, table: true, template: true };
  var k0 = Object.create(null);
  k0[q.HTML] = { __proto__: null, optgroup: true, option: true };
  var Vo = Object.create(null);
  Vo[q.MATHML] = { __proto__: null, mi: true, mo: true, mn: true, ms: true, mtext: true };
  var zo = Object.create(null);
  zo[q.SVG] = { __proto__: null, foreignObject: true, desc: true, title: true };
  var jo = { __proto__: null, "xlink:actuate": q.XLINK, "xlink:arcrole": q.XLINK, "xlink:href": q.XLINK, "xlink:role": q.XLINK, "xlink:show": q.XLINK, "xlink:title": q.XLINK, "xlink:type": q.XLINK, "xml:base": q.XML, "xml:lang": q.XML, "xml:space": q.XML, xmlns: q.XMLNS, "xmlns:xlink": q.XMLNS }, Wo = { __proto__: null, attributename: "attributeName", attributetype: "attributeType", basefrequency: "baseFrequency", baseprofile: "baseProfile", calcmode: "calcMode", clippathunits: "clipPathUnits", diffuseconstant: "diffuseConstant", edgemode: "edgeMode", filterunits: "filterUnits", glyphref: "glyphRef", gradienttransform: "gradientTransform", gradientunits: "gradientUnits", kernelmatrix: "kernelMatrix", kernelunitlength: "kernelUnitLength", keypoints: "keyPoints", keysplines: "keySplines", keytimes: "keyTimes", lengthadjust: "lengthAdjust", limitingconeangle: "limitingConeAngle", markerheight: "markerHeight", markerunits: "markerUnits", markerwidth: "markerWidth", maskcontentunits: "maskContentUnits", maskunits: "maskUnits", numoctaves: "numOctaves", pathlength: "pathLength", patterncontentunits: "patternContentUnits", patterntransform: "patternTransform", patternunits: "patternUnits", pointsatx: "pointsAtX", pointsaty: "pointsAtY", pointsatz: "pointsAtZ", preservealpha: "preserveAlpha", preserveaspectratio: "preserveAspectRatio", primitiveunits: "primitiveUnits", refx: "refX", refy: "refY", repeatcount: "repeatCount", repeatdur: "repeatDur", requiredextensions: "requiredExtensions", requiredfeatures: "requiredFeatures", specularconstant: "specularConstant", specularexponent: "specularExponent", spreadmethod: "spreadMethod", startoffset: "startOffset", stddeviation: "stdDeviation", stitchtiles: "stitchTiles", surfacescale: "surfaceScale", systemlanguage: "systemLanguage", tablevalues: "tableValues", targetx: "targetX", targety: "targetY", textlength: "textLength", viewbox: "viewBox", viewtarget: "viewTarget", xchannelselector: "xChannelSelector", ychannelselector: "yChannelSelector", zoomandpan: "zoomAndPan" }, Go = { __proto__: null, altglyph: "altGlyph", altglyphdef: "altGlyphDef", altglyphitem: "altGlyphItem", animatecolor: "animateColor", animatemotion: "animateMotion", animatetransform: "animateTransform", clippath: "clipPath", feblend: "feBlend", fecolormatrix: "feColorMatrix", fecomponenttransfer: "feComponentTransfer", fecomposite: "feComposite", feconvolvematrix: "feConvolveMatrix", fediffuselighting: "feDiffuseLighting", fedisplacementmap: "feDisplacementMap", fedistantlight: "feDistantLight", feflood: "feFlood", fefunca: "feFuncA", fefuncb: "feFuncB", fefuncg: "feFuncG", fefuncr: "feFuncR", fegaussianblur: "feGaussianBlur", feimage: "feImage", femerge: "feMerge", femergenode: "feMergeNode", femorphology: "feMorphology", feoffset: "feOffset", fepointlight: "fePointLight", fespecularlighting: "feSpecularLighting", fespotlight: "feSpotLight", fetile: "feTile", feturbulence: "feTurbulence", foreignobject: "foreignObject", glyphref: "glyphRef", lineargradient: "linearGradient", radialgradient: "radialGradient", textpath: "textPath" }, Yo = { __proto__: null, 0: 65533, 128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225, 136: 710, 137: 8240, 138: 352, 139: 8249, 140: 338, 142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226, 150: 8211, 151: 8212, 152: 732, 153: 8482, 154: 353, 155: 8250, 156: 339, 158: 382, 159: 376 }, S0 = { __proto__: null, AElig: 198, "AElig;": 198, AMP: 38, "AMP;": 38, Aacute: 193, "Aacute;": 193, "Abreve;": 258, Acirc: 194, "Acirc;": 194, "Acy;": 1040, "Afr;": [55349, 56580], Agrave: 192, "Agrave;": 192, "Alpha;": 913, "Amacr;": 256, "And;": 10835, "Aogon;": 260, "Aopf;": [55349, 56632], "ApplyFunction;": 8289, Aring: 197, "Aring;": 197, "Ascr;": [55349, 56476], "Assign;": 8788, Atilde: 195, "Atilde;": 195, Auml: 196, "Auml;": 196, "Backslash;": 8726, "Barv;": 10983, "Barwed;": 8966, "Bcy;": 1041, "Because;": 8757, "Bernoullis;": 8492, "Beta;": 914, "Bfr;": [55349, 56581], "Bopf;": [55349, 56633], "Breve;": 728, "Bscr;": 8492, "Bumpeq;": 8782, "CHcy;": 1063, COPY: 169, "COPY;": 169, "Cacute;": 262, "Cap;": 8914, "CapitalDifferentialD;": 8517, "Cayleys;": 8493, "Ccaron;": 268, Ccedil: 199, "Ccedil;": 199, "Ccirc;": 264, "Cconint;": 8752, "Cdot;": 266, "Cedilla;": 184, "CenterDot;": 183, "Cfr;": 8493, "Chi;": 935, "CircleDot;": 8857, "CircleMinus;": 8854, "CirclePlus;": 8853, "CircleTimes;": 8855, "ClockwiseContourIntegral;": 8754, "CloseCurlyDoubleQuote;": 8221, "CloseCurlyQuote;": 8217, "Colon;": 8759, "Colone;": 10868, "Congruent;": 8801, "Conint;": 8751, "ContourIntegral;": 8750, "Copf;": 8450, "Coproduct;": 8720, "CounterClockwiseContourIntegral;": 8755, "Cross;": 10799, "Cscr;": [55349, 56478], "Cup;": 8915, "CupCap;": 8781, "DD;": 8517, "DDotrahd;": 10513, "DJcy;": 1026, "DScy;": 1029, "DZcy;": 1039, "Dagger;": 8225, "Darr;": 8609, "Dashv;": 10980, "Dcaron;": 270, "Dcy;": 1044, "Del;": 8711, "Delta;": 916, "Dfr;": [55349, 56583], "DiacriticalAcute;": 180, "DiacriticalDot;": 729, "DiacriticalDoubleAcute;": 733, "DiacriticalGrave;": 96, "DiacriticalTilde;": 732, "Diamond;": 8900, "DifferentialD;": 8518, "Dopf;": [55349, 56635], "Dot;": 168, "DotDot;": 8412, "DotEqual;": 8784, "DoubleContourIntegral;": 8751, "DoubleDot;": 168, "DoubleDownArrow;": 8659, "DoubleLeftArrow;": 8656, "DoubleLeftRightArrow;": 8660, "DoubleLeftTee;": 10980, "DoubleLongLeftArrow;": 10232, "DoubleLongLeftRightArrow;": 10234, "DoubleLongRightArrow;": 10233, "DoubleRightArrow;": 8658, "DoubleRightTee;": 8872, "DoubleUpArrow;": 8657, "DoubleUpDownArrow;": 8661, "DoubleVerticalBar;": 8741, "DownArrow;": 8595, "DownArrowBar;": 10515, "DownArrowUpArrow;": 8693, "DownBreve;": 785, "DownLeftRightVector;": 10576, "DownLeftTeeVector;": 10590, "DownLeftVector;": 8637, "DownLeftVectorBar;": 10582, "DownRightTeeVector;": 10591, "DownRightVector;": 8641, "DownRightVectorBar;": 10583, "DownTee;": 8868, "DownTeeArrow;": 8615, "Downarrow;": 8659, "Dscr;": [55349, 56479], "Dstrok;": 272, "ENG;": 330, ETH: 208, "ETH;": 208, Eacute: 201, "Eacute;": 201, "Ecaron;": 282, Ecirc: 202, "Ecirc;": 202, "Ecy;": 1069, "Edot;": 278, "Efr;": [55349, 56584], Egrave: 200, "Egrave;": 200, "Element;": 8712, "Emacr;": 274, "EmptySmallSquare;": 9723, "EmptyVerySmallSquare;": 9643, "Eogon;": 280, "Eopf;": [55349, 56636], "Epsilon;": 917, "Equal;": 10869, "EqualTilde;": 8770, "Equilibrium;": 8652, "Escr;": 8496, "Esim;": 10867, "Eta;": 919, Euml: 203, "Euml;": 203, "Exists;": 8707, "ExponentialE;": 8519, "Fcy;": 1060, "Ffr;": [55349, 56585], "FilledSmallSquare;": 9724, "FilledVerySmallSquare;": 9642, "Fopf;": [55349, 56637], "ForAll;": 8704, "Fouriertrf;": 8497, "Fscr;": 8497, "GJcy;": 1027, GT: 62, "GT;": 62, "Gamma;": 915, "Gammad;": 988, "Gbreve;": 286, "Gcedil;": 290, "Gcirc;": 284, "Gcy;": 1043, "Gdot;": 288, "Gfr;": [55349, 56586], "Gg;": 8921, "Gopf;": [55349, 56638], "GreaterEqual;": 8805, "GreaterEqualLess;": 8923, "GreaterFullEqual;": 8807, "GreaterGreater;": 10914, "GreaterLess;": 8823, "GreaterSlantEqual;": 10878, "GreaterTilde;": 8819, "Gscr;": [55349, 56482], "Gt;": 8811, "HARDcy;": 1066, "Hacek;": 711, "Hat;": 94, "Hcirc;": 292, "Hfr;": 8460, "HilbertSpace;": 8459, "Hopf;": 8461, "HorizontalLine;": 9472, "Hscr;": 8459, "Hstrok;": 294, "HumpDownHump;": 8782, "HumpEqual;": 8783, "IEcy;": 1045, "IJlig;": 306, "IOcy;": 1025, Iacute: 205, "Iacute;": 205, Icirc: 206, "Icirc;": 206, "Icy;": 1048, "Idot;": 304, "Ifr;": 8465, Igrave: 204, "Igrave;": 204, "Im;": 8465, "Imacr;": 298, "ImaginaryI;": 8520, "Implies;": 8658, "Int;": 8748, "Integral;": 8747, "Intersection;": 8898, "InvisibleComma;": 8291, "InvisibleTimes;": 8290, "Iogon;": 302, "Iopf;": [55349, 56640], "Iota;": 921, "Iscr;": 8464, "Itilde;": 296, "Iukcy;": 1030, Iuml: 207, "Iuml;": 207, "Jcirc;": 308, "Jcy;": 1049, "Jfr;": [55349, 56589], "Jopf;": [55349, 56641], "Jscr;": [55349, 56485], "Jsercy;": 1032, "Jukcy;": 1028, "KHcy;": 1061, "KJcy;": 1036, "Kappa;": 922, "Kcedil;": 310, "Kcy;": 1050, "Kfr;": [55349, 56590], "Kopf;": [55349, 56642], "Kscr;": [55349, 56486], "LJcy;": 1033, LT: 60, "LT;": 60, "Lacute;": 313, "Lambda;": 923, "Lang;": 10218, "Laplacetrf;": 8466, "Larr;": 8606, "Lcaron;": 317, "Lcedil;": 315, "Lcy;": 1051, "LeftAngleBracket;": 10216, "LeftArrow;": 8592, "LeftArrowBar;": 8676, "LeftArrowRightArrow;": 8646, "LeftCeiling;": 8968, "LeftDoubleBracket;": 10214, "LeftDownTeeVector;": 10593, "LeftDownVector;": 8643, "LeftDownVectorBar;": 10585, "LeftFloor;": 8970, "LeftRightArrow;": 8596, "LeftRightVector;": 10574, "LeftTee;": 8867, "LeftTeeArrow;": 8612, "LeftTeeVector;": 10586, "LeftTriangle;": 8882, "LeftTriangleBar;": 10703, "LeftTriangleEqual;": 8884, "LeftUpDownVector;": 10577, "LeftUpTeeVector;": 10592, "LeftUpVector;": 8639, "LeftUpVectorBar;": 10584, "LeftVector;": 8636, "LeftVectorBar;": 10578, "Leftarrow;": 8656, "Leftrightarrow;": 8660, "LessEqualGreater;": 8922, "LessFullEqual;": 8806, "LessGreater;": 8822, "LessLess;": 10913, "LessSlantEqual;": 10877, "LessTilde;": 8818, "Lfr;": [55349, 56591], "Ll;": 8920, "Lleftarrow;": 8666, "Lmidot;": 319, "LongLeftArrow;": 10229, "LongLeftRightArrow;": 10231, "LongRightArrow;": 10230, "Longleftarrow;": 10232, "Longleftrightarrow;": 10234, "Longrightarrow;": 10233, "Lopf;": [55349, 56643], "LowerLeftArrow;": 8601, "LowerRightArrow;": 8600, "Lscr;": 8466, "Lsh;": 8624, "Lstrok;": 321, "Lt;": 8810, "Map;": 10501, "Mcy;": 1052, "MediumSpace;": 8287, "Mellintrf;": 8499, "Mfr;": [55349, 56592], "MinusPlus;": 8723, "Mopf;": [55349, 56644], "Mscr;": 8499, "Mu;": 924, "NJcy;": 1034, "Nacute;": 323, "Ncaron;": 327, "Ncedil;": 325, "Ncy;": 1053, "NegativeMediumSpace;": 8203, "NegativeThickSpace;": 8203, "NegativeThinSpace;": 8203, "NegativeVeryThinSpace;": 8203, "NestedGreaterGreater;": 8811, "NestedLessLess;": 8810, "NewLine;": 10, "Nfr;": [55349, 56593], "NoBreak;": 8288, "NonBreakingSpace;": 160, "Nopf;": 8469, "Not;": 10988, "NotCongruent;": 8802, "NotCupCap;": 8813, "NotDoubleVerticalBar;": 8742, "NotElement;": 8713, "NotEqual;": 8800, "NotEqualTilde;": [8770, 824], "NotExists;": 8708, "NotGreater;": 8815, "NotGreaterEqual;": 8817, "NotGreaterFullEqual;": [8807, 824], "NotGreaterGreater;": [8811, 824], "NotGreaterLess;": 8825, "NotGreaterSlantEqual;": [10878, 824], "NotGreaterTilde;": 8821, "NotHumpDownHump;": [8782, 824], "NotHumpEqual;": [8783, 824], "NotLeftTriangle;": 8938, "NotLeftTriangleBar;": [10703, 824], "NotLeftTriangleEqual;": 8940, "NotLess;": 8814, "NotLessEqual;": 8816, "NotLessGreater;": 8824, "NotLessLess;": [8810, 824], "NotLessSlantEqual;": [10877, 824], "NotLessTilde;": 8820, "NotNestedGreaterGreater;": [10914, 824], "NotNestedLessLess;": [10913, 824], "NotPrecedes;": 8832, "NotPrecedesEqual;": [10927, 824], "NotPrecedesSlantEqual;": 8928, "NotReverseElement;": 8716, "NotRightTriangle;": 8939, "NotRightTriangleBar;": [10704, 824], "NotRightTriangleEqual;": 8941, "NotSquareSubset;": [8847, 824], "NotSquareSubsetEqual;": 8930, "NotSquareSuperset;": [8848, 824], "NotSquareSupersetEqual;": 8931, "NotSubset;": [8834, 8402], "NotSubsetEqual;": 8840, "NotSucceeds;": 8833, "NotSucceedsEqual;": [10928, 824], "NotSucceedsSlantEqual;": 8929, "NotSucceedsTilde;": [8831, 824], "NotSuperset;": [8835, 8402], "NotSupersetEqual;": 8841, "NotTilde;": 8769, "NotTildeEqual;": 8772, "NotTildeFullEqual;": 8775, "NotTildeTilde;": 8777, "NotVerticalBar;": 8740, "Nscr;": [55349, 56489], Ntilde: 209, "Ntilde;": 209, "Nu;": 925, "OElig;": 338, Oacute: 211, "Oacute;": 211, Ocirc: 212, "Ocirc;": 212, "Ocy;": 1054, "Odblac;": 336, "Ofr;": [55349, 56594], Ograve: 210, "Ograve;": 210, "Omacr;": 332, "Omega;": 937, "Omicron;": 927, "Oopf;": [55349, 56646], "OpenCurlyDoubleQuote;": 8220, "OpenCurlyQuote;": 8216, "Or;": 10836, "Oscr;": [55349, 56490], Oslash: 216, "Oslash;": 216, Otilde: 213, "Otilde;": 213, "Otimes;": 10807, Ouml: 214, "Ouml;": 214, "OverBar;": 8254, "OverBrace;": 9182, "OverBracket;": 9140, "OverParenthesis;": 9180, "PartialD;": 8706, "Pcy;": 1055, "Pfr;": [55349, 56595], "Phi;": 934, "Pi;": 928, "PlusMinus;": 177, "Poincareplane;": 8460, "Popf;": 8473, "Pr;": 10939, "Precedes;": 8826, "PrecedesEqual;": 10927, "PrecedesSlantEqual;": 8828, "PrecedesTilde;": 8830, "Prime;": 8243, "Product;": 8719, "Proportion;": 8759, "Proportional;": 8733, "Pscr;": [55349, 56491], "Psi;": 936, QUOT: 34, "QUOT;": 34, "Qfr;": [55349, 56596], "Qopf;": 8474, "Qscr;": [55349, 56492], "RBarr;": 10512, REG: 174, "REG;": 174, "Racute;": 340, "Rang;": 10219, "Rarr;": 8608, "Rarrtl;": 10518, "Rcaron;": 344, "Rcedil;": 342, "Rcy;": 1056, "Re;": 8476, "ReverseElement;": 8715, "ReverseEquilibrium;": 8651, "ReverseUpEquilibrium;": 10607, "Rfr;": 8476, "Rho;": 929, "RightAngleBracket;": 10217, "RightArrow;": 8594, "RightArrowBar;": 8677, "RightArrowLeftArrow;": 8644, "RightCeiling;": 8969, "RightDoubleBracket;": 10215, "RightDownTeeVector;": 10589, "RightDownVector;": 8642, "RightDownVectorBar;": 10581, "RightFloor;": 8971, "RightTee;": 8866, "RightTeeArrow;": 8614, "RightTeeVector;": 10587, "RightTriangle;": 8883, "RightTriangleBar;": 10704, "RightTriangleEqual;": 8885, "RightUpDownVector;": 10575, "RightUpTeeVector;": 10588, "RightUpVector;": 8638, "RightUpVectorBar;": 10580, "RightVector;": 8640, "RightVectorBar;": 10579, "Rightarrow;": 8658, "Ropf;": 8477, "RoundImplies;": 10608, "Rrightarrow;": 8667, "Rscr;": 8475, "Rsh;": 8625, "RuleDelayed;": 10740, "SHCHcy;": 1065, "SHcy;": 1064, "SOFTcy;": 1068, "Sacute;": 346, "Sc;": 10940, "Scaron;": 352, "Scedil;": 350, "Scirc;": 348, "Scy;": 1057, "Sfr;": [55349, 56598], "ShortDownArrow;": 8595, "ShortLeftArrow;": 8592, "ShortRightArrow;": 8594, "ShortUpArrow;": 8593, "Sigma;": 931, "SmallCircle;": 8728, "Sopf;": [55349, 56650], "Sqrt;": 8730, "Square;": 9633, "SquareIntersection;": 8851, "SquareSubset;": 8847, "SquareSubsetEqual;": 8849, "SquareSuperset;": 8848, "SquareSupersetEqual;": 8850, "SquareUnion;": 8852, "Sscr;": [55349, 56494], "Star;": 8902, "Sub;": 8912, "Subset;": 8912, "SubsetEqual;": 8838, "Succeeds;": 8827, "SucceedsEqual;": 10928, "SucceedsSlantEqual;": 8829, "SucceedsTilde;": 8831, "SuchThat;": 8715, "Sum;": 8721, "Sup;": 8913, "Superset;": 8835, "SupersetEqual;": 8839, "Supset;": 8913, THORN: 222, "THORN;": 222, "TRADE;": 8482, "TSHcy;": 1035, "TScy;": 1062, "Tab;": 9, "Tau;": 932, "Tcaron;": 356, "Tcedil;": 354, "Tcy;": 1058, "Tfr;": [55349, 56599], "Therefore;": 8756, "Theta;": 920, "ThickSpace;": [8287, 8202], "ThinSpace;": 8201, "Tilde;": 8764, "TildeEqual;": 8771, "TildeFullEqual;": 8773, "TildeTilde;": 8776, "Topf;": [55349, 56651], "TripleDot;": 8411, "Tscr;": [55349, 56495], "Tstrok;": 358, Uacute: 218, "Uacute;": 218, "Uarr;": 8607, "Uarrocir;": 10569, "Ubrcy;": 1038, "Ubreve;": 364, Ucirc: 219, "Ucirc;": 219, "Ucy;": 1059, "Udblac;": 368, "Ufr;": [55349, 56600], Ugrave: 217, "Ugrave;": 217, "Umacr;": 362, "UnderBar;": 95, "UnderBrace;": 9183, "UnderBracket;": 9141, "UnderParenthesis;": 9181, "Union;": 8899, "UnionPlus;": 8846, "Uogon;": 370, "Uopf;": [55349, 56652], "UpArrow;": 8593, "UpArrowBar;": 10514, "UpArrowDownArrow;": 8645, "UpDownArrow;": 8597, "UpEquilibrium;": 10606, "UpTee;": 8869, "UpTeeArrow;": 8613, "Uparrow;": 8657, "Updownarrow;": 8661, "UpperLeftArrow;": 8598, "UpperRightArrow;": 8599, "Upsi;": 978, "Upsilon;": 933, "Uring;": 366, "Uscr;": [55349, 56496], "Utilde;": 360, Uuml: 220, "Uuml;": 220, "VDash;": 8875, "Vbar;": 10987, "Vcy;": 1042, "Vdash;": 8873, "Vdashl;": 10982, "Vee;": 8897, "Verbar;": 8214, "Vert;": 8214, "VerticalBar;": 8739, "VerticalLine;": 124, "VerticalSeparator;": 10072, "VerticalTilde;": 8768, "VeryThinSpace;": 8202, "Vfr;": [55349, 56601], "Vopf;": [55349, 56653], "Vscr;": [55349, 56497], "Vvdash;": 8874, "Wcirc;": 372, "Wedge;": 8896, "Wfr;": [55349, 56602], "Wopf;": [55349, 56654], "Wscr;": [55349, 56498], "Xfr;": [55349, 56603], "Xi;": 926, "Xopf;": [55349, 56655], "Xscr;": [55349, 56499], "YAcy;": 1071, "YIcy;": 1031, "YUcy;": 1070, Yacute: 221, "Yacute;": 221, "Ycirc;": 374, "Ycy;": 1067, "Yfr;": [55349, 56604], "Yopf;": [55349, 56656], "Yscr;": [55349, 56500], "Yuml;": 376, "ZHcy;": 1046, "Zacute;": 377, "Zcaron;": 381, "Zcy;": 1047, "Zdot;": 379, "ZeroWidthSpace;": 8203, "Zeta;": 918, "Zfr;": 8488, "Zopf;": 8484, "Zscr;": [55349, 56501], aacute: 225, "aacute;": 225, "abreve;": 259, "ac;": 8766, "acE;": [8766, 819], "acd;": 8767, acirc: 226, "acirc;": 226, acute: 180, "acute;": 180, "acy;": 1072, aelig: 230, "aelig;": 230, "af;": 8289, "afr;": [55349, 56606], agrave: 224, "agrave;": 224, "alefsym;": 8501, "aleph;": 8501, "alpha;": 945, "amacr;": 257, "amalg;": 10815, amp: 38, "amp;": 38, "and;": 8743, "andand;": 10837, "andd;": 10844, "andslope;": 10840, "andv;": 10842, "ang;": 8736, "ange;": 10660, "angle;": 8736, "angmsd;": 8737, "angmsdaa;": 10664, "angmsdab;": 10665, "angmsdac;": 10666, "angmsdad;": 10667, "angmsdae;": 10668, "angmsdaf;": 10669, "angmsdag;": 10670, "angmsdah;": 10671, "angrt;": 8735, "angrtvb;": 8894, "angrtvbd;": 10653, "angsph;": 8738, "angst;": 197, "angzarr;": 9084, "aogon;": 261, "aopf;": [55349, 56658], "ap;": 8776, "apE;": 10864, "apacir;": 10863, "ape;": 8778, "apid;": 8779, "apos;": 39, "approx;": 8776, "approxeq;": 8778, aring: 229, "aring;": 229, "ascr;": [55349, 56502], "ast;": 42, "asymp;": 8776, "asympeq;": 8781, atilde: 227, "atilde;": 227, auml: 228, "auml;": 228, "awconint;": 8755, "awint;": 10769, "bNot;": 10989, "backcong;": 8780, "backepsilon;": 1014, "backprime;": 8245, "backsim;": 8765, "backsimeq;": 8909, "barvee;": 8893, "barwed;": 8965, "barwedge;": 8965, "bbrk;": 9141, "bbrktbrk;": 9142, "bcong;": 8780, "bcy;": 1073, "bdquo;": 8222, "becaus;": 8757, "because;": 8757, "bemptyv;": 10672, "bepsi;": 1014, "bernou;": 8492, "beta;": 946, "beth;": 8502, "between;": 8812, "bfr;": [55349, 56607], "bigcap;": 8898, "bigcirc;": 9711, "bigcup;": 8899, "bigodot;": 10752, "bigoplus;": 10753, "bigotimes;": 10754, "bigsqcup;": 10758, "bigstar;": 9733, "bigtriangledown;": 9661, "bigtriangleup;": 9651, "biguplus;": 10756, "bigvee;": 8897, "bigwedge;": 8896, "bkarow;": 10509, "blacklozenge;": 10731, "blacksquare;": 9642, "blacktriangle;": 9652, "blacktriangledown;": 9662, "blacktriangleleft;": 9666, "blacktriangleright;": 9656, "blank;": 9251, "blk12;": 9618, "blk14;": 9617, "blk34;": 9619, "block;": 9608, "bne;": [61, 8421], "bnequiv;": [8801, 8421], "bnot;": 8976, "bopf;": [55349, 56659], "bot;": 8869, "bottom;": 8869, "bowtie;": 8904, "boxDL;": 9559, "boxDR;": 9556, "boxDl;": 9558, "boxDr;": 9555, "boxH;": 9552, "boxHD;": 9574, "boxHU;": 9577, "boxHd;": 9572, "boxHu;": 9575, "boxUL;": 9565, "boxUR;": 9562, "boxUl;": 9564, "boxUr;": 9561, "boxV;": 9553, "boxVH;": 9580, "boxVL;": 9571, "boxVR;": 9568, "boxVh;": 9579, "boxVl;": 9570, "boxVr;": 9567, "boxbox;": 10697, "boxdL;": 9557, "boxdR;": 9554, "boxdl;": 9488, "boxdr;": 9484, "boxh;": 9472, "boxhD;": 9573, "boxhU;": 9576, "boxhd;": 9516, "boxhu;": 9524, "boxminus;": 8863, "boxplus;": 8862, "boxtimes;": 8864, "boxuL;": 9563, "boxuR;": 9560, "boxul;": 9496, "boxur;": 9492, "boxv;": 9474, "boxvH;": 9578, "boxvL;": 9569, "boxvR;": 9566, "boxvh;": 9532, "boxvl;": 9508, "boxvr;": 9500, "bprime;": 8245, "breve;": 728, brvbar: 166, "brvbar;": 166, "bscr;": [55349, 56503], "bsemi;": 8271, "bsim;": 8765, "bsime;": 8909, "bsol;": 92, "bsolb;": 10693, "bsolhsub;": 10184, "bull;": 8226, "bullet;": 8226, "bump;": 8782, "bumpE;": 10926, "bumpe;": 8783, "bumpeq;": 8783, "cacute;": 263, "cap;": 8745, "capand;": 10820, "capbrcup;": 10825, "capcap;": 10827, "capcup;": 10823, "capdot;": 10816, "caps;": [8745, 65024], "caret;": 8257, "caron;": 711, "ccaps;": 10829, "ccaron;": 269, ccedil: 231, "ccedil;": 231, "ccirc;": 265, "ccups;": 10828, "ccupssm;": 10832, "cdot;": 267, cedil: 184, "cedil;": 184, "cemptyv;": 10674, cent: 162, "cent;": 162, "centerdot;": 183, "cfr;": [55349, 56608], "chcy;": 1095, "check;": 10003, "checkmark;": 10003, "chi;": 967, "cir;": 9675, "cirE;": 10691, "circ;": 710, "circeq;": 8791, "circlearrowleft;": 8634, "circlearrowright;": 8635, "circledR;": 174, "circledS;": 9416, "circledast;": 8859, "circledcirc;": 8858, "circleddash;": 8861, "cire;": 8791, "cirfnint;": 10768, "cirmid;": 10991, "cirscir;": 10690, "clubs;": 9827, "clubsuit;": 9827, "colon;": 58, "colone;": 8788, "coloneq;": 8788, "comma;": 44, "commat;": 64, "comp;": 8705, "compfn;": 8728, "complement;": 8705, "complexes;": 8450, "cong;": 8773, "congdot;": 10861, "conint;": 8750, "copf;": [55349, 56660], "coprod;": 8720, copy: 169, "copy;": 169, "copysr;": 8471, "crarr;": 8629, "cross;": 10007, "cscr;": [55349, 56504], "csub;": 10959, "csube;": 10961, "csup;": 10960, "csupe;": 10962, "ctdot;": 8943, "cudarrl;": 10552, "cudarrr;": 10549, "cuepr;": 8926, "cuesc;": 8927, "cularr;": 8630, "cularrp;": 10557, "cup;": 8746, "cupbrcap;": 10824, "cupcap;": 10822, "cupcup;": 10826, "cupdot;": 8845, "cupor;": 10821, "cups;": [8746, 65024], "curarr;": 8631, "curarrm;": 10556, "curlyeqprec;": 8926, "curlyeqsucc;": 8927, "curlyvee;": 8910, "curlywedge;": 8911, curren: 164, "curren;": 164, "curvearrowleft;": 8630, "curvearrowright;": 8631, "cuvee;": 8910, "cuwed;": 8911, "cwconint;": 8754, "cwint;": 8753, "cylcty;": 9005, "dArr;": 8659, "dHar;": 10597, "dagger;": 8224, "daleth;": 8504, "darr;": 8595, "dash;": 8208, "dashv;": 8867, "dbkarow;": 10511, "dblac;": 733, "dcaron;": 271, "dcy;": 1076, "dd;": 8518, "ddagger;": 8225, "ddarr;": 8650, "ddotseq;": 10871, deg: 176, "deg;": 176, "delta;": 948, "demptyv;": 10673, "dfisht;": 10623, "dfr;": [55349, 56609], "dharl;": 8643, "dharr;": 8642, "diam;": 8900, "diamond;": 8900, "diamondsuit;": 9830, "diams;": 9830, "die;": 168, "digamma;": 989, "disin;": 8946, "div;": 247, divide: 247, "divide;": 247, "divideontimes;": 8903, "divonx;": 8903, "djcy;": 1106, "dlcorn;": 8990, "dlcrop;": 8973, "dollar;": 36, "dopf;": [55349, 56661], "dot;": 729, "doteq;": 8784, "doteqdot;": 8785, "dotminus;": 8760, "dotplus;": 8724, "dotsquare;": 8865, "doublebarwedge;": 8966, "downarrow;": 8595, "downdownarrows;": 8650, "downharpoonleft;": 8643, "downharpoonright;": 8642, "drbkarow;": 10512, "drcorn;": 8991, "drcrop;": 8972, "dscr;": [55349, 56505], "dscy;": 1109, "dsol;": 10742, "dstrok;": 273, "dtdot;": 8945, "dtri;": 9663, "dtrif;": 9662, "duarr;": 8693, "duhar;": 10607, "dwangle;": 10662, "dzcy;": 1119, "dzigrarr;": 10239, "eDDot;": 10871, "eDot;": 8785, eacute: 233, "eacute;": 233, "easter;": 10862, "ecaron;": 283, "ecir;": 8790, ecirc: 234, "ecirc;": 234, "ecolon;": 8789, "ecy;": 1101, "edot;": 279, "ee;": 8519, "efDot;": 8786, "efr;": [55349, 56610], "eg;": 10906, egrave: 232, "egrave;": 232, "egs;": 10902, "egsdot;": 10904, "el;": 10905, "elinters;": 9191, "ell;": 8467, "els;": 10901, "elsdot;": 10903, "emacr;": 275, "empty;": 8709, "emptyset;": 8709, "emptyv;": 8709, "emsp13;": 8196, "emsp14;": 8197, "emsp;": 8195, "eng;": 331, "ensp;": 8194, "eogon;": 281, "eopf;": [55349, 56662], "epar;": 8917, "eparsl;": 10723, "eplus;": 10865, "epsi;": 949, "epsilon;": 949, "epsiv;": 1013, "eqcirc;": 8790, "eqcolon;": 8789, "eqsim;": 8770, "eqslantgtr;": 10902, "eqslantless;": 10901, "equals;": 61, "equest;": 8799, "equiv;": 8801, "equivDD;": 10872, "eqvparsl;": 10725, "erDot;": 8787, "erarr;": 10609, "escr;": 8495, "esdot;": 8784, "esim;": 8770, "eta;": 951, eth: 240, "eth;": 240, euml: 235, "euml;": 235, "euro;": 8364, "excl;": 33, "exist;": 8707, "expectation;": 8496, "exponentiale;": 8519, "fallingdotseq;": 8786, "fcy;": 1092, "female;": 9792, "ffilig;": 64259, "fflig;": 64256, "ffllig;": 64260, "ffr;": [55349, 56611], "filig;": 64257, "fjlig;": [102, 106], "flat;": 9837, "fllig;": 64258, "fltns;": 9649, "fnof;": 402, "fopf;": [55349, 56663], "forall;": 8704, "fork;": 8916, "forkv;": 10969, "fpartint;": 10765, frac12: 189, "frac12;": 189, "frac13;": 8531, frac14: 188, "frac14;": 188, "frac15;": 8533, "frac16;": 8537, "frac18;": 8539, "frac23;": 8532, "frac25;": 8534, frac34: 190, "frac34;": 190, "frac35;": 8535, "frac38;": 8540, "frac45;": 8536, "frac56;": 8538, "frac58;": 8541, "frac78;": 8542, "frasl;": 8260, "frown;": 8994, "fscr;": [55349, 56507], "gE;": 8807, "gEl;": 10892, "gacute;": 501, "gamma;": 947, "gammad;": 989, "gap;": 10886, "gbreve;": 287, "gcirc;": 285, "gcy;": 1075, "gdot;": 289, "ge;": 8805, "gel;": 8923, "geq;": 8805, "geqq;": 8807, "geqslant;": 10878, "ges;": 10878, "gescc;": 10921, "gesdot;": 10880, "gesdoto;": 10882, "gesdotol;": 10884, "gesl;": [8923, 65024], "gesles;": 10900, "gfr;": [55349, 56612], "gg;": 8811, "ggg;": 8921, "gimel;": 8503, "gjcy;": 1107, "gl;": 8823, "glE;": 10898, "gla;": 10917, "glj;": 10916, "gnE;": 8809, "gnap;": 10890, "gnapprox;": 10890, "gne;": 10888, "gneq;": 10888, "gneqq;": 8809, "gnsim;": 8935, "gopf;": [55349, 56664], "grave;": 96, "gscr;": 8458, "gsim;": 8819, "gsime;": 10894, "gsiml;": 10896, gt: 62, "gt;": 62, "gtcc;": 10919, "gtcir;": 10874, "gtdot;": 8919, "gtlPar;": 10645, "gtquest;": 10876, "gtrapprox;": 10886, "gtrarr;": 10616, "gtrdot;": 8919, "gtreqless;": 8923, "gtreqqless;": 10892, "gtrless;": 8823, "gtrsim;": 8819, "gvertneqq;": [8809, 65024], "gvnE;": [8809, 65024], "hArr;": 8660, "hairsp;": 8202, "half;": 189, "hamilt;": 8459, "hardcy;": 1098, "harr;": 8596, "harrcir;": 10568, "harrw;": 8621, "hbar;": 8463, "hcirc;": 293, "hearts;": 9829, "heartsuit;": 9829, "hellip;": 8230, "hercon;": 8889, "hfr;": [55349, 56613], "hksearow;": 10533, "hkswarow;": 10534, "hoarr;": 8703, "homtht;": 8763, "hookleftarrow;": 8617, "hookrightarrow;": 8618, "hopf;": [55349, 56665], "horbar;": 8213, "hscr;": [55349, 56509], "hslash;": 8463, "hstrok;": 295, "hybull;": 8259, "hyphen;": 8208, iacute: 237, "iacute;": 237, "ic;": 8291, icirc: 238, "icirc;": 238, "icy;": 1080, "iecy;": 1077, iexcl: 161, "iexcl;": 161, "iff;": 8660, "ifr;": [55349, 56614], igrave: 236, "igrave;": 236, "ii;": 8520, "iiiint;": 10764, "iiint;": 8749, "iinfin;": 10716, "iiota;": 8489, "ijlig;": 307, "imacr;": 299, "image;": 8465, "imagline;": 8464, "imagpart;": 8465, "imath;": 305, "imof;": 8887, "imped;": 437, "in;": 8712, "incare;": 8453, "infin;": 8734, "infintie;": 10717, "inodot;": 305, "int;": 8747, "intcal;": 8890, "integers;": 8484, "intercal;": 8890, "intlarhk;": 10775, "intprod;": 10812, "iocy;": 1105, "iogon;": 303, "iopf;": [55349, 56666], "iota;": 953, "iprod;": 10812, iquest: 191, "iquest;": 191, "iscr;": [55349, 56510], "isin;": 8712, "isinE;": 8953, "isindot;": 8949, "isins;": 8948, "isinsv;": 8947, "isinv;": 8712, "it;": 8290, "itilde;": 297, "iukcy;": 1110, iuml: 239, "iuml;": 239, "jcirc;": 309, "jcy;": 1081, "jfr;": [55349, 56615], "jmath;": 567, "jopf;": [55349, 56667], "jscr;": [55349, 56511], "jsercy;": 1112, "jukcy;": 1108, "kappa;": 954, "kappav;": 1008, "kcedil;": 311, "kcy;": 1082, "kfr;": [55349, 56616], "kgreen;": 312, "khcy;": 1093, "kjcy;": 1116, "kopf;": [55349, 56668], "kscr;": [55349, 56512], "lAarr;": 8666, "lArr;": 8656, "lAtail;": 10523, "lBarr;": 10510, "lE;": 8806, "lEg;": 10891, "lHar;": 10594, "lacute;": 314, "laemptyv;": 10676, "lagran;": 8466, "lambda;": 955, "lang;": 10216, "langd;": 10641, "langle;": 10216, "lap;": 10885, laquo: 171, "laquo;": 171, "larr;": 8592, "larrb;": 8676, "larrbfs;": 10527, "larrfs;": 10525, "larrhk;": 8617, "larrlp;": 8619, "larrpl;": 10553, "larrsim;": 10611, "larrtl;": 8610, "lat;": 10923, "latail;": 10521, "late;": 10925, "lates;": [10925, 65024], "lbarr;": 10508, "lbbrk;": 10098, "lbrace;": 123, "lbrack;": 91, "lbrke;": 10635, "lbrksld;": 10639, "lbrkslu;": 10637, "lcaron;": 318, "lcedil;": 316, "lceil;": 8968, "lcub;": 123, "lcy;": 1083, "ldca;": 10550, "ldquo;": 8220, "ldquor;": 8222, "ldrdhar;": 10599, "ldrushar;": 10571, "ldsh;": 8626, "le;": 8804, "leftarrow;": 8592, "leftarrowtail;": 8610, "leftharpoondown;": 8637, "leftharpoonup;": 8636, "leftleftarrows;": 8647, "leftrightarrow;": 8596, "leftrightarrows;": 8646, "leftrightharpoons;": 8651, "leftrightsquigarrow;": 8621, "leftthreetimes;": 8907, "leg;": 8922, "leq;": 8804, "leqq;": 8806, "leqslant;": 10877, "les;": 10877, "lescc;": 10920, "lesdot;": 10879, "lesdoto;": 10881, "lesdotor;": 10883, "lesg;": [8922, 65024], "lesges;": 10899, "lessapprox;": 10885, "lessdot;": 8918, "lesseqgtr;": 8922, "lesseqqgtr;": 10891, "lessgtr;": 8822, "lesssim;": 8818, "lfisht;": 10620, "lfloor;": 8970, "lfr;": [55349, 56617], "lg;": 8822, "lgE;": 10897, "lhard;": 8637, "lharu;": 8636, "lharul;": 10602, "lhblk;": 9604, "ljcy;": 1113, "ll;": 8810, "llarr;": 8647, "llcorner;": 8990, "llhard;": 10603, "lltri;": 9722, "lmidot;": 320, "lmoust;": 9136, "lmoustache;": 9136, "lnE;": 8808, "lnap;": 10889, "lnapprox;": 10889, "lne;": 10887, "lneq;": 10887, "lneqq;": 8808, "lnsim;": 8934, "loang;": 10220, "loarr;": 8701, "lobrk;": 10214, "longleftarrow;": 10229, "longleftrightarrow;": 10231, "longmapsto;": 10236, "longrightarrow;": 10230, "looparrowleft;": 8619, "looparrowright;": 8620, "lopar;": 10629, "lopf;": [55349, 56669], "loplus;": 10797, "lotimes;": 10804, "lowast;": 8727, "lowbar;": 95, "loz;": 9674, "lozenge;": 9674, "lozf;": 10731, "lpar;": 40, "lparlt;": 10643, "lrarr;": 8646, "lrcorner;": 8991, "lrhar;": 8651, "lrhard;": 10605, "lrm;": 8206, "lrtri;": 8895, "lsaquo;": 8249, "lscr;": [55349, 56513], "lsh;": 8624, "lsim;": 8818, "lsime;": 10893, "lsimg;": 10895, "lsqb;": 91, "lsquo;": 8216, "lsquor;": 8218, "lstrok;": 322, lt: 60, "lt;": 60, "ltcc;": 10918, "ltcir;": 10873, "ltdot;": 8918, "lthree;": 8907, "ltimes;": 8905, "ltlarr;": 10614, "ltquest;": 10875, "ltrPar;": 10646, "ltri;": 9667, "ltrie;": 8884, "ltrif;": 9666, "lurdshar;": 10570, "luruhar;": 10598, "lvertneqq;": [8808, 65024], "lvnE;": [8808, 65024], "mDDot;": 8762, macr: 175, "macr;": 175, "male;": 9794, "malt;": 10016, "maltese;": 10016, "map;": 8614, "mapsto;": 8614, "mapstodown;": 8615, "mapstoleft;": 8612, "mapstoup;": 8613, "marker;": 9646, "mcomma;": 10793, "mcy;": 1084, "mdash;": 8212, "measuredangle;": 8737, "mfr;": [55349, 56618], "mho;": 8487, micro: 181, "micro;": 181, "mid;": 8739, "midast;": 42, "midcir;": 10992, middot: 183, "middot;": 183, "minus;": 8722, "minusb;": 8863, "minusd;": 8760, "minusdu;": 10794, "mlcp;": 10971, "mldr;": 8230, "mnplus;": 8723, "models;": 8871, "mopf;": [55349, 56670], "mp;": 8723, "mscr;": [55349, 56514], "mstpos;": 8766, "mu;": 956, "multimap;": 8888, "mumap;": 8888, "nGg;": [8921, 824], "nGt;": [8811, 8402], "nGtv;": [8811, 824], "nLeftarrow;": 8653, "nLeftrightarrow;": 8654, "nLl;": [8920, 824], "nLt;": [8810, 8402], "nLtv;": [8810, 824], "nRightarrow;": 8655, "nVDash;": 8879, "nVdash;": 8878, "nabla;": 8711, "nacute;": 324, "nang;": [8736, 8402], "nap;": 8777, "napE;": [10864, 824], "napid;": [8779, 824], "napos;": 329, "napprox;": 8777, "natur;": 9838, "natural;": 9838, "naturals;": 8469, nbsp: 160, "nbsp;": 160, "nbump;": [8782, 824], "nbumpe;": [8783, 824], "ncap;": 10819, "ncaron;": 328, "ncedil;": 326, "ncong;": 8775, "ncongdot;": [10861, 824], "ncup;": 10818, "ncy;": 1085, "ndash;": 8211, "ne;": 8800, "neArr;": 8663, "nearhk;": 10532, "nearr;": 8599, "nearrow;": 8599, "nedot;": [8784, 824], "nequiv;": 8802, "nesear;": 10536, "nesim;": [8770, 824], "nexist;": 8708, "nexists;": 8708, "nfr;": [55349, 56619], "ngE;": [8807, 824], "nge;": 8817, "ngeq;": 8817, "ngeqq;": [8807, 824], "ngeqslant;": [10878, 824], "nges;": [10878, 824], "ngsim;": 8821, "ngt;": 8815, "ngtr;": 8815, "nhArr;": 8654, "nharr;": 8622, "nhpar;": 10994, "ni;": 8715, "nis;": 8956, "nisd;": 8954, "niv;": 8715, "njcy;": 1114, "nlArr;": 8653, "nlE;": [8806, 824], "nlarr;": 8602, "nldr;": 8229, "nle;": 8816, "nleftarrow;": 8602, "nleftrightarrow;": 8622, "nleq;": 8816, "nleqq;": [8806, 824], "nleqslant;": [10877, 824], "nles;": [10877, 824], "nless;": 8814, "nlsim;": 8820, "nlt;": 8814, "nltri;": 8938, "nltrie;": 8940, "nmid;": 8740, "nopf;": [55349, 56671], not: 172, "not;": 172, "notin;": 8713, "notinE;": [8953, 824], "notindot;": [8949, 824], "notinva;": 8713, "notinvb;": 8951, "notinvc;": 8950, "notni;": 8716, "notniva;": 8716, "notnivb;": 8958, "notnivc;": 8957, "npar;": 8742, "nparallel;": 8742, "nparsl;": [11005, 8421], "npart;": [8706, 824], "npolint;": 10772, "npr;": 8832, "nprcue;": 8928, "npre;": [10927, 824], "nprec;": 8832, "npreceq;": [10927, 824], "nrArr;": 8655, "nrarr;": 8603, "nrarrc;": [10547, 824], "nrarrw;": [8605, 824], "nrightarrow;": 8603, "nrtri;": 8939, "nrtrie;": 8941, "nsc;": 8833, "nsccue;": 8929, "nsce;": [10928, 824], "nscr;": [55349, 56515], "nshortmid;": 8740, "nshortparallel;": 8742, "nsim;": 8769, "nsime;": 8772, "nsimeq;": 8772, "nsmid;": 8740, "nspar;": 8742, "nsqsube;": 8930, "nsqsupe;": 8931, "nsub;": 8836, "nsubE;": [10949, 824], "nsube;": 8840, "nsubset;": [8834, 8402], "nsubseteq;": 8840, "nsubseteqq;": [10949, 824], "nsucc;": 8833, "nsucceq;": [10928, 824], "nsup;": 8837, "nsupE;": [10950, 824], "nsupe;": 8841, "nsupset;": [8835, 8402], "nsupseteq;": 8841, "nsupseteqq;": [10950, 824], "ntgl;": 8825, ntilde: 241, "ntilde;": 241, "ntlg;": 8824, "ntriangleleft;": 8938, "ntrianglelefteq;": 8940, "ntriangleright;": 8939, "ntrianglerighteq;": 8941, "nu;": 957, "num;": 35, "numero;": 8470, "numsp;": 8199, "nvDash;": 8877, "nvHarr;": 10500, "nvap;": [8781, 8402], "nvdash;": 8876, "nvge;": [8805, 8402], "nvgt;": [62, 8402], "nvinfin;": 10718, "nvlArr;": 10498, "nvle;": [8804, 8402], "nvlt;": [60, 8402], "nvltrie;": [8884, 8402], "nvrArr;": 10499, "nvrtrie;": [8885, 8402], "nvsim;": [8764, 8402], "nwArr;": 8662, "nwarhk;": 10531, "nwarr;": 8598, "nwarrow;": 8598, "nwnear;": 10535, "oS;": 9416, oacute: 243, "oacute;": 243, "oast;": 8859, "ocir;": 8858, ocirc: 244, "ocirc;": 244, "ocy;": 1086, "odash;": 8861, "odblac;": 337, "odiv;": 10808, "odot;": 8857, "odsold;": 10684, "oelig;": 339, "ofcir;": 10687, "ofr;": [55349, 56620], "ogon;": 731, ograve: 242, "ograve;": 242, "ogt;": 10689, "ohbar;": 10677, "ohm;": 937, "oint;": 8750, "olarr;": 8634, "olcir;": 10686, "olcross;": 10683, "oline;": 8254, "olt;": 10688, "omacr;": 333, "omega;": 969, "omicron;": 959, "omid;": 10678, "ominus;": 8854, "oopf;": [55349, 56672], "opar;": 10679, "operp;": 10681, "oplus;": 8853, "or;": 8744, "orarr;": 8635, "ord;": 10845, "order;": 8500, "orderof;": 8500, ordf: 170, "ordf;": 170, ordm: 186, "ordm;": 186, "origof;": 8886, "oror;": 10838, "orslope;": 10839, "orv;": 10843, "oscr;": 8500, oslash: 248, "oslash;": 248, "osol;": 8856, otilde: 245, "otilde;": 245, "otimes;": 8855, "otimesas;": 10806, ouml: 246, "ouml;": 246, "ovbar;": 9021, "par;": 8741, para: 182, "para;": 182, "parallel;": 8741, "parsim;": 10995, "parsl;": 11005, "part;": 8706, "pcy;": 1087, "percnt;": 37, "period;": 46, "permil;": 8240, "perp;": 8869, "pertenk;": 8241, "pfr;": [55349, 56621], "phi;": 966, "phiv;": 981, "phmmat;": 8499, "phone;": 9742, "pi;": 960, "pitchfork;": 8916, "piv;": 982, "planck;": 8463, "planckh;": 8462, "plankv;": 8463, "plus;": 43, "plusacir;": 10787, "plusb;": 8862, "pluscir;": 10786, "plusdo;": 8724, "plusdu;": 10789, "pluse;": 10866, plusmn: 177, "plusmn;": 177, "plussim;": 10790, "plustwo;": 10791, "pm;": 177, "pointint;": 10773, "popf;": [55349, 56673], pound: 163, "pound;": 163, "pr;": 8826, "prE;": 10931, "prap;": 10935, "prcue;": 8828, "pre;": 10927, "prec;": 8826, "precapprox;": 10935, "preccurlyeq;": 8828, "preceq;": 10927, "precnapprox;": 10937, "precneqq;": 10933, "precnsim;": 8936, "precsim;": 8830, "prime;": 8242, "primes;": 8473, "prnE;": 10933, "prnap;": 10937, "prnsim;": 8936, "prod;": 8719, "profalar;": 9006, "profline;": 8978, "profsurf;": 8979, "prop;": 8733, "propto;": 8733, "prsim;": 8830, "prurel;": 8880, "pscr;": [55349, 56517], "psi;": 968, "puncsp;": 8200, "qfr;": [55349, 56622], "qint;": 10764, "qopf;": [55349, 56674], "qprime;": 8279, "qscr;": [55349, 56518], "quaternions;": 8461, "quatint;": 10774, "quest;": 63, "questeq;": 8799, quot: 34, "quot;": 34, "rAarr;": 8667, "rArr;": 8658, "rAtail;": 10524, "rBarr;": 10511, "rHar;": 10596, "race;": [8765, 817], "racute;": 341, "radic;": 8730, "raemptyv;": 10675, "rang;": 10217, "rangd;": 10642, "range;": 10661, "rangle;": 10217, raquo: 187, "raquo;": 187, "rarr;": 8594, "rarrap;": 10613, "rarrb;": 8677, "rarrbfs;": 10528, "rarrc;": 10547, "rarrfs;": 10526, "rarrhk;": 8618, "rarrlp;": 8620, "rarrpl;": 10565, "rarrsim;": 10612, "rarrtl;": 8611, "rarrw;": 8605, "ratail;": 10522, "ratio;": 8758, "rationals;": 8474, "rbarr;": 10509, "rbbrk;": 10099, "rbrace;": 125, "rbrack;": 93, "rbrke;": 10636, "rbrksld;": 10638, "rbrkslu;": 10640, "rcaron;": 345, "rcedil;": 343, "rceil;": 8969, "rcub;": 125, "rcy;": 1088, "rdca;": 10551, "rdldhar;": 10601, "rdquo;": 8221, "rdquor;": 8221, "rdsh;": 8627, "real;": 8476, "realine;": 8475, "realpart;": 8476, "reals;": 8477, "rect;": 9645, reg: 174, "reg;": 174, "rfisht;": 10621, "rfloor;": 8971, "rfr;": [55349, 56623], "rhard;": 8641, "rharu;": 8640, "rharul;": 10604, "rho;": 961, "rhov;": 1009, "rightarrow;": 8594, "rightarrowtail;": 8611, "rightharpoondown;": 8641, "rightharpoonup;": 8640, "rightleftarrows;": 8644, "rightleftharpoons;": 8652, "rightrightarrows;": 8649, "rightsquigarrow;": 8605, "rightthreetimes;": 8908, "ring;": 730, "risingdotseq;": 8787, "rlarr;": 8644, "rlhar;": 8652, "rlm;": 8207, "rmoust;": 9137, "rmoustache;": 9137, "rnmid;": 10990, "roang;": 10221, "roarr;": 8702, "robrk;": 10215, "ropar;": 10630, "ropf;": [55349, 56675], "roplus;": 10798, "rotimes;": 10805, "rpar;": 41, "rpargt;": 10644, "rppolint;": 10770, "rrarr;": 8649, "rsaquo;": 8250, "rscr;": [55349, 56519], "rsh;": 8625, "rsqb;": 93, "rsquo;": 8217, "rsquor;": 8217, "rthree;": 8908, "rtimes;": 8906, "rtri;": 9657, "rtrie;": 8885, "rtrif;": 9656, "rtriltri;": 10702, "ruluhar;": 10600, "rx;": 8478, "sacute;": 347, "sbquo;": 8218, "sc;": 8827, "scE;": 10932, "scap;": 10936, "scaron;": 353, "sccue;": 8829, "sce;": 10928, "scedil;": 351, "scirc;": 349, "scnE;": 10934, "scnap;": 10938, "scnsim;": 8937, "scpolint;": 10771, "scsim;": 8831, "scy;": 1089, "sdot;": 8901, "sdotb;": 8865, "sdote;": 10854, "seArr;": 8664, "searhk;": 10533, "searr;": 8600, "searrow;": 8600, sect: 167, "sect;": 167, "semi;": 59, "seswar;": 10537, "setminus;": 8726, "setmn;": 8726, "sext;": 10038, "sfr;": [55349, 56624], "sfrown;": 8994, "sharp;": 9839, "shchcy;": 1097, "shcy;": 1096, "shortmid;": 8739, "shortparallel;": 8741, shy: 173, "shy;": 173, "sigma;": 963, "sigmaf;": 962, "sigmav;": 962, "sim;": 8764, "simdot;": 10858, "sime;": 8771, "simeq;": 8771, "simg;": 10910, "simgE;": 10912, "siml;": 10909, "simlE;": 10911, "simne;": 8774, "simplus;": 10788, "simrarr;": 10610, "slarr;": 8592, "smallsetminus;": 8726, "smashp;": 10803, "smeparsl;": 10724, "smid;": 8739, "smile;": 8995, "smt;": 10922, "smte;": 10924, "smtes;": [10924, 65024], "softcy;": 1100, "sol;": 47, "solb;": 10692, "solbar;": 9023, "sopf;": [55349, 56676], "spades;": 9824, "spadesuit;": 9824, "spar;": 8741, "sqcap;": 8851, "sqcaps;": [8851, 65024], "sqcup;": 8852, "sqcups;": [8852, 65024], "sqsub;": 8847, "sqsube;": 8849, "sqsubset;": 8847, "sqsubseteq;": 8849, "sqsup;": 8848, "sqsupe;": 8850, "sqsupset;": 8848, "sqsupseteq;": 8850, "squ;": 9633, "square;": 9633, "squarf;": 9642, "squf;": 9642, "srarr;": 8594, "sscr;": [55349, 56520], "ssetmn;": 8726, "ssmile;": 8995, "sstarf;": 8902, "star;": 9734, "starf;": 9733, "straightepsilon;": 1013, "straightphi;": 981, "strns;": 175, "sub;": 8834, "subE;": 10949, "subdot;": 10941, "sube;": 8838, "subedot;": 10947, "submult;": 10945, "subnE;": 10955, "subne;": 8842, "subplus;": 10943, "subrarr;": 10617, "subset;": 8834, "subseteq;": 8838, "subseteqq;": 10949, "subsetneq;": 8842, "subsetneqq;": 10955, "subsim;": 10951, "subsub;": 10965, "subsup;": 10963, "succ;": 8827, "succapprox;": 10936, "succcurlyeq;": 8829, "succeq;": 10928, "succnapprox;": 10938, "succneqq;": 10934, "succnsim;": 8937, "succsim;": 8831, "sum;": 8721, "sung;": 9834, sup1: 185, "sup1;": 185, sup2: 178, "sup2;": 178, sup3: 179, "sup3;": 179, "sup;": 8835, "supE;": 10950, "supdot;": 10942, "supdsub;": 10968, "supe;": 8839, "supedot;": 10948, "suphsol;": 10185, "suphsub;": 10967, "suplarr;": 10619, "supmult;": 10946, "supnE;": 10956, "supne;": 8843, "supplus;": 10944, "supset;": 8835, "supseteq;": 8839, "supseteqq;": 10950, "supsetneq;": 8843, "supsetneqq;": 10956, "supsim;": 10952, "supsub;": 10964, "supsup;": 10966, "swArr;": 8665, "swarhk;": 10534, "swarr;": 8601, "swarrow;": 8601, "swnwar;": 10538, szlig: 223, "szlig;": 223, "target;": 8982, "tau;": 964, "tbrk;": 9140, "tcaron;": 357, "tcedil;": 355, "tcy;": 1090, "tdot;": 8411, "telrec;": 8981, "tfr;": [55349, 56625], "there4;": 8756, "therefore;": 8756, "theta;": 952, "thetasym;": 977, "thetav;": 977, "thickapprox;": 8776, "thicksim;": 8764, "thinsp;": 8201, "thkap;": 8776, "thksim;": 8764, thorn: 254, "thorn;": 254, "tilde;": 732, times: 215, "times;": 215, "timesb;": 8864, "timesbar;": 10801, "timesd;": 10800, "tint;": 8749, "toea;": 10536, "top;": 8868, "topbot;": 9014, "topcir;": 10993, "topf;": [55349, 56677], "topfork;": 10970, "tosa;": 10537, "tprime;": 8244, "trade;": 8482, "triangle;": 9653, "triangledown;": 9663, "triangleleft;": 9667, "trianglelefteq;": 8884, "triangleq;": 8796, "triangleright;": 9657, "trianglerighteq;": 8885, "tridot;": 9708, "trie;": 8796, "triminus;": 10810, "triplus;": 10809, "trisb;": 10701, "tritime;": 10811, "trpezium;": 9186, "tscr;": [55349, 56521], "tscy;": 1094, "tshcy;": 1115, "tstrok;": 359, "twixt;": 8812, "twoheadleftarrow;": 8606, "twoheadrightarrow;": 8608, "uArr;": 8657, "uHar;": 10595, uacute: 250, "uacute;": 250, "uarr;": 8593, "ubrcy;": 1118, "ubreve;": 365, ucirc: 251, "ucirc;": 251, "ucy;": 1091, "udarr;": 8645, "udblac;": 369, "udhar;": 10606, "ufisht;": 10622, "ufr;": [55349, 56626], ugrave: 249, "ugrave;": 249, "uharl;": 8639, "uharr;": 8638, "uhblk;": 9600, "ulcorn;": 8988, "ulcorner;": 8988, "ulcrop;": 8975, "ultri;": 9720, "umacr;": 363, uml: 168, "uml;": 168, "uogon;": 371, "uopf;": [55349, 56678], "uparrow;": 8593, "updownarrow;": 8597, "upharpoonleft;": 8639, "upharpoonright;": 8638, "uplus;": 8846, "upsi;": 965, "upsih;": 978, "upsilon;": 965, "upuparrows;": 8648, "urcorn;": 8989, "urcorner;": 8989, "urcrop;": 8974, "uring;": 367, "urtri;": 9721, "uscr;": [55349, 56522], "utdot;": 8944, "utilde;": 361, "utri;": 9653, "utrif;": 9652, "uuarr;": 8648, uuml: 252, "uuml;": 252, "uwangle;": 10663, "vArr;": 8661, "vBar;": 10984, "vBarv;": 10985, "vDash;": 8872, "vangrt;": 10652, "varepsilon;": 1013, "varkappa;": 1008, "varnothing;": 8709, "varphi;": 981, "varpi;": 982, "varpropto;": 8733, "varr;": 8597, "varrho;": 1009, "varsigma;": 962, "varsubsetneq;": [8842, 65024], "varsubsetneqq;": [10955, 65024], "varsupsetneq;": [8843, 65024], "varsupsetneqq;": [10956, 65024], "vartheta;": 977, "vartriangleleft;": 8882, "vartriangleright;": 8883, "vcy;": 1074, "vdash;": 8866, "vee;": 8744, "veebar;": 8891, "veeeq;": 8794, "vellip;": 8942, "verbar;": 124, "vert;": 124, "vfr;": [55349, 56627], "vltri;": 8882, "vnsub;": [8834, 8402], "vnsup;": [8835, 8402], "vopf;": [55349, 56679], "vprop;": 8733, "vrtri;": 8883, "vscr;": [55349, 56523], "vsubnE;": [10955, 65024], "vsubne;": [8842, 65024], "vsupnE;": [10956, 65024], "vsupne;": [8843, 65024], "vzigzag;": 10650, "wcirc;": 373, "wedbar;": 10847, "wedge;": 8743, "wedgeq;": 8793, "weierp;": 8472, "wfr;": [55349, 56628], "wopf;": [55349, 56680], "wp;": 8472, "wr;": 8768, "wreath;": 8768, "wscr;": [55349, 56524], "xcap;": 8898, "xcirc;": 9711, "xcup;": 8899, "xdtri;": 9661, "xfr;": [55349, 56629], "xhArr;": 10234, "xharr;": 10231, "xi;": 958, "xlArr;": 10232, "xlarr;": 10229, "xmap;": 10236, "xnis;": 8955, "xodot;": 10752, "xopf;": [55349, 56681], "xoplus;": 10753, "xotime;": 10754, "xrArr;": 10233, "xrarr;": 10230, "xscr;": [55349, 56525], "xsqcup;": 10758, "xuplus;": 10756, "xutri;": 9651, "xvee;": 8897, "xwedge;": 8896, yacute: 253, "yacute;": 253, "yacy;": 1103, "ycirc;": 375, "ycy;": 1099, yen: 165, "yen;": 165, "yfr;": [55349, 56630], "yicy;": 1111, "yopf;": [55349, 56682], "yscr;": [55349, 56526], "yucy;": 1102, yuml: 255, "yuml;": 255, "zacute;": 378, "zcaron;": 382, "zcy;": 1079, "zdot;": 380, "zeetrf;": 8488, "zeta;": 950, "zfr;": [55349, 56631], "zhcy;": 1078, "zigrarr;": 8669, "zopf;": [55349, 56683], "zscr;": [55349, 56527], "zwj;": 8205, "zwnj;": 8204 }, $o = /(A(?:Elig;?|MP;?|acute;?|breve;|c(?:irc;?|y;)|fr;|grave;?|lpha;|macr;|nd;|o(?:gon;|pf;)|pplyFunction;|ring;?|s(?:cr;|sign;)|tilde;?|uml;?)|B(?:a(?:ckslash;|r(?:v;|wed;))|cy;|e(?:cause;|rnoullis;|ta;)|fr;|opf;|reve;|scr;|umpeq;)|C(?:Hcy;|OPY;?|a(?:cute;|p(?:;|italDifferentialD;)|yleys;)|c(?:aron;|edil;?|irc;|onint;)|dot;|e(?:dilla;|nterDot;)|fr;|hi;|ircle(?:Dot;|Minus;|Plus;|Times;)|lo(?:ckwiseContourIntegral;|seCurly(?:DoubleQuote;|Quote;))|o(?:lon(?:;|e;)|n(?:gruent;|int;|tourIntegral;)|p(?:f;|roduct;)|unterClockwiseContourIntegral;)|ross;|scr;|up(?:;|Cap;))|D(?:D(?:;|otrahd;)|Jcy;|Scy;|Zcy;|a(?:gger;|rr;|shv;)|c(?:aron;|y;)|el(?:;|ta;)|fr;|i(?:a(?:critical(?:Acute;|Do(?:t;|ubleAcute;)|Grave;|Tilde;)|mond;)|fferentialD;)|o(?:pf;|t(?:;|Dot;|Equal;)|uble(?:ContourIntegral;|Do(?:t;|wnArrow;)|L(?:eft(?:Arrow;|RightArrow;|Tee;)|ong(?:Left(?:Arrow;|RightArrow;)|RightArrow;))|Right(?:Arrow;|Tee;)|Up(?:Arrow;|DownArrow;)|VerticalBar;)|wn(?:Arrow(?:;|Bar;|UpArrow;)|Breve;|Left(?:RightVector;|TeeVector;|Vector(?:;|Bar;))|Right(?:TeeVector;|Vector(?:;|Bar;))|Tee(?:;|Arrow;)|arrow;))|s(?:cr;|trok;))|E(?:NG;|TH;?|acute;?|c(?:aron;|irc;?|y;)|dot;|fr;|grave;?|lement;|m(?:acr;|pty(?:SmallSquare;|VerySmallSquare;))|o(?:gon;|pf;)|psilon;|qu(?:al(?:;|Tilde;)|ilibrium;)|s(?:cr;|im;)|ta;|uml;?|x(?:ists;|ponentialE;))|F(?:cy;|fr;|illed(?:SmallSquare;|VerySmallSquare;)|o(?:pf;|rAll;|uriertrf;)|scr;)|G(?:Jcy;|T;?|amma(?:;|d;)|breve;|c(?:edil;|irc;|y;)|dot;|fr;|g;|opf;|reater(?:Equal(?:;|Less;)|FullEqual;|Greater;|Less;|SlantEqual;|Tilde;)|scr;|t;)|H(?:ARDcy;|a(?:cek;|t;)|circ;|fr;|ilbertSpace;|o(?:pf;|rizontalLine;)|s(?:cr;|trok;)|ump(?:DownHump;|Equal;))|I(?:Ecy;|Jlig;|Ocy;|acute;?|c(?:irc;?|y;)|dot;|fr;|grave;?|m(?:;|a(?:cr;|ginaryI;)|plies;)|n(?:t(?:;|e(?:gral;|rsection;))|visible(?:Comma;|Times;))|o(?:gon;|pf;|ta;)|scr;|tilde;|u(?:kcy;|ml;?))|J(?:c(?:irc;|y;)|fr;|opf;|s(?:cr;|ercy;)|ukcy;)|K(?:Hcy;|Jcy;|appa;|c(?:edil;|y;)|fr;|opf;|scr;)|L(?:Jcy;|T;?|a(?:cute;|mbda;|ng;|placetrf;|rr;)|c(?:aron;|edil;|y;)|e(?:ft(?:A(?:ngleBracket;|rrow(?:;|Bar;|RightArrow;))|Ceiling;|Do(?:ubleBracket;|wn(?:TeeVector;|Vector(?:;|Bar;)))|Floor;|Right(?:Arrow;|Vector;)|T(?:ee(?:;|Arrow;|Vector;)|riangle(?:;|Bar;|Equal;))|Up(?:DownVector;|TeeVector;|Vector(?:;|Bar;))|Vector(?:;|Bar;)|arrow;|rightarrow;)|ss(?:EqualGreater;|FullEqual;|Greater;|Less;|SlantEqual;|Tilde;))|fr;|l(?:;|eftarrow;)|midot;|o(?:ng(?:Left(?:Arrow;|RightArrow;)|RightArrow;|left(?:arrow;|rightarrow;)|rightarrow;)|pf;|wer(?:LeftArrow;|RightArrow;))|s(?:cr;|h;|trok;)|t;)|M(?:ap;|cy;|e(?:diumSpace;|llintrf;)|fr;|inusPlus;|opf;|scr;|u;)|N(?:Jcy;|acute;|c(?:aron;|edil;|y;)|e(?:gative(?:MediumSpace;|Thi(?:ckSpace;|nSpace;)|VeryThinSpace;)|sted(?:GreaterGreater;|LessLess;)|wLine;)|fr;|o(?:Break;|nBreakingSpace;|pf;|t(?:;|C(?:ongruent;|upCap;)|DoubleVerticalBar;|E(?:lement;|qual(?:;|Tilde;)|xists;)|Greater(?:;|Equal;|FullEqual;|Greater;|Less;|SlantEqual;|Tilde;)|Hump(?:DownHump;|Equal;)|Le(?:ftTriangle(?:;|Bar;|Equal;)|ss(?:;|Equal;|Greater;|Less;|SlantEqual;|Tilde;))|Nested(?:GreaterGreater;|LessLess;)|Precedes(?:;|Equal;|SlantEqual;)|R(?:everseElement;|ightTriangle(?:;|Bar;|Equal;))|S(?:quareSu(?:bset(?:;|Equal;)|perset(?:;|Equal;))|u(?:bset(?:;|Equal;)|cceeds(?:;|Equal;|SlantEqual;|Tilde;)|perset(?:;|Equal;)))|Tilde(?:;|Equal;|FullEqual;|Tilde;)|VerticalBar;))|scr;|tilde;?|u;)|O(?:Elig;|acute;?|c(?:irc;?|y;)|dblac;|fr;|grave;?|m(?:acr;|ega;|icron;)|opf;|penCurly(?:DoubleQuote;|Quote;)|r;|s(?:cr;|lash;?)|ti(?:lde;?|mes;)|uml;?|ver(?:B(?:ar;|rac(?:e;|ket;))|Parenthesis;))|P(?:artialD;|cy;|fr;|hi;|i;|lusMinus;|o(?:incareplane;|pf;)|r(?:;|ecedes(?:;|Equal;|SlantEqual;|Tilde;)|ime;|o(?:duct;|portion(?:;|al;)))|s(?:cr;|i;))|Q(?:UOT;?|fr;|opf;|scr;)|R(?:Barr;|EG;?|a(?:cute;|ng;|rr(?:;|tl;))|c(?:aron;|edil;|y;)|e(?:;|verse(?:E(?:lement;|quilibrium;)|UpEquilibrium;))|fr;|ho;|ight(?:A(?:ngleBracket;|rrow(?:;|Bar;|LeftArrow;))|Ceiling;|Do(?:ubleBracket;|wn(?:TeeVector;|Vector(?:;|Bar;)))|Floor;|T(?:ee(?:;|Arrow;|Vector;)|riangle(?:;|Bar;|Equal;))|Up(?:DownVector;|TeeVector;|Vector(?:;|Bar;))|Vector(?:;|Bar;)|arrow;)|o(?:pf;|undImplies;)|rightarrow;|s(?:cr;|h;)|uleDelayed;)|S(?:H(?:CHcy;|cy;)|OFTcy;|acute;|c(?:;|aron;|edil;|irc;|y;)|fr;|hort(?:DownArrow;|LeftArrow;|RightArrow;|UpArrow;)|igma;|mallCircle;|opf;|q(?:rt;|uare(?:;|Intersection;|Su(?:bset(?:;|Equal;)|perset(?:;|Equal;))|Union;))|scr;|tar;|u(?:b(?:;|set(?:;|Equal;))|c(?:ceeds(?:;|Equal;|SlantEqual;|Tilde;)|hThat;)|m;|p(?:;|erset(?:;|Equal;)|set;)))|T(?:HORN;?|RADE;|S(?:Hcy;|cy;)|a(?:b;|u;)|c(?:aron;|edil;|y;)|fr;|h(?:e(?:refore;|ta;)|i(?:ckSpace;|nSpace;))|ilde(?:;|Equal;|FullEqual;|Tilde;)|opf;|ripleDot;|s(?:cr;|trok;))|U(?:a(?:cute;?|rr(?:;|ocir;))|br(?:cy;|eve;)|c(?:irc;?|y;)|dblac;|fr;|grave;?|macr;|n(?:der(?:B(?:ar;|rac(?:e;|ket;))|Parenthesis;)|ion(?:;|Plus;))|o(?:gon;|pf;)|p(?:Arrow(?:;|Bar;|DownArrow;)|DownArrow;|Equilibrium;|Tee(?:;|Arrow;)|arrow;|downarrow;|per(?:LeftArrow;|RightArrow;)|si(?:;|lon;))|ring;|scr;|tilde;|uml;?)|V(?:Dash;|bar;|cy;|dash(?:;|l;)|e(?:e;|r(?:bar;|t(?:;|ical(?:Bar;|Line;|Separator;|Tilde;))|yThinSpace;))|fr;|opf;|scr;|vdash;)|W(?:circ;|edge;|fr;|opf;|scr;)|X(?:fr;|i;|opf;|scr;)|Y(?:Acy;|Icy;|Ucy;|acute;?|c(?:irc;|y;)|fr;|opf;|scr;|uml;)|Z(?:Hcy;|acute;|c(?:aron;|y;)|dot;|e(?:roWidthSpace;|ta;)|fr;|opf;|scr;)|a(?:acute;?|breve;|c(?:;|E;|d;|irc;?|ute;?|y;)|elig;?|f(?:;|r;)|grave;?|l(?:e(?:fsym;|ph;)|pha;)|m(?:a(?:cr;|lg;)|p;?)|n(?:d(?:;|and;|d;|slope;|v;)|g(?:;|e;|le;|msd(?:;|a(?:a;|b;|c;|d;|e;|f;|g;|h;))|rt(?:;|vb(?:;|d;))|s(?:ph;|t;)|zarr;))|o(?:gon;|pf;)|p(?:;|E;|acir;|e;|id;|os;|prox(?:;|eq;))|ring;?|s(?:cr;|t;|ymp(?:;|eq;))|tilde;?|uml;?|w(?:conint;|int;))|b(?:Not;|a(?:ck(?:cong;|epsilon;|prime;|sim(?:;|eq;))|r(?:vee;|wed(?:;|ge;)))|brk(?:;|tbrk;)|c(?:ong;|y;)|dquo;|e(?:caus(?:;|e;)|mptyv;|psi;|rnou;|t(?:a;|h;|ween;))|fr;|ig(?:c(?:ap;|irc;|up;)|o(?:dot;|plus;|times;)|s(?:qcup;|tar;)|triangle(?:down;|up;)|uplus;|vee;|wedge;)|karow;|l(?:a(?:ck(?:lozenge;|square;|triangle(?:;|down;|left;|right;))|nk;)|k(?:1(?:2;|4;)|34;)|ock;)|n(?:e(?:;|quiv;)|ot;)|o(?:pf;|t(?:;|tom;)|wtie;|x(?:D(?:L;|R;|l;|r;)|H(?:;|D;|U;|d;|u;)|U(?:L;|R;|l;|r;)|V(?:;|H;|L;|R;|h;|l;|r;)|box;|d(?:L;|R;|l;|r;)|h(?:;|D;|U;|d;|u;)|minus;|plus;|times;|u(?:L;|R;|l;|r;)|v(?:;|H;|L;|R;|h;|l;|r;)))|prime;|r(?:eve;|vbar;?)|s(?:cr;|emi;|im(?:;|e;)|ol(?:;|b;|hsub;))|u(?:ll(?:;|et;)|mp(?:;|E;|e(?:;|q;))))|c(?:a(?:cute;|p(?:;|and;|brcup;|c(?:ap;|up;)|dot;|s;)|r(?:et;|on;))|c(?:a(?:ps;|ron;)|edil;?|irc;|ups(?:;|sm;))|dot;|e(?:dil;?|mptyv;|nt(?:;|erdot;|))|fr;|h(?:cy;|eck(?:;|mark;)|i;)|ir(?:;|E;|c(?:;|eq;|le(?:arrow(?:left;|right;)|d(?:R;|S;|ast;|circ;|dash;)))|e;|fnint;|mid;|scir;)|lubs(?:;|uit;)|o(?:lon(?:;|e(?:;|q;))|m(?:ma(?:;|t;)|p(?:;|fn;|le(?:ment;|xes;)))|n(?:g(?:;|dot;)|int;)|p(?:f;|rod;|y(?:;|sr;|)))|r(?:arr;|oss;)|s(?:cr;|u(?:b(?:;|e;)|p(?:;|e;)))|tdot;|u(?:darr(?:l;|r;)|e(?:pr;|sc;)|larr(?:;|p;)|p(?:;|brcap;|c(?:ap;|up;)|dot;|or;|s;)|r(?:arr(?:;|m;)|ly(?:eq(?:prec;|succ;)|vee;|wedge;)|ren;?|vearrow(?:left;|right;))|vee;|wed;)|w(?:conint;|int;)|ylcty;)|d(?:Arr;|Har;|a(?:gger;|leth;|rr;|sh(?:;|v;))|b(?:karow;|lac;)|c(?:aron;|y;)|d(?:;|a(?:gger;|rr;)|otseq;)|e(?:g;?|lta;|mptyv;)|f(?:isht;|r;)|har(?:l;|r;)|i(?:am(?:;|ond(?:;|suit;)|s;)|e;|gamma;|sin;|v(?:;|ide(?:;|ontimes;|)|onx;))|jcy;|lc(?:orn;|rop;)|o(?:llar;|pf;|t(?:;|eq(?:;|dot;)|minus;|plus;|square;)|ublebarwedge;|wn(?:arrow;|downarrows;|harpoon(?:left;|right;)))|r(?:bkarow;|c(?:orn;|rop;))|s(?:c(?:r;|y;)|ol;|trok;)|t(?:dot;|ri(?:;|f;))|u(?:arr;|har;)|wangle;|z(?:cy;|igrarr;))|e(?:D(?:Dot;|ot;)|a(?:cute;?|ster;)|c(?:aron;|ir(?:;|c;?)|olon;|y;)|dot;|e;|f(?:Dot;|r;)|g(?:;|rave;?|s(?:;|dot;))|l(?:;|inters;|l;|s(?:;|dot;))|m(?:acr;|pty(?:;|set;|v;)|sp(?:1(?:3;|4;)|;))|n(?:g;|sp;)|o(?:gon;|pf;)|p(?:ar(?:;|sl;)|lus;|si(?:;|lon;|v;))|q(?:c(?:irc;|olon;)|s(?:im;|lant(?:gtr;|less;))|u(?:als;|est;|iv(?:;|DD;))|vparsl;)|r(?:Dot;|arr;)|s(?:cr;|dot;|im;)|t(?:a;|h;?)|u(?:ml;?|ro;)|x(?:cl;|ist;|p(?:ectation;|onentiale;)))|f(?:allingdotseq;|cy;|emale;|f(?:ilig;|l(?:ig;|lig;)|r;)|ilig;|jlig;|l(?:at;|lig;|tns;)|nof;|o(?:pf;|r(?:all;|k(?:;|v;)))|partint;|r(?:a(?:c(?:1(?:2;?|3;|4;?|5;|6;|8;)|2(?:3;|5;)|3(?:4;?|5;|8;)|45;|5(?:6;|8;)|78;)|sl;)|own;)|scr;)|g(?:E(?:;|l;)|a(?:cute;|mma(?:;|d;)|p;)|breve;|c(?:irc;|y;)|dot;|e(?:;|l;|q(?:;|q;|slant;)|s(?:;|cc;|dot(?:;|o(?:;|l;))|l(?:;|es;)))|fr;|g(?:;|g;)|imel;|jcy;|l(?:;|E;|a;|j;)|n(?:E;|ap(?:;|prox;)|e(?:;|q(?:;|q;))|sim;)|opf;|rave;|s(?:cr;|im(?:;|e;|l;))|t(?:;|c(?:c;|ir;)|dot;|lPar;|quest;|r(?:a(?:pprox;|rr;)|dot;|eq(?:less;|qless;)|less;|sim;)|)|v(?:ertneqq;|nE;))|h(?:Arr;|a(?:irsp;|lf;|milt;|r(?:dcy;|r(?:;|cir;|w;)))|bar;|circ;|e(?:arts(?:;|uit;)|llip;|rcon;)|fr;|ks(?:earow;|warow;)|o(?:arr;|mtht;|ok(?:leftarrow;|rightarrow;)|pf;|rbar;)|s(?:cr;|lash;|trok;)|y(?:bull;|phen;))|i(?:acute;?|c(?:;|irc;?|y;)|e(?:cy;|xcl;?)|f(?:f;|r;)|grave;?|i(?:;|i(?:int;|nt;)|nfin;|ota;)|jlig;|m(?:a(?:cr;|g(?:e;|line;|part;)|th;)|of;|ped;)|n(?:;|care;|fin(?:;|tie;)|odot;|t(?:;|cal;|e(?:gers;|rcal;)|larhk;|prod;))|o(?:cy;|gon;|pf;|ta;)|prod;|quest;?|s(?:cr;|in(?:;|E;|dot;|s(?:;|v;)|v;))|t(?:;|ilde;)|u(?:kcy;|ml;?))|j(?:c(?:irc;|y;)|fr;|math;|opf;|s(?:cr;|ercy;)|ukcy;)|k(?:appa(?:;|v;)|c(?:edil;|y;)|fr;|green;|hcy;|jcy;|opf;|scr;)|l(?:A(?:arr;|rr;|tail;)|Barr;|E(?:;|g;)|Har;|a(?:cute;|emptyv;|gran;|mbda;|ng(?:;|d;|le;)|p;|quo;?|rr(?:;|b(?:;|fs;)|fs;|hk;|lp;|pl;|sim;|tl;)|t(?:;|ail;|e(?:;|s;)))|b(?:arr;|brk;|r(?:ac(?:e;|k;)|k(?:e;|sl(?:d;|u;))))|c(?:aron;|e(?:dil;|il;)|ub;|y;)|d(?:ca;|quo(?:;|r;)|r(?:dhar;|ushar;)|sh;)|e(?:;|ft(?:arrow(?:;|tail;)|harpoon(?:down;|up;)|leftarrows;|right(?:arrow(?:;|s;)|harpoons;|squigarrow;)|threetimes;)|g;|q(?:;|q;|slant;)|s(?:;|cc;|dot(?:;|o(?:;|r;))|g(?:;|es;)|s(?:approx;|dot;|eq(?:gtr;|qgtr;)|gtr;|sim;)))|f(?:isht;|loor;|r;)|g(?:;|E;)|h(?:ar(?:d;|u(?:;|l;))|blk;)|jcy;|l(?:;|arr;|corner;|hard;|tri;)|m(?:idot;|oust(?:;|ache;))|n(?:E;|ap(?:;|prox;)|e(?:;|q(?:;|q;))|sim;)|o(?:a(?:ng;|rr;)|brk;|ng(?:left(?:arrow;|rightarrow;)|mapsto;|rightarrow;)|oparrow(?:left;|right;)|p(?:ar;|f;|lus;)|times;|w(?:ast;|bar;)|z(?:;|enge;|f;))|par(?:;|lt;)|r(?:arr;|corner;|har(?:;|d;)|m;|tri;)|s(?:aquo;|cr;|h;|im(?:;|e;|g;)|q(?:b;|uo(?:;|r;))|trok;)|t(?:;|c(?:c;|ir;)|dot;|hree;|imes;|larr;|quest;|r(?:Par;|i(?:;|e;|f;))|)|ur(?:dshar;|uhar;)|v(?:ertneqq;|nE;))|m(?:DDot;|a(?:cr;?|l(?:e;|t(?:;|ese;))|p(?:;|sto(?:;|down;|left;|up;))|rker;)|c(?:omma;|y;)|dash;|easuredangle;|fr;|ho;|i(?:cro;?|d(?:;|ast;|cir;|dot;?)|nus(?:;|b;|d(?:;|u;)))|l(?:cp;|dr;)|nplus;|o(?:dels;|pf;)|p;|s(?:cr;|tpos;)|u(?:;|ltimap;|map;))|n(?:G(?:g;|t(?:;|v;))|L(?:eft(?:arrow;|rightarrow;)|l;|t(?:;|v;))|Rightarrow;|V(?:Dash;|dash;)|a(?:bla;|cute;|ng;|p(?:;|E;|id;|os;|prox;)|tur(?:;|al(?:;|s;)))|b(?:sp;?|ump(?:;|e;))|c(?:a(?:p;|ron;)|edil;|ong(?:;|dot;)|up;|y;)|dash;|e(?:;|Arr;|ar(?:hk;|r(?:;|ow;))|dot;|quiv;|s(?:ear;|im;)|xist(?:;|s;))|fr;|g(?:E;|e(?:;|q(?:;|q;|slant;)|s;)|sim;|t(?:;|r;))|h(?:Arr;|arr;|par;)|i(?:;|s(?:;|d;)|v;)|jcy;|l(?:Arr;|E;|arr;|dr;|e(?:;|ft(?:arrow;|rightarrow;)|q(?:;|q;|slant;)|s(?:;|s;))|sim;|t(?:;|ri(?:;|e;)))|mid;|o(?:pf;|t(?:;|in(?:;|E;|dot;|v(?:a;|b;|c;))|ni(?:;|v(?:a;|b;|c;))|))|p(?:ar(?:;|allel;|sl;|t;)|olint;|r(?:;|cue;|e(?:;|c(?:;|eq;))))|r(?:Arr;|arr(?:;|c;|w;)|ightarrow;|tri(?:;|e;))|s(?:c(?:;|cue;|e;|r;)|hort(?:mid;|parallel;)|im(?:;|e(?:;|q;))|mid;|par;|qsu(?:be;|pe;)|u(?:b(?:;|E;|e;|set(?:;|eq(?:;|q;)))|cc(?:;|eq;)|p(?:;|E;|e;|set(?:;|eq(?:;|q;)))))|t(?:gl;|ilde;?|lg;|riangle(?:left(?:;|eq;)|right(?:;|eq;)))|u(?:;|m(?:;|ero;|sp;))|v(?:Dash;|Harr;|ap;|dash;|g(?:e;|t;)|infin;|l(?:Arr;|e;|t(?:;|rie;))|r(?:Arr;|trie;)|sim;)|w(?:Arr;|ar(?:hk;|r(?:;|ow;))|near;))|o(?:S;|a(?:cute;?|st;)|c(?:ir(?:;|c;?)|y;)|d(?:ash;|blac;|iv;|ot;|sold;)|elig;|f(?:cir;|r;)|g(?:on;|rave;?|t;)|h(?:bar;|m;)|int;|l(?:arr;|c(?:ir;|ross;)|ine;|t;)|m(?:acr;|ega;|i(?:cron;|d;|nus;))|opf;|p(?:ar;|erp;|lus;)|r(?:;|arr;|d(?:;|er(?:;|of;)|f;?|m;?)|igof;|or;|slope;|v;)|s(?:cr;|lash;?|ol;)|ti(?:lde;?|mes(?:;|as;))|uml;?|vbar;)|p(?:ar(?:;|a(?:;|llel;|)|s(?:im;|l;)|t;)|cy;|er(?:cnt;|iod;|mil;|p;|tenk;)|fr;|h(?:i(?:;|v;)|mmat;|one;)|i(?:;|tchfork;|v;)|l(?:an(?:ck(?:;|h;)|kv;)|us(?:;|acir;|b;|cir;|d(?:o;|u;)|e;|mn;?|sim;|two;))|m;|o(?:intint;|pf;|und;?)|r(?:;|E;|ap;|cue;|e(?:;|c(?:;|approx;|curlyeq;|eq;|n(?:approx;|eqq;|sim;)|sim;))|ime(?:;|s;)|n(?:E;|ap;|sim;)|o(?:d;|f(?:alar;|line;|surf;)|p(?:;|to;))|sim;|urel;)|s(?:cr;|i;)|uncsp;)|q(?:fr;|int;|opf;|prime;|scr;|u(?:at(?:ernions;|int;)|est(?:;|eq;)|ot;?))|r(?:A(?:arr;|rr;|tail;)|Barr;|Har;|a(?:c(?:e;|ute;)|dic;|emptyv;|ng(?:;|d;|e;|le;)|quo;?|rr(?:;|ap;|b(?:;|fs;)|c;|fs;|hk;|lp;|pl;|sim;|tl;|w;)|t(?:ail;|io(?:;|nals;)))|b(?:arr;|brk;|r(?:ac(?:e;|k;)|k(?:e;|sl(?:d;|u;))))|c(?:aron;|e(?:dil;|il;)|ub;|y;)|d(?:ca;|ldhar;|quo(?:;|r;)|sh;)|e(?:al(?:;|ine;|part;|s;)|ct;|g;?)|f(?:isht;|loor;|r;)|h(?:ar(?:d;|u(?:;|l;))|o(?:;|v;))|i(?:ght(?:arrow(?:;|tail;)|harpoon(?:down;|up;)|left(?:arrows;|harpoons;)|rightarrows;|squigarrow;|threetimes;)|ng;|singdotseq;)|l(?:arr;|har;|m;)|moust(?:;|ache;)|nmid;|o(?:a(?:ng;|rr;)|brk;|p(?:ar;|f;|lus;)|times;)|p(?:ar(?:;|gt;)|polint;)|rarr;|s(?:aquo;|cr;|h;|q(?:b;|uo(?:;|r;)))|t(?:hree;|imes;|ri(?:;|e;|f;|ltri;))|uluhar;|x;)|s(?:acute;|bquo;|c(?:;|E;|a(?:p;|ron;)|cue;|e(?:;|dil;)|irc;|n(?:E;|ap;|sim;)|polint;|sim;|y;)|dot(?:;|b;|e;)|e(?:Arr;|ar(?:hk;|r(?:;|ow;))|ct;?|mi;|swar;|tm(?:inus;|n;)|xt;)|fr(?:;|own;)|h(?:arp;|c(?:hcy;|y;)|ort(?:mid;|parallel;)|y;?)|i(?:gma(?:;|f;|v;)|m(?:;|dot;|e(?:;|q;)|g(?:;|E;)|l(?:;|E;)|ne;|plus;|rarr;))|larr;|m(?:a(?:llsetminus;|shp;)|eparsl;|i(?:d;|le;)|t(?:;|e(?:;|s;)))|o(?:ftcy;|l(?:;|b(?:;|ar;))|pf;)|pa(?:des(?:;|uit;)|r;)|q(?:c(?:ap(?:;|s;)|up(?:;|s;))|su(?:b(?:;|e;|set(?:;|eq;))|p(?:;|e;|set(?:;|eq;)))|u(?:;|ar(?:e;|f;)|f;))|rarr;|s(?:cr;|etmn;|mile;|tarf;)|t(?:ar(?:;|f;)|r(?:aight(?:epsilon;|phi;)|ns;))|u(?:b(?:;|E;|dot;|e(?:;|dot;)|mult;|n(?:E;|e;)|plus;|rarr;|s(?:et(?:;|eq(?:;|q;)|neq(?:;|q;))|im;|u(?:b;|p;)))|cc(?:;|approx;|curlyeq;|eq;|n(?:approx;|eqq;|sim;)|sim;)|m;|ng;|p(?:1;?|2;?|3;?|;|E;|d(?:ot;|sub;)|e(?:;|dot;)|hs(?:ol;|ub;)|larr;|mult;|n(?:E;|e;)|plus;|s(?:et(?:;|eq(?:;|q;)|neq(?:;|q;))|im;|u(?:b;|p;))))|w(?:Arr;|ar(?:hk;|r(?:;|ow;))|nwar;)|zlig;?)|t(?:a(?:rget;|u;)|brk;|c(?:aron;|edil;|y;)|dot;|elrec;|fr;|h(?:e(?:re(?:4;|fore;)|ta(?:;|sym;|v;))|i(?:ck(?:approx;|sim;)|nsp;)|k(?:ap;|sim;)|orn;?)|i(?:lde;|mes(?:;|b(?:;|ar;)|d;|)|nt;)|o(?:ea;|p(?:;|bot;|cir;|f(?:;|ork;))|sa;)|prime;|r(?:ade;|i(?:angle(?:;|down;|left(?:;|eq;)|q;|right(?:;|eq;))|dot;|e;|minus;|plus;|sb;|time;)|pezium;)|s(?:c(?:r;|y;)|hcy;|trok;)|w(?:ixt;|ohead(?:leftarrow;|rightarrow;)))|u(?:Arr;|Har;|a(?:cute;?|rr;)|br(?:cy;|eve;)|c(?:irc;?|y;)|d(?:arr;|blac;|har;)|f(?:isht;|r;)|grave;?|h(?:ar(?:l;|r;)|blk;)|l(?:c(?:orn(?:;|er;)|rop;)|tri;)|m(?:acr;|l;?)|o(?:gon;|pf;)|p(?:arrow;|downarrow;|harpoon(?:left;|right;)|lus;|si(?:;|h;|lon;)|uparrows;)|r(?:c(?:orn(?:;|er;)|rop;)|ing;|tri;)|scr;|t(?:dot;|ilde;|ri(?:;|f;))|u(?:arr;|ml;?)|wangle;)|v(?:Arr;|Bar(?:;|v;)|Dash;|a(?:ngrt;|r(?:epsilon;|kappa;|nothing;|p(?:hi;|i;|ropto;)|r(?:;|ho;)|s(?:igma;|u(?:bsetneq(?:;|q;)|psetneq(?:;|q;)))|t(?:heta;|riangle(?:left;|right;))))|cy;|dash;|e(?:e(?:;|bar;|eq;)|llip;|r(?:bar;|t;))|fr;|ltri;|nsu(?:b;|p;)|opf;|prop;|rtri;|s(?:cr;|u(?:bn(?:E;|e;)|pn(?:E;|e;)))|zigzag;)|w(?:circ;|e(?:d(?:bar;|ge(?:;|q;))|ierp;)|fr;|opf;|p;|r(?:;|eath;)|scr;)|x(?:c(?:ap;|irc;|up;)|dtri;|fr;|h(?:Arr;|arr;)|i;|l(?:Arr;|arr;)|map;|nis;|o(?:dot;|p(?:f;|lus;)|time;)|r(?:Arr;|arr;)|s(?:cr;|qcup;)|u(?:plus;|tri;)|vee;|wedge;)|y(?:ac(?:ute;?|y;)|c(?:irc;|y;)|en;?|fr;|icy;|opf;|scr;|u(?:cy;|ml;?))|z(?:acute;|c(?:aron;|y;)|dot;|e(?:etrf;|ta;)|fr;|hcy;|igrarr;|opf;|scr;|w(?:j;|nj;)))|[\s\S]/g, N0 = 32, C0 = /[^\r"&\u0000]+/g, A0 = /[^\r'&\u0000]+/g, L0 = /[^\r\t\n\f &>\u0000]+/g, D0 = /[^\r\t\n\f \/>A-Z\u0000]+/g, R0 = /[^\r\t\n\f \/=>A-Z\u0000]+/g, M0 = /[^\]\r\u0000\uffff]*/g, I0 = /[^&<\r\u0000\uffff]*/g, Ko = /[^<\r\u0000\uffff]*/g, O0 = /[^\r\u0000\uffff]*/g, Xo = /(?:(\/)?([a-z]+)>)|[\s\S]/g, Qo = /(?:([-a-z]+)[ \t\n\f]*=[ \t\n\f]*('[^'&\r\u0000]*'|"[^"&\r\u0000]*"|[^\t\n\r\f "&'\u0000>][^&> \t\n\r\f\u0000]*[ \t\n\f]))|[\s\S]/g, vn = /[^\x09\x0A\x0C\x0D\x20]/, ni = /[^\x09\x0A\x0C\x0D\x20]/g, q0 = /[^\x00\x09\x0A\x0C\x0D\x20]/, Ht = /^[\x09\x0A\x0C\x0D\x20]+/, yn = /\x00/g;
  function Ne(e) {
    var t = 16384;
    if (e.length < t)
      return String.fromCharCode.apply(String, e);
    for (var r = "", n = 0; n < e.length; n += t)
      r += String.fromCharCode.apply(String, e.slice(n, n + t));
    return r;
  }
  function F0(e) {
    for (var t = [], r = 0; r < e.length; r++)
      t[r] = e.charCodeAt(r);
    return t;
  }
  function te(e, t) {
    if (typeof t == "string")
      return e.namespaceURI === q.HTML && e.localName === t;
    var r = t[e.namespaceURI];
    return r && r[e.localName];
  }
  function Zo(e) {
    return te(e, Vo);
  }
  function Jo(e) {
    if (te(e, zo))
      return true;
    if (e.namespaceURI === q.MATHML && e.localName === "annotation-xml") {
      var t = e.getAttribute("encoding");
      if (t && (t = t.toLowerCase()), t === "text/html" || t === "application/xhtml+xml")
        return true;
    }
    return false;
  }
  function H0(e) {
    return e in Go ? Go[e] : e;
  }
  function ec(e) {
    for (var t = 0, r = e.length; t < r; t++)
      e[t][0] in Wo && (e[t][0] = Wo[e[t][0]]);
  }
  function tc(e) {
    for (var t = 0, r = e.length; t < r; t++)
      if (e[t][0] === "definitionurl") {
        e[t][0] = "definitionURL";
        break;
      }
  }
  function ai(e) {
    for (var t = 0, r = e.length; t < r; t++)
      e[t][0] in jo && e[t].push(jo[e[t][0]]);
  }
  function rc(e, t) {
    for (var r = 0, n = e.length; r < n; r++) {
      var l = e[r][0], f = e[r][1];
      t.hasAttribute(l) || t._setAttribute(l, f);
    }
  }
  Y.ElementStack = function() {
    this.elements = [], this.top = null;
  };
  Y.ElementStack.prototype.push = function(e) {
    this.elements.push(e), this.top = e;
  };
  Y.ElementStack.prototype.pop = function(e) {
    this.elements.pop(), this.top = this.elements[this.elements.length - 1];
  };
  Y.ElementStack.prototype.popTag = function(e) {
    for (var t = this.elements.length - 1; t > 0; t--) {
      var r = this.elements[t];
      if (te(r, e))
        break;
    }
    this.elements.length = t, this.top = this.elements[t - 1];
  };
  Y.ElementStack.prototype.popElementType = function(e) {
    for (var t = this.elements.length - 1; t > 0 && !(this.elements[t] instanceof e); t--)
      ;
    this.elements.length = t, this.top = this.elements[t - 1];
  };
  Y.ElementStack.prototype.popElement = function(e) {
    for (var t = this.elements.length - 1; t > 0 && this.elements[t] !== e; t--)
      ;
    this.elements.length = t, this.top = this.elements[t - 1];
  };
  Y.ElementStack.prototype.removeElement = function(e) {
    if (this.top === e)
      this.pop();
    else {
      var t = this.elements.lastIndexOf(e);
      t !== -1 && this.elements.splice(t, 1);
    }
  };
  Y.ElementStack.prototype.clearToContext = function(e) {
    for (var t = this.elements.length - 1; t > 0 && !te(this.elements[t], e); t--)
      ;
    this.elements.length = t + 1, this.top = this.elements[t];
  };
  Y.ElementStack.prototype.contains = function(e) {
    return this.inSpecificScope(e, Object.create(null));
  };
  Y.ElementStack.prototype.inSpecificScope = function(e, t) {
    for (var r = this.elements.length - 1; r >= 0; r--) {
      var n = this.elements[r];
      if (te(n, e))
        return true;
      if (te(n, t))
        return false;
    }
    return false;
  };
  Y.ElementStack.prototype.elementInSpecificScope = function(e, t) {
    for (var r = this.elements.length - 1; r >= 0; r--) {
      var n = this.elements[r];
      if (n === e)
        return true;
      if (te(n, t))
        return false;
    }
    return false;
  };
  Y.ElementStack.prototype.elementTypeInSpecificScope = function(e, t) {
    for (var r = this.elements.length - 1; r >= 0; r--) {
      var n = this.elements[r];
      if (n instanceof e)
        return true;
      if (te(n, t))
        return false;
    }
    return false;
  };
  Y.ElementStack.prototype.inScope = function(e) {
    return this.inSpecificScope(e, nt);
  };
  Y.ElementStack.prototype.elementInScope = function(e) {
    return this.elementInSpecificScope(e, nt);
  };
  Y.ElementStack.prototype.elementTypeInScope = function(e) {
    return this.elementTypeInSpecificScope(e, nt);
  };
  Y.ElementStack.prototype.inButtonScope = function(e) {
    return this.inSpecificScope(e, ri);
  };
  Y.ElementStack.prototype.inListItemScope = function(e) {
    return this.inSpecificScope(e, En);
  };
  Y.ElementStack.prototype.inTableScope = function(e) {
    return this.inSpecificScope(e, Uo);
  };
  Y.ElementStack.prototype.inSelectScope = function(e) {
    for (var t = this.elements.length - 1; t >= 0; t--) {
      var r = this.elements[t];
      if (r.namespaceURI !== q.HTML)
        return false;
      var n = r.localName;
      if (n === e)
        return true;
      if (n !== "optgroup" && n !== "option")
        return false;
    }
    return false;
  };
  Y.ElementStack.prototype.generateImpliedEndTags = function(e, t) {
    for (var r = t ? Po : Ho, n = this.elements.length - 1; n >= 0; n--) {
      var l = this.elements[n];
      if (e && te(l, e) || !te(this.elements[n], r))
        break;
    }
    this.elements.length = n + 1, this.top = this.elements[n];
  };
  Y.ActiveFormattingElements = function() {
    this.list = [], this.attrs = [];
  };
  Y.ActiveFormattingElements.prototype.MARKER = { localName: "|" };
  Y.ActiveFormattingElements.prototype.insertMarker = function() {
    this.list.push(this.MARKER), this.attrs.push(this.MARKER);
  };
  Y.ActiveFormattingElements.prototype.push = function(e, t) {
    for (var r = 0, n = this.list.length - 1; n >= 0 && this.list[n] !== this.MARKER; n--)
      if (_(e, this.list[n], this.attrs[n]) && (r++, r === 3)) {
        this.list.splice(n, 1), this.attrs.splice(n, 1);
        break;
      }
    this.list.push(e);
    for (var l = [], f = 0; f < t.length; f++)
      l[f] = t[f];
    this.attrs.push(l);
    function _(y, T, S) {
      if (y.localName !== T.localName || y._numattrs !== S.length)
        return false;
      for (var D = 0, ae = S.length; D < ae; D++) {
        var ce = S[D][0], g = S[D][1];
        if (!y.hasAttribute(ce) || y.getAttribute(ce) !== g)
          return false;
      }
      return true;
    }
  };
  Y.ActiveFormattingElements.prototype.clearToMarker = function() {
    for (var e = this.list.length - 1; e >= 0 && this.list[e] !== this.MARKER; e--)
      ;
    e < 0 && (e = 0), this.list.length = e, this.attrs.length = e;
  };
  Y.ActiveFormattingElements.prototype.findElementByTag = function(e) {
    for (var t = this.list.length - 1; t >= 0; t--) {
      var r = this.list[t];
      if (r === this.MARKER)
        break;
      if (r.localName === e)
        return r;
    }
    return null;
  };
  Y.ActiveFormattingElements.prototype.indexOf = function(e) {
    return this.list.lastIndexOf(e);
  };
  Y.ActiveFormattingElements.prototype.remove = function(e) {
    var t = this.list.lastIndexOf(e);
    t !== -1 && (this.list.splice(t, 1), this.attrs.splice(t, 1));
  };
  Y.ActiveFormattingElements.prototype.replace = function(e, t, r) {
    var n = this.list.lastIndexOf(e);
    n !== -1 && (this.list[n] = t, this.attrs[n] = r);
  };
  Y.ActiveFormattingElements.prototype.insertAfter = function(e, t) {
    var r = this.list.lastIndexOf(e);
    r !== -1 && (this.list.splice(r, 0, t), this.attrs.splice(r, 0, t));
  };
  function Y(e, t, r) {
    var n = null, l = 0, f = 0, _ = false, y = false, T = 0, S = [], D = "", ae = true, ce = 0, g = j, re, $, V = "", ve = "", U = [], ie = "", be = "", ne = [], Oe = [], qe = [], Le = [], De = [], ft = false, k = wl, Fe = null, je = [], p = new Y.ElementStack(), d = new Y.ActiveFormattingElements(), Xe = t !== void 0, se = null, A = null, c = true;
    t && (c = t.ownerDocument._scripting_enabled), r && r.scripting_enabled === false && (c = false);
    var h = true, m = false, a, o, u = [], b = false, w = false, I = { document: function() {
      return L;
    }, _asDocumentFragment: function() {
      for (var i = L.createDocumentFragment(), s = L.firstChild; s.hasChildNodes(); )
        i.appendChild(s.firstChild);
      return i;
    }, pause: function() {
      ce++;
    }, resume: function() {
      ce--, this.parse("");
    }, parse: function(i, s, x) {
      var E;
      return ce > 0 ? (D += i, true) : (T === 0 ? (D && (i = D + i, D = ""), s && (i += "\uFFFF", _ = true), n = i, l = i.length, f = 0, ae && (ae = false, n.charCodeAt(0) === 65279 && (f = 1)), T++, E = dt(x), D = n.substring(f, l), T--) : (T++, S.push(n, l, f), n = i, l = i.length, f = 0, dt(), E = false, D = n.substring(f, l), f = S.pop(), l = S.pop(), n = S.pop(), D && (n = D + n.substring(f), l = n.length, f = 0, D = ""), T--), E);
    } }, L = new b0(true, e);
    if (L._parser = I, L._scripting_enabled = c, t) {
      if (t.ownerDocument._quirks && (L._quirks = true), t.ownerDocument._limitedQuirks && (L._limitedQuirks = true), t.namespaceURI === q.HTML)
        switch (t.localName) {
          case "title":
          case "textarea":
            g = pt;
            break;
          case "style":
          case "xmp":
          case "iframe":
          case "noembed":
          case "noframes":
          case "script":
          case "plaintext":
            g = Or;
            break;
          case "noscript":
            c && (g = Or);
        }
      var oe = L.createElement("html");
      L._appendChild(oe), p.push(oe), t instanceof ee.HTMLTemplateElement && je.push(Gn), or();
      for (var We = t; We !== null; We = We.parentElement)
        if (We instanceof ee.HTMLFormElement) {
          A = We;
          break;
        }
    }
    function dt(i) {
      for (var s, x, E, v; f < l; ) {
        if (ce > 0 || i && i())
          return true;
        switch (typeof g.lookahead) {
          case "undefined":
            if (s = n.charCodeAt(f++), y && (y = false, s === 10)) {
              f++;
              continue;
            }
            switch (s) {
              case 13:
                f < l ? n.charCodeAt(f) === 10 && f++ : y = true, g(10);
                break;
              case 65535:
                if (_ && f === l) {
                  g(gn);
                  break;
                }
              default:
                g(s);
                break;
            }
            break;
          case "number":
            s = n.charCodeAt(f);
            var N = g.lookahead, H = true;
            if (N < 0 && (H = false, N = -N), N < l - f)
              x = H ? n.substring(f, f + N) : null, v = false;
            else if (_)
              x = H ? n.substring(f, l) : null, v = true, s === 65535 && f === l - 1 && (s = gn);
            else
              return true;
            g(s, x, v);
            break;
          case "string":
            s = n.charCodeAt(f), E = g.lookahead;
            var W = n.indexOf(E, f);
            if (W !== -1)
              x = n.substring(f, W + E.length), v = false;
            else {
              if (!_)
                return true;
              x = n.substring(f, l), s === 65535 && f === l - 1 && (s = gn), v = true;
            }
            g(s, x, v);
            break;
        }
      }
      return false;
    }
    function He(i, s) {
      for (var x = 0; x < De.length; x++)
        if (De[x][0] === i)
          return;
      s !== void 0 ? De.push([i, s]) : De.push([i]);
    }
    function kt() {
      Qo.lastIndex = f - 1;
      var i = Qo.exec(n);
      if (!i)
        throw new Error("should never happen");
      var s = i[1];
      if (!s)
        return false;
      var x = i[2], E = x.length;
      switch (x[0]) {
        case '"':
        case "'":
          x = x.substring(1, E - 1), f += i[0].length - 1, g = Bn;
          break;
        default:
          g = et, f += i[0].length - 1, x = x.substring(0, E - 1);
          break;
      }
      for (var v = 0; v < De.length; v++)
        if (De[v][0] === s)
          return true;
      return De.push([s, x]), true;
    }
    function Cc() {
      ft = false, V = "", De.length = 0;
    }
    function nr() {
      ft = true, V = "", De.length = 0;
    }
    function at() {
      U.length = 0;
    }
    function Mn() {
      ie = "";
    }
    function In() {
      be = "";
    }
    function hi() {
      ne.length = 0;
    }
    function Bt() {
      Oe.length = 0, qe = null, Le = null;
    }
    function Dr() {
      qe = [];
    }
    function ht() {
      Le = [];
    }
    function X() {
      m = true;
    }
    function Ac() {
      return p.top && p.top.namespaceURI !== "http://www.w3.org/1999/xhtml";
    }
    function Pe(i) {
      return ve === i;
    }
    function Ut() {
      if (u.length > 0) {
        var i = Ne(u);
        if (u.length = 0, w && (w = false, i[0] === `
` && (i = i.substring(1)), i.length === 0))
          return;
        pe(Zt, i), b = false;
      }
      w = false;
    }
    function ar(i) {
      i.lastIndex = f - 1;
      var s = i.exec(n);
      if (s && s.index === f - 1)
        return s = s[0], f += s.length - 1, _ && f === l && (s = s.slice(0, -1), f--), s;
      throw new Error("should never happen");
    }
    function ir(i) {
      i.lastIndex = f - 1;
      var s = i.exec(n)[0];
      return s ? (Lc(s), f += s.length - 1, true) : false;
    }
    function Lc(i) {
      u.length > 0 && Ut(), !(w && (w = false, i[0] === `
` && (i = i.substring(1)), i.length === 0)) && pe(Zt, i);
    }
    function it() {
      if (ft)
        pe(G, V);
      else {
        var i = V;
        V = "", ve = i, pe(Se, i, De);
      }
    }
    function Dc() {
      if (f === l)
        return false;
      Xo.lastIndex = f;
      var i = Xo.exec(n);
      if (!i)
        throw new Error("should never happen");
      var s = i[2];
      if (!s)
        return false;
      var x = i[1];
      return x ? (f += s.length + 2, pe(G, s)) : (f += s.length + 1, ve = s, pe(Se, s, v0)), true;
    }
    function Rc() {
      ft ? pe(G, V, null, true) : pe(Se, V, De, true);
    }
    function Q() {
      pe(E0, Ne(Oe), qe ? Ne(qe) : void 0, Le ? Ne(Le) : void 0);
    }
    function z() {
      Ut(), k(gn), L.modclock = 1;
    }
    var pe = I.insertToken = function(s, x, E, v) {
      Ut();
      var N = p.top;
      !N || N.namespaceURI === q.HTML ? k(s, x, E, v) : s !== Se && s !== Zt ? Ai(s, x, E, v) : Zo(N) && (s === Zt || s === Se && x !== "mglyph" && x !== "malignmark") || s === Se && x === "svg" && N.namespaceURI === q.MATHML && N.localName === "annotation-xml" || Jo(N) ? (o = true, k(s, x, E, v), o = false) : Ai(s, x, E, v);
    };
    function Qe(i) {
      var s = p.top;
      xt && te(s, Jt) ? Mr(function(x) {
        return x.createComment(i);
      }) : (s instanceof ee.HTMLTemplateElement && (s = s.content), s._appendChild(s.ownerDocument.createComment(i)));
    }
    function Ze(i) {
      var s = p.top;
      if (xt && te(s, Jt))
        Mr(function(E) {
          return E.createTextNode(i);
        });
      else {
        s instanceof ee.HTMLTemplateElement && (s = s.content);
        var x = s.lastChild;
        x && x.nodeType === Ja.TEXT_NODE ? x.appendData(i) : s._appendChild(s.ownerDocument.createTextNode(i));
      }
    }
    function sr(i, s, x) {
      var E = Oo.createElement(i, s, null);
      if (x)
        for (var v = 0, N = x.length; v < N; v++)
          E._setAttribute(x[v][0], x[v][1]);
      return E;
    }
    var xt = false;
    function B(i, s) {
      var x = Rr(function(E) {
        return sr(E, i, s);
      });
      return te(x, Bo) && (x._form = A), x;
    }
    function Rr(i) {
      var s;
      return xt && te(p.top, Jt) ? s = Mr(i) : p.top instanceof ee.HTMLTemplateElement ? (s = i(p.top.content.ownerDocument), p.top.content._appendChild(s)) : (s = i(p.top.ownerDocument), p.top._appendChild(s)), p.push(s), s;
    }
    function On(i, s, x) {
      return Rr(function(E) {
        var v = E._createElementNS(i, x, null);
        if (s)
          for (var N = 0, H = s.length; N < H; N++) {
            var W = s[N];
            W.length === 2 ? v._setAttribute(W[0], W[1]) : v._setAttributeNS(W[2], W[0], W[1]);
          }
        return v;
      });
    }
    function xi(i) {
      for (var s = p.elements.length - 1; s >= 0; s--)
        if (p.elements[s] instanceof i)
          return s;
      return -1;
    }
    function Mr(i) {
      var s, x, E = -1, v = -1, N;
      if (E = xi(ee.HTMLTableElement), v = xi(ee.HTMLTemplateElement), v >= 0 && (E < 0 || v > E) ? s = p.elements[v] : E >= 0 && (s = p.elements[E].parentNode, s ? x = p.elements[E] : s = p.elements[E - 1]), s || (s = p.elements[0]), s instanceof ee.HTMLTemplateElement && (s = s.content), N = i(s.ownerDocument), N.nodeType === Ja.TEXT_NODE) {
        var H;
        if (x ? H = x.previousSibling : H = s.lastChild, H && H.nodeType === Ja.TEXT_NODE)
          return H.appendData(N.data), N;
      }
      return x ? s.insertBefore(N, x) : s._appendChild(N), N;
    }
    function or() {
      for (var i = false, s = p.elements.length - 1; s >= 0; s--) {
        var x = p.elements[s];
        if (s === 0 && (i = true, Xe && (x = t)), x.namespaceURI === q.HTML) {
          var E = x.localName;
          switch (E) {
            case "select":
              for (var v = s; v > 0; ) {
                var N = p.elements[--v];
                if (N instanceof ee.HTMLTemplateElement)
                  break;
                if (N instanceof ee.HTMLTableElement) {
                  k = Yr;
                  return;
                }
              }
              k = st;
              return;
            case "tr":
              k = fr;
              return;
            case "tbody":
            case "tfoot":
            case "thead":
              k = At;
              return;
            case "caption":
              k = Wn;
              return;
            case "colgroup":
              k = Gr;
              return;
            case "table":
              k = Be;
              return;
            case "template":
              k = je[je.length - 1];
              return;
            case "body":
              k = F;
              return;
            case "frameset":
              k = Yn;
              return;
            case "html":
              se === null ? k = jr : k = jn;
              return;
            default:
              if (!i) {
                if (E === "head") {
                  k = fe;
                  return;
                }
                if (E === "td" || E === "th") {
                  k = Vt;
                  return;
                }
              }
          }
        }
        if (i) {
          k = F;
          return;
        }
      }
    }
    function cr(i, s) {
      B(i, s), g = lr, Fe = k, k = Wr;
    }
    function Mc(i, s) {
      B(i, s), g = pt, Fe = k, k = Wr;
    }
    function qn(i, s) {
      return { elt: sr(i, d.list[s].localName, d.attrs[s]), attrs: d.attrs[s] };
    }
    function Ae() {
      if (d.list.length !== 0) {
        var i = d.list[d.list.length - 1];
        if (i !== d.MARKER && p.elements.lastIndexOf(i) === -1) {
          for (var s = d.list.length - 2; s >= 0 && (i = d.list[s], !(i === d.MARKER || p.elements.lastIndexOf(i) !== -1)); s--)
            ;
          for (s = s + 1; s < d.list.length; s++) {
            var x = Rr(function(E) {
              return qn(E, s).elt;
            });
            d.list[s] = x;
          }
        }
      }
    }
    var Ir = { localName: "BM" };
    function Ic(i) {
      if (te(p.top, i) && d.indexOf(p.top) === -1)
        return p.pop(), true;
      for (var s = 0; s < 8; ) {
        s++;
        var x = d.findElementByTag(i);
        if (!x)
          return false;
        var E = p.elements.lastIndexOf(x);
        if (E === -1)
          return d.remove(x), true;
        if (!p.elementInScope(x))
          return true;
        for (var v = null, N, H = E + 1; H < p.elements.length; H++)
          if (te(p.elements[H], Ft)) {
            v = p.elements[H], N = H;
            break;
          }
        if (v) {
          var W = p.elements[E - 1];
          d.insertAfter(x, Ir);
          for (var le = v, ye = v, Ue = N, Ge, Lt = 0; Lt++, le = p.elements[--Ue], le !== x; ) {
            if (Ge = d.indexOf(le), Lt > 3 && Ge !== -1 && (d.remove(le), Ge = -1), Ge === -1) {
              p.removeElement(le);
              continue;
            }
            var Et = qn(W.ownerDocument, Ge);
            d.replace(le, Et.elt, Et.attrs), p.elements[Ue] = Et.elt, le = Et.elt, ye === v && (d.remove(Ir), d.insertAfter(Et.elt, Ir)), le._appendChild(ye), ye = le;
          }
          xt && te(W, Jt) ? Mr(function() {
            return ye;
          }) : W instanceof ee.HTMLTemplateElement ? W.content._appendChild(ye) : W._appendChild(ye);
          for (var dr = qn(v.ownerDocument, d.indexOf(x)); v.hasChildNodes(); )
            dr.elt._appendChild(v.firstChild);
          v._appendChild(dr.elt), d.remove(x), d.replace(Ir, dr.elt, dr.attrs), p.removeElement(x);
          var Cl = p.elements.lastIndexOf(v);
          p.elements.splice(Cl + 1, 0, dr.elt);
        } else
          return p.popElement(x), d.remove(x), true;
      }
      return true;
    }
    function Oc() {
      p.pop(), k = Fe;
    }
    function St() {
      delete L._parser, p.elements.length = 0, L.defaultView && L.defaultView.dispatchEvent(new ee.Event("load", {}));
    }
    function M(i, s) {
      g = s, f--;
    }
    function j(i) {
      switch (i) {
        case 38:
          re = j, g = ur;
          break;
        case 60:
          if (Dc())
            break;
          g = qc;
          break;
        case 0:
          u.push(i), b = true;
          break;
        case -1:
          z();
          break;
        default:
          ir(I0) || u.push(i);
          break;
      }
    }
    function pt(i) {
      switch (i) {
        case 38:
          re = pt, g = ur;
          break;
        case 60:
          g = Hc;
          break;
        case 0:
          u.push(65533), b = true;
          break;
        case -1:
          z();
          break;
        default:
          u.push(i);
          break;
      }
    }
    function lr(i) {
      switch (i) {
        case 60:
          g = Uc;
          break;
        case 0:
          u.push(65533);
          break;
        case -1:
          z();
          break;
        default:
          ir(Ko) || u.push(i);
          break;
      }
    }
    function mt(i) {
      switch (i) {
        case 60:
          g = jc;
          break;
        case 0:
          u.push(65533);
          break;
        case -1:
          z();
          break;
        default:
          ir(Ko) || u.push(i);
          break;
      }
    }
    function Or(i) {
      switch (i) {
        case 0:
          u.push(65533);
          break;
        case -1:
          z();
          break;
        default:
          ir(O0) || u.push(i);
          break;
      }
    }
    function qc(i) {
      switch (i) {
        case 33:
          g = bi;
          break;
        case 47:
          g = Fc;
          break;
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
        case 108:
        case 109:
        case 110:
        case 111:
        case 112:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 119:
        case 120:
        case 121:
        case 122:
          Cc(), M(i, pi);
          break;
        case 63:
          M(i, Pr);
          break;
        default:
          u.push(60), M(i, j);
          break;
      }
    }
    function Fc(i) {
      switch (i) {
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
        case 108:
        case 109:
        case 110:
        case 111:
        case 112:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 119:
        case 120:
        case 121:
        case 122:
          nr(), M(i, pi);
          break;
        case 62:
          g = j;
          break;
        case -1:
          u.push(60), u.push(47), z();
          break;
        default:
          M(i, Pr);
          break;
      }
    }
    function pi(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          g = et;
          break;
        case 47:
          g = bt;
          break;
        case 62:
          g = j, it();
          break;
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
          V += String.fromCharCode(i + 32);
          break;
        case 0:
          V += String.fromCharCode(65533);
          break;
        case -1:
          z();
          break;
        default:
          V += ar(D0);
          break;
      }
    }
    function Hc(i) {
      i === 47 ? (at(), g = Pc) : (u.push(60), M(i, pt));
    }
    function Pc(i) {
      switch (i) {
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
        case 108:
        case 109:
        case 110:
        case 111:
        case 112:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 119:
        case 120:
        case 121:
        case 122:
          nr(), M(i, Bc);
          break;
        default:
          u.push(60), u.push(47), M(i, pt);
          break;
      }
    }
    function Bc(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          if (Pe(V)) {
            g = et;
            return;
          }
          break;
        case 47:
          if (Pe(V)) {
            g = bt;
            return;
          }
          break;
        case 62:
          if (Pe(V)) {
            g = j, it();
            return;
          }
          break;
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
          V += String.fromCharCode(i + 32), U.push(i);
          return;
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
        case 108:
        case 109:
        case 110:
        case 111:
        case 112:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 119:
        case 120:
        case 121:
        case 122:
          V += String.fromCharCode(i), U.push(i);
          return;
      }
      u.push(60), u.push(47), qt(u, U), M(i, pt);
    }
    function Uc(i) {
      i === 47 ? (at(), g = Vc) : (u.push(60), M(i, lr));
    }
    function Vc(i) {
      switch (i) {
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
        case 108:
        case 109:
        case 110:
        case 111:
        case 112:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 119:
        case 120:
        case 121:
        case 122:
          nr(), M(i, zc);
          break;
        default:
          u.push(60), u.push(47), M(i, lr);
          break;
      }
    }
    function zc(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          if (Pe(V)) {
            g = et;
            return;
          }
          break;
        case 47:
          if (Pe(V)) {
            g = bt;
            return;
          }
          break;
        case 62:
          if (Pe(V)) {
            g = j, it();
            return;
          }
          break;
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
          V += String.fromCharCode(i + 32), U.push(i);
          return;
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
        case 108:
        case 109:
        case 110:
        case 111:
        case 112:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 119:
        case 120:
        case 121:
        case 122:
          V += String.fromCharCode(i), U.push(i);
          return;
      }
      u.push(60), u.push(47), qt(u, U), M(i, lr);
    }
    function jc(i) {
      switch (i) {
        case 47:
          at(), g = Wc;
          break;
        case 33:
          g = Yc, u.push(60), u.push(33);
          break;
        default:
          u.push(60), M(i, mt);
          break;
      }
    }
    function Wc(i) {
      switch (i) {
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
        case 108:
        case 109:
        case 110:
        case 111:
        case 112:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 119:
        case 120:
        case 121:
        case 122:
          nr(), M(i, Gc);
          break;
        default:
          u.push(60), u.push(47), M(i, mt);
          break;
      }
    }
    function Gc(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          if (Pe(V)) {
            g = et;
            return;
          }
          break;
        case 47:
          if (Pe(V)) {
            g = bt;
            return;
          }
          break;
        case 62:
          if (Pe(V)) {
            g = j, it();
            return;
          }
          break;
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
          V += String.fromCharCode(i + 32), U.push(i);
          return;
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
        case 108:
        case 109:
        case 110:
        case 111:
        case 112:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 119:
        case 120:
        case 121:
        case 122:
          V += String.fromCharCode(i), U.push(i);
          return;
      }
      u.push(60), u.push(47), qt(u, U), M(i, mt);
    }
    function Yc(i) {
      i === 45 ? (g = $c, u.push(45)) : M(i, mt);
    }
    function $c(i) {
      i === 45 ? (g = mi, u.push(45)) : M(i, mt);
    }
    function Je(i) {
      switch (i) {
        case 45:
          g = Kc, u.push(45);
          break;
        case 60:
          g = Fn;
          break;
        case 0:
          u.push(65533);
          break;
        case -1:
          z();
          break;
        default:
          u.push(i);
          break;
      }
    }
    function Kc(i) {
      switch (i) {
        case 45:
          g = mi, u.push(45);
          break;
        case 60:
          g = Fn;
          break;
        case 0:
          g = Je, u.push(65533);
          break;
        case -1:
          z();
          break;
        default:
          g = Je, u.push(i);
          break;
      }
    }
    function mi(i) {
      switch (i) {
        case 45:
          u.push(45);
          break;
        case 60:
          g = Fn;
          break;
        case 62:
          g = mt, u.push(62);
          break;
        case 0:
          g = Je, u.push(65533);
          break;
        case -1:
          z();
          break;
        default:
          g = Je, u.push(i);
          break;
      }
    }
    function Fn(i) {
      switch (i) {
        case 47:
          at(), g = Xc;
          break;
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
        case 108:
        case 109:
        case 110:
        case 111:
        case 112:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 119:
        case 120:
        case 121:
        case 122:
          at(), u.push(60), M(i, Zc);
          break;
        default:
          u.push(60), M(i, Je);
          break;
      }
    }
    function Xc(i) {
      switch (i) {
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
        case 108:
        case 109:
        case 110:
        case 111:
        case 112:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 119:
        case 120:
        case 121:
        case 122:
          nr(), M(i, Qc);
          break;
        default:
          u.push(60), u.push(47), M(i, Je);
          break;
      }
    }
    function Qc(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          if (Pe(V)) {
            g = et;
            return;
          }
          break;
        case 47:
          if (Pe(V)) {
            g = bt;
            return;
          }
          break;
        case 62:
          if (Pe(V)) {
            g = j, it();
            return;
          }
          break;
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
          V += String.fromCharCode(i + 32), U.push(i);
          return;
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
        case 108:
        case 109:
        case 110:
        case 111:
        case 112:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 119:
        case 120:
        case 121:
        case 122:
          V += String.fromCharCode(i), U.push(i);
          return;
      }
      u.push(60), u.push(47), qt(u, U), M(i, Je);
    }
    function Zc(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
        case 47:
        case 62:
          Ne(U) === "script" ? g = gt : g = Je, u.push(i);
          break;
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
          U.push(i + 32), u.push(i);
          break;
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
        case 108:
        case 109:
        case 110:
        case 111:
        case 112:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 119:
        case 120:
        case 121:
        case 122:
          U.push(i), u.push(i);
          break;
        default:
          M(i, Je);
          break;
      }
    }
    function gt(i) {
      switch (i) {
        case 45:
          g = Jc, u.push(45);
          break;
        case 60:
          g = Hn, u.push(60);
          break;
        case 0:
          u.push(65533);
          break;
        case -1:
          z();
          break;
        default:
          u.push(i);
          break;
      }
    }
    function Jc(i) {
      switch (i) {
        case 45:
          g = el, u.push(45);
          break;
        case 60:
          g = Hn, u.push(60);
          break;
        case 0:
          g = gt, u.push(65533);
          break;
        case -1:
          z();
          break;
        default:
          g = gt, u.push(i);
          break;
      }
    }
    function el(i) {
      switch (i) {
        case 45:
          u.push(45);
          break;
        case 60:
          g = Hn, u.push(60);
          break;
        case 62:
          g = mt, u.push(62);
          break;
        case 0:
          g = gt, u.push(65533);
          break;
        case -1:
          z();
          break;
        default:
          g = gt, u.push(i);
          break;
      }
    }
    function Hn(i) {
      i === 47 ? (at(), g = tl, u.push(47)) : M(i, gt);
    }
    function tl(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
        case 47:
        case 62:
          Ne(U) === "script" ? g = Je : g = gt, u.push(i);
          break;
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
          U.push(i + 32), u.push(i);
          break;
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
        case 108:
        case 109:
        case 110:
        case 111:
        case 112:
        case 113:
        case 114:
        case 115:
        case 116:
        case 117:
        case 118:
        case 119:
        case 120:
        case 121:
        case 122:
          U.push(i), u.push(i);
          break;
        default:
          M(i, gt);
          break;
      }
    }
    function et(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          break;
        case 47:
          g = bt;
          break;
        case 62:
          g = j, it();
          break;
        case -1:
          z();
          break;
        case 61:
          Mn(), ie += String.fromCharCode(i), g = Pn;
          break;
        default:
          if (kt())
            break;
          Mn(), M(i, Pn);
          break;
      }
    }
    function Pn(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
        case 47:
        case 62:
        case -1:
          M(i, rl);
          break;
        case 61:
          g = gi;
          break;
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
          ie += String.fromCharCode(i + 32);
          break;
        case 0:
          ie += String.fromCharCode(65533);
          break;
        case 34:
        case 39:
        case 60:
        default:
          ie += ar(R0);
          break;
      }
    }
    function rl(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          break;
        case 47:
          He(ie), g = bt;
          break;
        case 61:
          g = gi;
          break;
        case 62:
          g = j, He(ie), it();
          break;
        case -1:
          He(ie), z();
          break;
        default:
          He(ie), Mn(), M(i, Pn);
          break;
      }
    }
    function gi(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          break;
        case 34:
          In(), g = qr;
          break;
        case 39:
          In(), g = Fr;
          break;
        case 62:
        default:
          In(), M(i, Hr);
          break;
      }
    }
    function qr(i) {
      switch (i) {
        case 34:
          He(ie, be), g = Bn;
          break;
        case 38:
          re = qr, g = ur;
          break;
        case 0:
          be += String.fromCharCode(65533);
          break;
        case -1:
          z();
          break;
        case 10:
          be += String.fromCharCode(i);
          break;
        default:
          be += ar(C0);
          break;
      }
    }
    function Fr(i) {
      switch (i) {
        case 39:
          He(ie, be), g = Bn;
          break;
        case 38:
          re = Fr, g = ur;
          break;
        case 0:
          be += String.fromCharCode(65533);
          break;
        case -1:
          z();
          break;
        case 10:
          be += String.fromCharCode(i);
          break;
        default:
          be += ar(A0);
          break;
      }
    }
    function Hr(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          He(ie, be), g = et;
          break;
        case 38:
          re = Hr, g = ur;
          break;
        case 62:
          He(ie, be), g = j, it();
          break;
        case 0:
          be += String.fromCharCode(65533);
          break;
        case -1:
          f--, g = j;
          break;
        case 34:
        case 39:
        case 60:
        case 61:
        case 96:
        default:
          be += ar(L0);
          break;
      }
    }
    function Bn(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          g = et;
          break;
        case 47:
          g = bt;
          break;
        case 62:
          g = j, it();
          break;
        case -1:
          z();
          break;
        default:
          M(i, et);
          break;
      }
    }
    function bt(i) {
      switch (i) {
        case 62:
          g = j, Rc();
          break;
        case -1:
          z();
          break;
        default:
          M(i, et);
          break;
      }
    }
    function Pr(i, s, x) {
      var E = s.length;
      x ? f += E - 1 : f += E;
      var v = s.substring(0, E - 1);
      v = v.replace(/\u0000/g, "\uFFFD"), v = v.replace(/\u000D\u000A/g, `
`), v = v.replace(/\u000D/g, `
`), pe(rt, v), g = j;
    }
    Pr.lookahead = ">";
    function bi(i, s, x) {
      if (s[0] === "-" && s[1] === "-") {
        f += 2, hi(), g = nl;
        return;
      }
      s.toUpperCase() === "DOCTYPE" ? (f += 7, g = ul) : s === "[CDATA[" && Ac() ? (f += 7, g = zn) : g = Pr;
    }
    bi.lookahead = 7;
    function nl(i) {
      switch (hi(), i) {
        case 45:
          g = al;
          break;
        case 62:
          g = j, pe(rt, Ne(ne));
          break;
        default:
          M(i, Nt);
          break;
      }
    }
    function al(i) {
      switch (i) {
        case 45:
          g = Br;
          break;
        case 62:
          g = j, pe(rt, Ne(ne));
          break;
        case -1:
          pe(rt, Ne(ne)), z();
          break;
        default:
          ne.push(45), M(i, Nt);
          break;
      }
    }
    function Nt(i) {
      switch (i) {
        case 60:
          ne.push(i), g = il;
          break;
        case 45:
          g = Un;
          break;
        case 0:
          ne.push(65533);
          break;
        case -1:
          pe(rt, Ne(ne)), z();
          break;
        default:
          ne.push(i);
          break;
      }
    }
    function il(i) {
      switch (i) {
        case 33:
          ne.push(i), g = sl;
          break;
        case 60:
          ne.push(i);
          break;
        default:
          M(i, Nt);
          break;
      }
    }
    function sl(i) {
      switch (i) {
        case 45:
          g = ol;
          break;
        default:
          M(i, Nt);
          break;
      }
    }
    function ol(i) {
      switch (i) {
        case 45:
          g = cl;
          break;
        default:
          M(i, Un);
          break;
      }
    }
    function cl(i) {
      switch (i) {
        case 62:
        case -1:
          M(i, Br);
          break;
        default:
          M(i, Br);
          break;
      }
    }
    function Un(i) {
      switch (i) {
        case 45:
          g = Br;
          break;
        case -1:
          pe(rt, Ne(ne)), z();
          break;
        default:
          ne.push(45), M(i, Nt);
          break;
      }
    }
    function Br(i) {
      switch (i) {
        case 62:
          g = j, pe(rt, Ne(ne));
          break;
        case 33:
          g = ll;
          break;
        case 45:
          ne.push(45);
          break;
        case -1:
          pe(rt, Ne(ne)), z();
          break;
        default:
          ne.push(45), ne.push(45), M(i, Nt);
          break;
      }
    }
    function ll(i) {
      switch (i) {
        case 45:
          ne.push(45), ne.push(45), ne.push(33), g = Un;
          break;
        case 62:
          g = j, pe(rt, Ne(ne));
          break;
        case -1:
          pe(rt, Ne(ne)), z();
          break;
        default:
          ne.push(45), ne.push(45), ne.push(33), M(i, Nt);
          break;
      }
    }
    function ul(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          g = _i;
          break;
        case -1:
          Bt(), X(), Q(), z();
          break;
        default:
          M(i, _i);
          break;
      }
    }
    function _i(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          break;
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
          Bt(), Oe.push(i + 32), g = Vn;
          break;
        case 0:
          Bt(), Oe.push(65533), g = Vn;
          break;
        case 62:
          Bt(), X(), g = j, Q();
          break;
        case -1:
          Bt(), X(), Q(), z();
          break;
        default:
          Bt(), Oe.push(i), g = Vn;
          break;
      }
    }
    function Vn(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          g = Ei;
          break;
        case 62:
          g = j, Q();
          break;
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 71:
        case 72:
        case 73:
        case 74:
        case 75:
        case 76:
        case 77:
        case 78:
        case 79:
        case 80:
        case 81:
        case 82:
        case 83:
        case 84:
        case 85:
        case 86:
        case 87:
        case 88:
        case 89:
        case 90:
          Oe.push(i + 32);
          break;
        case 0:
          Oe.push(65533);
          break;
        case -1:
          X(), Q(), z();
          break;
        default:
          Oe.push(i);
          break;
      }
    }
    function Ei(i, s, x) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          f += 1;
          break;
        case 62:
          g = j, f += 1, Q();
          break;
        case -1:
          X(), Q(), z();
          break;
        default:
          s = s.toUpperCase(), s === "PUBLIC" ? (f += 6, g = fl) : s === "SYSTEM" ? (f += 6, g = xl) : (X(), g = _t);
          break;
      }
    }
    Ei.lookahead = 6;
    function fl(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          g = dl;
          break;
        case 34:
          Dr(), g = vi;
          break;
        case 39:
          Dr(), g = yi;
          break;
        case 62:
          X(), g = j, Q();
          break;
        case -1:
          X(), Q(), z();
          break;
        default:
          X(), g = _t;
          break;
      }
    }
    function dl(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          break;
        case 34:
          Dr(), g = vi;
          break;
        case 39:
          Dr(), g = yi;
          break;
        case 62:
          X(), g = j, Q();
          break;
        case -1:
          X(), Q(), z();
          break;
        default:
          X(), g = _t;
          break;
      }
    }
    function vi(i) {
      switch (i) {
        case 34:
          g = wi;
          break;
        case 0:
          qe.push(65533);
          break;
        case 62:
          X(), g = j, Q();
          break;
        case -1:
          X(), Q(), z();
          break;
        default:
          qe.push(i);
          break;
      }
    }
    function yi(i) {
      switch (i) {
        case 39:
          g = wi;
          break;
        case 0:
          qe.push(65533);
          break;
        case 62:
          X(), g = j, Q();
          break;
        case -1:
          X(), Q(), z();
          break;
        default:
          qe.push(i);
          break;
      }
    }
    function wi(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          g = hl;
          break;
        case 62:
          g = j, Q();
          break;
        case 34:
          ht(), g = Ur;
          break;
        case 39:
          ht(), g = Vr;
          break;
        case -1:
          X(), Q(), z();
          break;
        default:
          X(), g = _t;
          break;
      }
    }
    function hl(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          break;
        case 62:
          g = j, Q();
          break;
        case 34:
          ht(), g = Ur;
          break;
        case 39:
          ht(), g = Vr;
          break;
        case -1:
          X(), Q(), z();
          break;
        default:
          X(), g = _t;
          break;
      }
    }
    function xl(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          g = pl;
          break;
        case 34:
          ht(), g = Ur;
          break;
        case 39:
          ht(), g = Vr;
          break;
        case 62:
          X(), g = j, Q();
          break;
        case -1:
          X(), Q(), z();
          break;
        default:
          X(), g = _t;
          break;
      }
    }
    function pl(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          break;
        case 34:
          ht(), g = Ur;
          break;
        case 39:
          ht(), g = Vr;
          break;
        case 62:
          X(), g = j, Q();
          break;
        case -1:
          X(), Q(), z();
          break;
        default:
          X(), g = _t;
          break;
      }
    }
    function Ur(i) {
      switch (i) {
        case 34:
          g = Ti;
          break;
        case 0:
          Le.push(65533);
          break;
        case 62:
          X(), g = j, Q();
          break;
        case -1:
          X(), Q(), z();
          break;
        default:
          Le.push(i);
          break;
      }
    }
    function Vr(i) {
      switch (i) {
        case 39:
          g = Ti;
          break;
        case 0:
          Le.push(65533);
          break;
        case 62:
          X(), g = j, Q();
          break;
        case -1:
          X(), Q(), z();
          break;
        default:
          Le.push(i);
          break;
      }
    }
    function Ti(i) {
      switch (i) {
        case 9:
        case 10:
        case 12:
        case 32:
          break;
        case 62:
          g = j, Q();
          break;
        case -1:
          X(), Q(), z();
          break;
        default:
          g = _t;
          break;
      }
    }
    function _t(i) {
      switch (i) {
        case 62:
          g = j, Q();
          break;
        case -1:
          Q(), z();
          break;
      }
    }
    function zn(i) {
      switch (i) {
        case 93:
          g = ml;
          break;
        case -1:
          z();
          break;
        case 0:
          b = true;
        default:
          ir(M0) || u.push(i);
          break;
      }
    }
    function ml(i) {
      switch (i) {
        case 93:
          g = gl;
          break;
        default:
          u.push(93), M(i, zn);
          break;
      }
    }
    function gl(i) {
      switch (i) {
        case 93:
          u.push(93);
          break;
        case 62:
          Ut(), g = j;
          break;
        default:
          u.push(93), u.push(93), M(i, zn);
          break;
      }
    }
    function ur(i) {
      switch (at(), U.push(38), i) {
        case 9:
        case 10:
        case 12:
        case 32:
        case 60:
        case 38:
        case -1:
          M(i, Ct);
          break;
        case 35:
          U.push(i), g = bl;
          break;
        default:
          M(i, ki);
          break;
      }
    }
    function ki(i) {
      $o.lastIndex = f;
      var s = $o.exec(n);
      if (!s)
        throw new Error("should never happen");
      var x = s[1];
      if (!x) {
        g = Ct;
        return;
      }
      switch (f += x.length, qt(U, F0(x)), re) {
        case qr:
        case Fr:
        case Hr:
          if (x[x.length - 1] !== ";" && /[=A-Za-z0-9]/.test(n[f])) {
            g = Ct;
            return;
          }
          break;
      }
      at();
      var E = S0[x];
      typeof E == "number" ? U.push(E) : qt(U, E), g = Ct;
    }
    ki.lookahead = -N0;
    function bl(i) {
      switch ($ = 0, i) {
        case 120:
        case 88:
          U.push(i), g = _l;
          break;
        default:
          M(i, El);
          break;
      }
    }
    function _l(i) {
      switch (i) {
        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57:
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
          M(i, vl);
          break;
        default:
          M(i, Ct);
          break;
      }
    }
    function El(i) {
      switch (i) {
        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57:
          M(i, yl);
          break;
        default:
          M(i, Ct);
          break;
      }
    }
    function vl(i) {
      switch (i) {
        case 65:
        case 66:
        case 67:
        case 68:
        case 69:
        case 70:
          $ *= 16, $ += i - 55;
          break;
        case 97:
        case 98:
        case 99:
        case 100:
        case 101:
        case 102:
          $ *= 16, $ += i - 87;
          break;
        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57:
          $ *= 16, $ += i - 48;
          break;
        case 59:
          g = zr;
          break;
        default:
          M(i, zr);
          break;
      }
    }
    function yl(i) {
      switch (i) {
        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57:
          $ *= 10, $ += i - 48;
          break;
        case 59:
          g = zr;
          break;
        default:
          M(i, zr);
          break;
      }
    }
    function zr(i) {
      $ in Yo ? $ = Yo[$] : ($ > 1114111 || $ >= 55296 && $ < 57344) && ($ = 65533), at(), $ <= 65535 ? U.push($) : ($ = $ - 65536, U.push(55296 + ($ >> 10)), U.push(56320 + ($ & 1023))), M(i, Ct);
    }
    function Ct(i) {
      switch (re) {
        case qr:
        case Fr:
        case Hr:
          be += Ne(U);
          break;
        default:
          qt(u, U);
          break;
      }
      M(i, re);
    }
    function wl(i, s, x, E) {
      switch (i) {
        case 1:
          if (s = s.replace(Ht, ""), s.length === 0)
            return;
          break;
        case 4:
          L._appendChild(L.createComment(s));
          return;
        case 5:
          var v = s, N = x, H = E;
          L.appendChild(new _0(L, v, N, H)), m || v.toLowerCase() !== "html" || y0.test(N) || H && H.toLowerCase() === w0 || H === void 0 && qo.test(N) ? L._quirks = true : (T0.test(N) || H !== void 0 && qo.test(N)) && (L._limitedQuirks = true), k = Si;
          return;
      }
      L._quirks = true, k = Si, k(i, s, x, E);
    }
    function Si(i, s, x, E) {
      var v;
      switch (i) {
        case 1:
          if (s = s.replace(Ht, ""), s.length === 0)
            return;
          break;
        case 5:
          return;
        case 4:
          L._appendChild(L.createComment(s));
          return;
        case 2:
          if (s === "html") {
            v = sr(L, s, x), p.push(v), L.appendChild(v), k = jr;
            return;
          }
          break;
        case 3:
          switch (s) {
            case "html":
            case "head":
            case "body":
            case "br":
              break;
            default:
              return;
          }
      }
      v = sr(L, "html", null), p.push(v), L.appendChild(v), k = jr, k(i, s, x, E);
    }
    function jr(i, s, x, E) {
      switch (i) {
        case 1:
          if (s = s.replace(Ht, ""), s.length === 0)
            return;
          break;
        case 5:
          return;
        case 4:
          Qe(s);
          return;
        case 2:
          switch (s) {
            case "html":
              F(i, s, x, E);
              return;
            case "head":
              var v = B(s, x);
              se = v, k = fe;
              return;
          }
          break;
        case 3:
          switch (s) {
            case "html":
            case "head":
            case "body":
            case "br":
              break;
            default:
              return;
          }
      }
      jr(Se, "head", null), k(i, s, x, E);
    }
    function fe(i, s, x, E) {
      switch (i) {
        case 1:
          var v = s.match(Ht);
          if (v && (Ze(v[0]), s = s.substring(v[0].length)), s.length === 0)
            return;
          break;
        case 4:
          Qe(s);
          return;
        case 5:
          return;
        case 2:
          switch (s) {
            case "html":
              F(i, s, x, E);
              return;
            case "meta":
            case "base":
            case "basefont":
            case "bgsound":
            case "link":
              B(s, x), p.pop();
              return;
            case "title":
              Mc(s, x);
              return;
            case "noscript":
              if (!c) {
                B(s, x), k = Ni;
                return;
              }
            case "noframes":
            case "style":
              cr(s, x);
              return;
            case "script":
              Rr(function(N) {
                var H = sr(N, s, x);
                return H._parser_inserted = true, H._force_async = false, Xe && (H._already_started = true), Ut(), H;
              }), g = mt, Fe = k, k = Wr;
              return;
            case "template":
              B(s, x), d.insertMarker(), h = false, k = Gn, je.push(k);
              return;
            case "head":
              return;
          }
          break;
        case 3:
          switch (s) {
            case "head":
              p.pop(), k = jn;
              return;
            case "body":
            case "html":
            case "br":
              break;
            case "template":
              if (!p.contains("template"))
                return;
              p.generateImpliedEndTags(null, "thorough"), p.popTag("template"), d.clearToMarker(), je.pop(), or();
              return;
            default:
              return;
          }
          break;
      }
      fe(G, "head", null), k(i, s, x, E);
    }
    function Ni(i, s, x, E) {
      switch (i) {
        case 5:
          return;
        case 4:
          fe(i, s);
          return;
        case 1:
          var v = s.match(Ht);
          if (v && (fe(i, v[0]), s = s.substring(v[0].length)), s.length === 0)
            return;
          break;
        case 2:
          switch (s) {
            case "html":
              F(i, s, x, E);
              return;
            case "basefont":
            case "bgsound":
            case "link":
            case "meta":
            case "noframes":
            case "style":
              fe(i, s, x);
              return;
            case "head":
            case "noscript":
              return;
          }
          break;
        case 3:
          switch (s) {
            case "noscript":
              p.pop(), k = fe;
              return;
            case "br":
              break;
            default:
              return;
          }
          break;
      }
      Ni(G, "noscript", null), k(i, s, x, E);
    }
    function jn(i, s, x, E) {
      switch (i) {
        case 1:
          var v = s.match(Ht);
          if (v && (Ze(v[0]), s = s.substring(v[0].length)), s.length === 0)
            return;
          break;
        case 4:
          Qe(s);
          return;
        case 5:
          return;
        case 2:
          switch (s) {
            case "html":
              F(i, s, x, E);
              return;
            case "body":
              B(s, x), h = false, k = F;
              return;
            case "frameset":
              B(s, x), k = Yn;
              return;
            case "base":
            case "basefont":
            case "bgsound":
            case "link":
            case "meta":
            case "noframes":
            case "script":
            case "style":
            case "template":
            case "title":
              p.push(se), fe(Se, s, x), p.removeElement(se);
              return;
            case "head":
              return;
          }
          break;
        case 3:
          switch (s) {
            case "template":
              return fe(i, s, x, E);
            case "body":
            case "html":
            case "br":
              break;
            default:
              return;
          }
          break;
      }
      jn(Se, "body", null), h = true, k(i, s, x, E);
    }
    function F(i, s, x, E) {
      var v, N, H, W;
      switch (i) {
        case 1:
          if (b && (s = s.replace(yn, ""), s.length === 0))
            return;
          h && vn.test(s) && (h = false), Ae(), Ze(s);
          return;
        case 5:
          return;
        case 4:
          Qe(s);
          return;
        case -1:
          if (je.length)
            return Gn(i);
          St();
          return;
        case 2:
          switch (s) {
            case "html":
              if (p.contains("template"))
                return;
              rc(x, p.elements[0]);
              return;
            case "base":
            case "basefont":
            case "bgsound":
            case "link":
            case "meta":
            case "noframes":
            case "script":
            case "style":
            case "template":
            case "title":
              fe(Se, s, x);
              return;
            case "body":
              if (v = p.elements[1], !v || !(v instanceof ee.HTMLBodyElement) || p.contains("template"))
                return;
              h = false, rc(x, v);
              return;
            case "frameset":
              if (!h || (v = p.elements[1], !v || !(v instanceof ee.HTMLBodyElement)))
                return;
              for (v.parentNode && v.parentNode.removeChild(v); !(p.top instanceof ee.HTMLHtmlElement); )
                p.pop();
              B(s, x), k = Yn;
              return;
            case "address":
            case "article":
            case "aside":
            case "blockquote":
            case "center":
            case "details":
            case "dialog":
            case "dir":
            case "div":
            case "dl":
            case "fieldset":
            case "figcaption":
            case "figure":
            case "footer":
            case "header":
            case "hgroup":
            case "main":
            case "nav":
            case "ol":
            case "p":
            case "section":
            case "summary":
            case "ul":
              p.inButtonScope("p") && F(G, "p"), B(s, x);
              return;
            case "menu":
              p.inButtonScope("p") && F(G, "p"), te(p.top, "menuitem") && p.pop(), B(s, x);
              return;
            case "h1":
            case "h2":
            case "h3":
            case "h4":
            case "h5":
            case "h6":
              p.inButtonScope("p") && F(G, "p"), p.top instanceof ee.HTMLHeadingElement && p.pop(), B(s, x);
              return;
            case "pre":
            case "listing":
              p.inButtonScope("p") && F(G, "p"), B(s, x), w = true, h = false;
              return;
            case "form":
              if (A && !p.contains("template"))
                return;
              p.inButtonScope("p") && F(G, "p"), W = B(s, x), p.contains("template") || (A = W);
              return;
            case "li":
              for (h = false, N = p.elements.length - 1; N >= 0; N--) {
                if (H = p.elements[N], H instanceof ee.HTMLLIElement) {
                  F(G, "li");
                  break;
                }
                if (te(H, Ft) && !te(H, ei))
                  break;
              }
              p.inButtonScope("p") && F(G, "p"), B(s, x);
              return;
            case "dd":
            case "dt":
              for (h = false, N = p.elements.length - 1; N >= 0; N--) {
                if (H = p.elements[N], te(H, Fo)) {
                  F(G, H.localName);
                  break;
                }
                if (te(H, Ft) && !te(H, ei))
                  break;
              }
              p.inButtonScope("p") && F(G, "p"), B(s, x);
              return;
            case "plaintext":
              p.inButtonScope("p") && F(G, "p"), B(s, x), g = Or;
              return;
            case "button":
              p.inScope("button") ? (F(G, "button"), k(i, s, x, E)) : (Ae(), B(s, x), h = false);
              return;
            case "a":
              var le = d.findElementByTag("a");
              le && (F(G, s), d.remove(le), p.removeElement(le));
            case "b":
            case "big":
            case "code":
            case "em":
            case "font":
            case "i":
            case "s":
            case "small":
            case "strike":
            case "strong":
            case "tt":
            case "u":
              Ae(), d.push(B(s, x), x);
              return;
            case "nobr":
              Ae(), p.inScope(s) && (F(G, s), Ae()), d.push(B(s, x), x);
              return;
            case "applet":
            case "marquee":
            case "object":
              Ae(), B(s, x), d.insertMarker(), h = false;
              return;
            case "table":
              !L._quirks && p.inButtonScope("p") && F(G, "p"), B(s, x), h = false, k = Be;
              return;
            case "area":
            case "br":
            case "embed":
            case "img":
            case "keygen":
            case "wbr":
              Ae(), B(s, x), p.pop(), h = false;
              return;
            case "input":
              Ae(), W = B(s, x), p.pop();
              var ye = W.getAttribute("type");
              (!ye || ye.toLowerCase() !== "hidden") && (h = false);
              return;
            case "param":
            case "source":
            case "track":
              B(s, x), p.pop();
              return;
            case "hr":
              p.inButtonScope("p") && F(G, "p"), te(p.top, "menuitem") && p.pop(), B(s, x), p.pop(), h = false;
              return;
            case "image":
              F(Se, "img", x, E);
              return;
            case "textarea":
              B(s, x), w = true, h = false, g = pt, Fe = k, k = Wr;
              return;
            case "xmp":
              p.inButtonScope("p") && F(G, "p"), Ae(), h = false, cr(s, x);
              return;
            case "iframe":
              h = false, cr(s, x);
              return;
            case "noembed":
              cr(s, x);
              return;
            case "noscript":
              if (c) {
                cr(s, x);
                return;
              }
              break;
            case "select":
              Ae(), B(s, x), h = false, k === Be || k === Wn || k === At || k === fr || k === Vt ? k = Yr : k = st;
              return;
            case "optgroup":
            case "option":
              p.top instanceof ee.HTMLOptionElement && F(G, "option"), Ae(), B(s, x);
              return;
            case "menuitem":
              te(p.top, "menuitem") && p.pop(), Ae(), B(s, x);
              return;
            case "rb":
            case "rtc":
              p.inScope("ruby") && p.generateImpliedEndTags(), B(s, x);
              return;
            case "rp":
            case "rt":
              p.inScope("ruby") && p.generateImpliedEndTags("rtc"), B(s, x);
              return;
            case "math":
              Ae(), tc(x), ai(x), On(s, x, q.MATHML), E && p.pop();
              return;
            case "svg":
              Ae(), ec(x), ai(x), On(s, x, q.SVG), E && p.pop();
              return;
            case "caption":
            case "col":
            case "colgroup":
            case "frame":
            case "head":
            case "tbody":
            case "td":
            case "tfoot":
            case "th":
            case "thead":
            case "tr":
              return;
          }
          Ae(), B(s, x);
          return;
        case 3:
          switch (s) {
            case "template":
              fe(G, s, x);
              return;
            case "body":
              if (!p.inScope("body"))
                return;
              k = Ci;
              return;
            case "html":
              if (!p.inScope("body"))
                return;
              k = Ci, k(i, s, x);
              return;
            case "address":
            case "article":
            case "aside":
            case "blockquote":
            case "button":
            case "center":
            case "details":
            case "dialog":
            case "dir":
            case "div":
            case "dl":
            case "fieldset":
            case "figcaption":
            case "figure":
            case "footer":
            case "header":
            case "hgroup":
            case "listing":
            case "main":
            case "menu":
            case "nav":
            case "ol":
            case "pre":
            case "section":
            case "summary":
            case "ul":
              if (!p.inScope(s))
                return;
              p.generateImpliedEndTags(), p.popTag(s);
              return;
            case "form":
              if (p.contains("template")) {
                if (!p.inScope("form"))
                  return;
                p.generateImpliedEndTags(), p.popTag("form");
              } else {
                var Ue = A;
                if (A = null, !Ue || !p.elementInScope(Ue))
                  return;
                p.generateImpliedEndTags(), p.removeElement(Ue);
              }
              return;
            case "p":
              p.inButtonScope(s) ? (p.generateImpliedEndTags(s), p.popTag(s)) : (F(Se, s, null), k(i, s, x, E));
              return;
            case "li":
              if (!p.inListItemScope(s))
                return;
              p.generateImpliedEndTags(s), p.popTag(s);
              return;
            case "dd":
            case "dt":
              if (!p.inScope(s))
                return;
              p.generateImpliedEndTags(s), p.popTag(s);
              return;
            case "h1":
            case "h2":
            case "h3":
            case "h4":
            case "h5":
            case "h6":
              if (!p.elementTypeInScope(ee.HTMLHeadingElement))
                return;
              p.generateImpliedEndTags(), p.popElementType(ee.HTMLHeadingElement);
              return;
            case "sarcasm":
              break;
            case "a":
            case "b":
            case "big":
            case "code":
            case "em":
            case "font":
            case "i":
            case "nobr":
            case "s":
            case "small":
            case "strike":
            case "strong":
            case "tt":
            case "u":
              var Ge = Ic(s);
              if (Ge)
                return;
              break;
            case "applet":
            case "marquee":
            case "object":
              if (!p.inScope(s))
                return;
              p.generateImpliedEndTags(), p.popTag(s), d.clearToMarker();
              return;
            case "br":
              F(Se, s, null);
              return;
          }
          for (N = p.elements.length - 1; N >= 0; N--)
            if (H = p.elements[N], te(H, s)) {
              p.generateImpliedEndTags(s), p.popElement(H);
              break;
            } else if (te(H, Ft))
              return;
          return;
      }
    }
    function Wr(i, s, x, E) {
      switch (i) {
        case 1:
          Ze(s);
          return;
        case -1:
          p.top instanceof ee.HTMLScriptElement && (p.top._already_started = true), p.pop(), k = Fe, k(i);
          return;
        case 3:
          s === "script" ? Oc() : (p.pop(), k = Fe);
          return;
        default:
          return;
      }
    }
    function Be(i, s, x, E) {
      function v(H) {
        for (var W = 0, le = H.length; W < le; W++)
          if (H[W][0] === "type")
            return H[W][1].toLowerCase();
        return null;
      }
      switch (i) {
        case 1:
          if (o) {
            F(i, s, x, E);
            return;
          } else if (te(p.top, Jt)) {
            a = [], Fe = k, k = Tl, k(i, s, x, E);
            return;
          }
          break;
        case 4:
          Qe(s);
          return;
        case 5:
          return;
        case 2:
          switch (s) {
            case "caption":
              p.clearToContext(bn), d.insertMarker(), B(s, x), k = Wn;
              return;
            case "colgroup":
              p.clearToContext(bn), B(s, x), k = Gr;
              return;
            case "col":
              Be(Se, "colgroup", null), k(i, s, x, E);
              return;
            case "tbody":
            case "tfoot":
            case "thead":
              p.clearToContext(bn), B(s, x), k = At;
              return;
            case "td":
            case "th":
            case "tr":
              Be(Se, "tbody", null), k(i, s, x, E);
              return;
            case "table":
              if (!p.inTableScope(s))
                return;
              Be(G, s), k(i, s, x, E);
              return;
            case "style":
            case "script":
            case "template":
              fe(i, s, x, E);
              return;
            case "input":
              var N = v(x);
              if (N !== "hidden")
                break;
              B(s, x), p.pop();
              return;
            case "form":
              if (A || p.contains("template"))
                return;
              A = B(s, x), p.popElement(A);
              return;
          }
          break;
        case 3:
          switch (s) {
            case "table":
              if (!p.inTableScope(s))
                return;
              p.popTag(s), or();
              return;
            case "body":
            case "caption":
            case "col":
            case "colgroup":
            case "html":
            case "tbody":
            case "td":
            case "tfoot":
            case "th":
            case "thead":
            case "tr":
              return;
            case "template":
              fe(i, s, x, E);
              return;
          }
          break;
        case -1:
          F(i, s, x, E);
          return;
      }
      xt = true, F(i, s, x, E), xt = false;
    }
    function Tl(i, s, x, E) {
      if (i === Zt) {
        if (b && (s = s.replace(yn, ""), s.length === 0))
          return;
        a.push(s);
      } else {
        var v = a.join("");
        a.length = 0, vn.test(v) ? (xt = true, F(Zt, v), xt = false) : Ze(v), k = Fe, k(i, s, x, E);
      }
    }
    function Wn(i, s, x, E) {
      function v() {
        return p.inTableScope("caption") ? (p.generateImpliedEndTags(), p.popTag("caption"), d.clearToMarker(), k = Be, true) : false;
      }
      switch (i) {
        case 2:
          switch (s) {
            case "caption":
            case "col":
            case "colgroup":
            case "tbody":
            case "td":
            case "tfoot":
            case "th":
            case "thead":
            case "tr":
              v() && k(i, s, x, E);
              return;
          }
          break;
        case 3:
          switch (s) {
            case "caption":
              v();
              return;
            case "table":
              v() && k(i, s, x, E);
              return;
            case "body":
            case "col":
            case "colgroup":
            case "html":
            case "tbody":
            case "td":
            case "tfoot":
            case "th":
            case "thead":
            case "tr":
              return;
          }
          break;
      }
      F(i, s, x, E);
    }
    function Gr(i, s, x, E) {
      switch (i) {
        case 1:
          var v = s.match(Ht);
          if (v && (Ze(v[0]), s = s.substring(v[0].length)), s.length === 0)
            return;
          break;
        case 4:
          Qe(s);
          return;
        case 5:
          return;
        case 2:
          switch (s) {
            case "html":
              F(i, s, x, E);
              return;
            case "col":
              B(s, x), p.pop();
              return;
            case "template":
              fe(i, s, x, E);
              return;
          }
          break;
        case 3:
          switch (s) {
            case "colgroup":
              if (!te(p.top, "colgroup"))
                return;
              p.pop(), k = Be;
              return;
            case "col":
              return;
            case "template":
              fe(i, s, x, E);
              return;
          }
          break;
        case -1:
          F(i, s, x, E);
          return;
      }
      !te(p.top, "colgroup") || (Gr(G, "colgroup"), k(i, s, x, E));
    }
    function At(i, s, x, E) {
      function v() {
        !p.inTableScope("tbody") && !p.inTableScope("thead") && !p.inTableScope("tfoot") || (p.clearToContext(_n), At(G, p.top.localName, null), k(i, s, x, E));
      }
      switch (i) {
        case 2:
          switch (s) {
            case "tr":
              p.clearToContext(_n), B(s, x), k = fr;
              return;
            case "th":
            case "td":
              At(Se, "tr", null), k(i, s, x, E);
              return;
            case "caption":
            case "col":
            case "colgroup":
            case "tbody":
            case "tfoot":
            case "thead":
              v();
              return;
          }
          break;
        case 3:
          switch (s) {
            case "table":
              v();
              return;
            case "tbody":
            case "tfoot":
            case "thead":
              p.inTableScope(s) && (p.clearToContext(_n), p.pop(), k = Be);
              return;
            case "body":
            case "caption":
            case "col":
            case "colgroup":
            case "html":
            case "td":
            case "th":
            case "tr":
              return;
          }
          break;
      }
      Be(i, s, x, E);
    }
    function fr(i, s, x, E) {
      function v() {
        return p.inTableScope("tr") ? (p.clearToContext(ti), p.pop(), k = At, true) : false;
      }
      switch (i) {
        case 2:
          switch (s) {
            case "th":
            case "td":
              p.clearToContext(ti), B(s, x), k = Vt, d.insertMarker();
              return;
            case "caption":
            case "col":
            case "colgroup":
            case "tbody":
            case "tfoot":
            case "thead":
            case "tr":
              v() && k(i, s, x, E);
              return;
          }
          break;
        case 3:
          switch (s) {
            case "tr":
              v();
              return;
            case "table":
              v() && k(i, s, x, E);
              return;
            case "tbody":
            case "tfoot":
            case "thead":
              p.inTableScope(s) && v() && k(i, s, x, E);
              return;
            case "body":
            case "caption":
            case "col":
            case "colgroup":
            case "html":
            case "td":
            case "th":
              return;
          }
          break;
      }
      Be(i, s, x, E);
    }
    function Vt(i, s, x, E) {
      switch (i) {
        case 2:
          switch (s) {
            case "caption":
            case "col":
            case "colgroup":
            case "tbody":
            case "td":
            case "tfoot":
            case "th":
            case "thead":
            case "tr":
              p.inTableScope("td") ? (Vt(G, "td"), k(i, s, x, E)) : p.inTableScope("th") && (Vt(G, "th"), k(i, s, x, E));
              return;
          }
          break;
        case 3:
          switch (s) {
            case "td":
            case "th":
              if (!p.inTableScope(s))
                return;
              p.generateImpliedEndTags(), p.popTag(s), d.clearToMarker(), k = fr;
              return;
            case "body":
            case "caption":
            case "col":
            case "colgroup":
            case "html":
              return;
            case "table":
            case "tbody":
            case "tfoot":
            case "thead":
            case "tr":
              if (!p.inTableScope(s))
                return;
              Vt(G, p.inTableScope("td") ? "td" : "th"), k(i, s, x, E);
              return;
          }
          break;
      }
      F(i, s, x, E);
    }
    function st(i, s, x, E) {
      switch (i) {
        case 1:
          if (b && (s = s.replace(yn, ""), s.length === 0))
            return;
          Ze(s);
          return;
        case 4:
          Qe(s);
          return;
        case 5:
          return;
        case -1:
          F(i, s, x, E);
          return;
        case 2:
          switch (s) {
            case "html":
              F(i, s, x, E);
              return;
            case "option":
              p.top instanceof ee.HTMLOptionElement && st(G, s), B(s, x);
              return;
            case "optgroup":
              p.top instanceof ee.HTMLOptionElement && st(G, "option"), p.top instanceof ee.HTMLOptGroupElement && st(G, s), B(s, x);
              return;
            case "select":
              st(G, s);
              return;
            case "input":
            case "keygen":
            case "textarea":
              if (!p.inSelectScope("select"))
                return;
              st(G, "select"), k(i, s, x, E);
              return;
            case "script":
            case "template":
              fe(i, s, x, E);
              return;
          }
          break;
        case 3:
          switch (s) {
            case "optgroup":
              p.top instanceof ee.HTMLOptionElement && p.elements[p.elements.length - 2] instanceof ee.HTMLOptGroupElement && st(G, "option"), p.top instanceof ee.HTMLOptGroupElement && p.pop();
              return;
            case "option":
              p.top instanceof ee.HTMLOptionElement && p.pop();
              return;
            case "select":
              if (!p.inSelectScope(s))
                return;
              p.popTag(s), or();
              return;
            case "template":
              fe(i, s, x, E);
              return;
          }
          break;
      }
    }
    function Yr(i, s, x, E) {
      switch (s) {
        case "caption":
        case "table":
        case "tbody":
        case "tfoot":
        case "thead":
        case "tr":
        case "td":
        case "th":
          switch (i) {
            case 2:
              Yr(G, "select"), k(i, s, x, E);
              return;
            case 3:
              p.inTableScope(s) && (Yr(G, "select"), k(i, s, x, E));
              return;
          }
      }
      st(i, s, x, E);
    }
    function Gn(i, s, x, E) {
      function v(N) {
        k = N, je[je.length - 1] = k, k(i, s, x, E);
      }
      switch (i) {
        case 1:
        case 4:
        case 5:
          F(i, s, x, E);
          return;
        case -1:
          p.contains("template") ? (p.popTag("template"), d.clearToMarker(), je.pop(), or(), k(i, s, x, E)) : St();
          return;
        case 2:
          switch (s) {
            case "base":
            case "basefont":
            case "bgsound":
            case "link":
            case "meta":
            case "noframes":
            case "script":
            case "style":
            case "template":
            case "title":
              fe(i, s, x, E);
              return;
            case "caption":
            case "colgroup":
            case "tbody":
            case "tfoot":
            case "thead":
              v(Be);
              return;
            case "col":
              v(Gr);
              return;
            case "tr":
              v(At);
              return;
            case "td":
            case "th":
              v(fr);
              return;
          }
          v(F);
          return;
        case 3:
          switch (s) {
            case "template":
              fe(i, s, x, E);
              return;
            default:
              return;
          }
      }
    }
    function Ci(i, s, x, E) {
      switch (i) {
        case 1:
          if (vn.test(s))
            break;
          F(i, s);
          return;
        case 4:
          p.elements[0]._appendChild(L.createComment(s));
          return;
        case 5:
          return;
        case -1:
          St();
          return;
        case 2:
          if (s === "html") {
            F(i, s, x, E);
            return;
          }
          break;
        case 3:
          if (s === "html") {
            if (Xe)
              return;
            k = Sl;
            return;
          }
          break;
      }
      k = F, k(i, s, x, E);
    }
    function Yn(i, s, x, E) {
      switch (i) {
        case 1:
          s = s.replace(ni, ""), s.length > 0 && Ze(s);
          return;
        case 4:
          Qe(s);
          return;
        case 5:
          return;
        case -1:
          St();
          return;
        case 2:
          switch (s) {
            case "html":
              F(i, s, x, E);
              return;
            case "frameset":
              B(s, x);
              return;
            case "frame":
              B(s, x), p.pop();
              return;
            case "noframes":
              fe(i, s, x, E);
              return;
          }
          break;
        case 3:
          if (s === "frameset") {
            if (Xe && p.top instanceof ee.HTMLHtmlElement)
              return;
            p.pop(), !Xe && !(p.top instanceof ee.HTMLFrameSetElement) && (k = kl);
            return;
          }
          break;
      }
    }
    function kl(i, s, x, E) {
      switch (i) {
        case 1:
          s = s.replace(ni, ""), s.length > 0 && Ze(s);
          return;
        case 4:
          Qe(s);
          return;
        case 5:
          return;
        case -1:
          St();
          return;
        case 2:
          switch (s) {
            case "html":
              F(i, s, x, E);
              return;
            case "noframes":
              fe(i, s, x, E);
              return;
          }
          break;
        case 3:
          if (s === "html") {
            k = Nl;
            return;
          }
          break;
      }
    }
    function Sl(i, s, x, E) {
      switch (i) {
        case 1:
          if (vn.test(s))
            break;
          F(i, s, x, E);
          return;
        case 4:
          L._appendChild(L.createComment(s));
          return;
        case 5:
          F(i, s, x, E);
          return;
        case -1:
          St();
          return;
        case 2:
          if (s === "html") {
            F(i, s, x, E);
            return;
          }
          break;
      }
      k = F, k(i, s, x, E);
    }
    function Nl(i, s, x, E) {
      switch (i) {
        case 1:
          s = s.replace(ni, ""), s.length > 0 && F(i, s, x, E);
          return;
        case 4:
          L._appendChild(L.createComment(s));
          return;
        case 5:
          F(i, s, x, E);
          return;
        case -1:
          St();
          return;
        case 2:
          switch (s) {
            case "html":
              F(i, s, x, E);
              return;
            case "noframes":
              fe(i, s, x, E);
              return;
          }
          break;
      }
    }
    function Ai(i, s, x, E) {
      function v(le) {
        for (var ye = 0, Ue = le.length; ye < Ue; ye++)
          switch (le[ye][0]) {
            case "color":
            case "face":
            case "size":
              return true;
          }
        return false;
      }
      var N;
      switch (i) {
        case 1:
          h && q0.test(s) && (h = false), b && (s = s.replace(yn, "\uFFFD")), Ze(s);
          return;
        case 4:
          Qe(s);
          return;
        case 5:
          return;
        case 2:
          switch (s) {
            case "font":
              if (!v(x))
                break;
            case "b":
            case "big":
            case "blockquote":
            case "body":
            case "br":
            case "center":
            case "code":
            case "dd":
            case "div":
            case "dl":
            case "dt":
            case "em":
            case "embed":
            case "h1":
            case "h2":
            case "h3":
            case "h4":
            case "h5":
            case "h6":
            case "head":
            case "hr":
            case "i":
            case "img":
            case "li":
            case "listing":
            case "menu":
            case "meta":
            case "nobr":
            case "ol":
            case "p":
            case "pre":
            case "ruby":
            case "s":
            case "small":
            case "span":
            case "strong":
            case "strike":
            case "sub":
            case "sup":
            case "table":
            case "tt":
            case "u":
            case "ul":
            case "var":
              if (Xe)
                break;
              do
                p.pop(), N = p.top;
              while (N.namespaceURI !== q.HTML && !Zo(N) && !Jo(N));
              pe(i, s, x, E);
              return;
          }
          N = p.elements.length === 1 && Xe ? t : p.top, N.namespaceURI === q.MATHML ? tc(x) : N.namespaceURI === q.SVG && (s = H0(s), ec(x)), ai(x), On(s, x, N.namespaceURI), E && (s === "script" && N.namespaceURI === q.SVG, p.pop());
          return;
        case 3:
          if (N = p.top, s === "script" && N.namespaceURI === q.SVG && N.localName === "script")
            p.pop();
          else
            for (var H = p.elements.length - 1, W = p.elements[H]; ; ) {
              if (W.localName.toLowerCase() === s) {
                p.popElement(W);
                break;
              }
              if (W = p.elements[--H], W.namespaceURI === q.HTML) {
                k(i, s, x, E);
                break;
              }
            }
          return;
      }
    }
    return I.testTokenizer = function(i, s, x, E) {
      var v = [];
      switch (s) {
        case "PCDATA state":
          g = j;
          break;
        case "RCDATA state":
          g = pt;
          break;
        case "RAWTEXT state":
          g = lr;
          break;
        case "PLAINTEXT state":
          g = Or;
          break;
      }
      if (x && (ve = x), pe = function(H, W, le, ye) {
        switch (Ut(), H) {
          case 1:
            v.length > 0 && v[v.length - 1][0] === "Character" ? v[v.length - 1][1] += W : v.push(["Character", W]);
            break;
          case 4:
            v.push(["Comment", W]);
            break;
          case 5:
            v.push(["DOCTYPE", W, le === void 0 ? null : le, ye === void 0 ? null : ye, !m]);
            break;
          case 2:
            for (var Ue = Object.create(null), Ge = 0; Ge < le.length; Ge++) {
              var Lt = le[Ge];
              Lt.length === 1 ? Ue[Lt[0]] = "" : Ue[Lt[0]] = Lt[1];
            }
            var Et = ["StartTag", W, Ue];
            ye && Et.push(true), v.push(Et);
            break;
          case 3:
            v.push(["EndTag", W]);
            break;
        }
      }, !E)
        this.parse(i, true);
      else {
        for (var N = 0; N < i.length; N++)
          this.parse(i[N]);
        this.parse("", true);
      }
      return v;
    }, I;
  }
});
var oi = O((Sn) => {
  var ac = Xt(), P0 = Qa(), B0 = he(), U0 = xn(), V0 = Sn.elements = {}, ic = Object.create(null);
  Sn.createElement = function(e, t, r) {
    var n = ic[t] || si;
    return new n(e, t, r);
  };
  function ii(e) {
    return P0(e, si, V0, ic);
  }
  var si = ii({ superclass: ac, ctor: function(t, r, n) {
    ac.call(this, t, r, B0.NAMESPACE.SVG, n);
  }, props: { style: { get: function() {
    return this._style || (this._style = new U0(this)), this._style;
  } } } });
  ii({ ctor: function(t, r, n) {
    si.call(this, t, r, n);
  }, tag: "svg", props: { createSVGRect: { value: function() {
    return Sn.createElement(this.ownerDocument, "rect", null);
  } } } });
  ii({ tags: ["a", "altGlyph", "altGlyphDef", "altGlyphItem", "animate", "animateColor", "animateMotion", "animateTransform", "circle", "clipPath", "color-profile", "cursor", "defs", "desc", "ellipse", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence", "filter", "font", "font-face", "font-face-format", "font-face-name", "font-face-src", "font-face-uri", "foreignObject", "g", "glyph", "glyphRef", "hkern", "image", "line", "linearGradient", "marker", "mask", "metadata", "missing-glyph", "mpath", "path", "pattern", "polygon", "polyline", "radialGradient", "rect", "script", "set", "stop", "style", "switch", "symbol", "text", "textPath", "title", "tref", "tspan", "use", "view", "vkern"] });
});
var li = O((Tr, sc) => {
  var ci = he();
  Tr = sc.exports = { CSSStyleDeclaration: xn(), CharacterData: Er(), Comment: Ia(), DOMException: Kr(), DOMImplementation: kr(), DOMTokenList: ba(), Document: kn(), DocumentFragment: Fa(), DocumentType: mn(), Element: Xt(), HTMLParser: wn(), NamedNodeMap: Ta(), Node: we(), NodeList: It(), NodeFilter: vr(), ProcessingInstruction: Pa(), Text: Ra(), Window: Nn() };
  ci.merge(Tr, $a());
  ci.merge(Tr, Tn().elements);
  ci.merge(Tr, oi().elements);
});
var Nn = O((hd, oc) => {
  var z0 = kr(), j0 = ea(), W0 = Co(), G0 = Xa(), Sr = he();
  oc.exports = Cn;
  function Cn(e) {
    this.document = e || new z0(null).createHTMLDocument(""), this.document._scripting_enabled = true, this.document.defaultView = this, this.location = new W0(this, this.document._address || "about:blank");
  }
  Cn.prototype = Object.create(j0.prototype, { _run: { value: G0.Window_run }, console: { value: console }, history: { value: { back: Sr.nyi, forward: Sr.nyi, go: Sr.nyi } }, navigator: { value: Lo() }, window: { get: function() {
    return this;
  } }, self: { get: function() {
    return this;
  } }, frames: { get: function() {
    return this;
  } }, parent: { get: function() {
    return this;
  } }, top: { get: function() {
    return this;
  } }, length: { value: 0 }, frameElement: { value: null }, opener: { value: null }, onload: { get: function() {
    return this._getEventHandler("load");
  }, set: function(e) {
    this._setEventHandler("load", e);
  } }, getComputedStyle: { value: function(t) {
    return t.style;
  } } });
  Sr.expose(Ro(), Cn);
  Sr.expose(li(), Cn);
});
var Tn = O((Ln) => {
  var ui = we(), cc = Xt(), Y0 = xn(), Ie = he(), lc = Ka(), $0 = Qa(), lt = Ln.elements = {}, Nr = Object.create(null);
  Ln.createElement = function(e, t, r) {
    var n = Nr[t] || X0;
    return new n(e, t, r);
  };
  function C(e) {
    return $0(e, R, lt, Nr);
  }
  function ge(e) {
    return { get: function() {
      var t = this._getattr(e);
      if (t === null)
        return "";
      var r = this.doc._resolve(t);
      return r === null ? t : r;
    }, set: function(t) {
      this._setattr(e, t);
    } };
  }
  function An(e) {
    return { get: function() {
      var t = this._getattr(e);
      return t === null ? null : t.toLowerCase() === "use-credentials" ? "use-credentials" : "anonymous";
    }, set: function(t) {
      t == null ? this.removeAttribute(e) : this._setattr(e, t);
    } };
  }
  var Cr = { type: ["", "no-referrer", "no-referrer-when-downgrade", "same-origin", "origin", "strict-origin", "origin-when-cross-origin", "strict-origin-when-cross-origin", "unsafe-url"], missing: "" }, K0 = { A: true, LINK: true, BUTTON: true, INPUT: true, SELECT: true, TEXTAREA: true, COMMAND: true }, $e = function(e, t, r) {
    R.call(this, e, t, r), this._form = null;
  }, R = Ln.HTMLElement = C({ superclass: cc, ctor: function(t, r, n) {
    cc.call(this, t, r, Ie.NAMESPACE.HTML, n);
  }, props: { innerHTML: { get: function() {
    return this.serialize();
  }, set: function(e) {
    var t = this.ownerDocument.implementation.mozHTMLParser(this.ownerDocument._address, this);
    t.parse(e === null ? "" : String(e), true);
    for (var r = this instanceof Nr.template ? this.content : this; r.hasChildNodes(); )
      r.removeChild(r.firstChild);
    r.appendChild(t._asDocumentFragment());
  } }, style: { get: function() {
    return this._style || (this._style = new Y0(this)), this._style;
  }, set: function(e) {
    e == null && (e = ""), this._setattr("style", String(e));
  } }, blur: { value: function() {
  } }, focus: { value: function() {
  } }, forceSpellCheck: { value: function() {
  } }, click: { value: function() {
    if (!this._click_in_progress) {
      this._click_in_progress = true;
      try {
        this._pre_click_activation_steps && this._pre_click_activation_steps();
        var e = this.ownerDocument.createEvent("MouseEvent");
        e.initMouseEvent("click", true, true, this.ownerDocument.defaultView, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
        var t = this.dispatchEvent(e);
        t ? this._post_click_activation_steps && this._post_click_activation_steps(e) : this._cancelled_activation_steps && this._cancelled_activation_steps();
      } finally {
        this._click_in_progress = false;
      }
    }
  } }, submit: { value: Ie.nyi } }, attributes: { title: String, lang: String, dir: { type: ["ltr", "rtl", "auto"], missing: "" }, accessKey: String, hidden: Boolean, tabIndex: { type: "long", default: function() {
    return this.tagName in K0 || this.contentEditable ? 0 : -1;
  } } }, events: ["abort", "canplay", "canplaythrough", "change", "click", "contextmenu", "cuechange", "dblclick", "drag", "dragend", "dragenter", "dragleave", "dragover", "dragstart", "drop", "durationchange", "emptied", "ended", "input", "invalid", "keydown", "keypress", "keyup", "loadeddata", "loadedmetadata", "loadstart", "mousedown", "mousemove", "mouseout", "mouseover", "mouseup", "mousewheel", "pause", "play", "playing", "progress", "ratechange", "readystatechange", "reset", "seeked", "seeking", "select", "show", "stalled", "submit", "suspend", "timeupdate", "volumechange", "waiting", "blur", "error", "focus", "load", "scroll"] }), X0 = C({ ctor: function(t, r, n) {
    R.call(this, t, r, n);
  } }), Ke = { form: { get: function() {
    return this._form;
  } } };
  C({ tag: "a", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, props: { _post_click_activation_steps: { value: function(e) {
    this.href && (this.ownerDocument.defaultView.location = this.href);
  } } }, attributes: { href: ge, ping: String, download: String, target: String, rel: String, media: String, hreflang: String, type: String, referrerPolicy: Cr, coords: String, charset: String, name: String, rev: String, shape: String } });
  lc._inherit(Nr.a.prototype);
  C({ tag: "area", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { alt: String, target: String, download: String, rel: String, media: String, href: ge, hreflang: String, type: String, shape: String, coords: String, ping: String, referrerPolicy: Cr, noHref: Boolean } });
  lc._inherit(Nr.area.prototype);
  C({ tag: "br", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { clear: String } });
  C({ tag: "base", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { target: String } });
  C({ tag: "body", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, events: ["afterprint", "beforeprint", "beforeunload", "blur", "error", "focus", "hashchange", "load", "message", "offline", "online", "pagehide", "pageshow", "popstate", "resize", "scroll", "storage", "unload"], attributes: { text: { type: String, treatNullAsEmptyString: true }, link: { type: String, treatNullAsEmptyString: true }, vLink: { type: String, treatNullAsEmptyString: true }, aLink: { type: String, treatNullAsEmptyString: true }, bgColor: { type: String, treatNullAsEmptyString: true }, background: String } });
  C({ tag: "button", ctor: function(t, r, n) {
    $e.call(this, t, r, n);
  }, props: Ke, attributes: { name: String, value: String, disabled: Boolean, autofocus: Boolean, type: { type: ["submit", "reset", "button", "menu"], missing: "submit" }, formTarget: String, formNoValidate: Boolean, formMethod: { type: ["get", "post", "dialog"], invalid: "get", missing: "" }, formEnctype: { type: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"], invalid: "application/x-www-form-urlencoded", missing: "" } } });
  C({ tag: "dl", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { compact: Boolean } });
  C({ tag: "data", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { value: String } });
  C({ tag: "datalist", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  } });
  C({ tag: "details", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { open: Boolean } });
  C({ tag: "div", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { align: String } });
  C({ tag: "embed", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { src: ge, type: String, width: String, height: String, align: String, name: String } });
  C({ tag: "fieldset", ctor: function(t, r, n) {
    $e.call(this, t, r, n);
  }, props: Ke, attributes: { disabled: Boolean, name: String } });
  C({ tag: "form", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { action: String, autocomplete: { type: ["on", "off"], missing: "on" }, name: String, acceptCharset: { name: "accept-charset" }, target: String, noValidate: Boolean, method: { type: ["get", "post", "dialog"], invalid: "get", missing: "get" }, enctype: { type: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"], invalid: "application/x-www-form-urlencoded", missing: "application/x-www-form-urlencoded" }, encoding: { name: "enctype", type: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"], invalid: "application/x-www-form-urlencoded", missing: "application/x-www-form-urlencoded" } } });
  C({ tag: "hr", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { align: String, color: String, noShade: Boolean, size: String, width: String } });
  C({ tag: "head", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  } });
  C({ tags: ["h1", "h2", "h3", "h4", "h5", "h6"], ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { align: String } });
  C({ tag: "html", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { version: String } });
  C({ tag: "iframe", ctor: function(t, r, n) {
    R.call(this, t, r, n);
    var l = Nn();
    this._contentWindow = new l();
  }, props: { contentWindow: { get: function() {
    return this._contentWindow;
  } }, contentDocument: { get: function() {
    return this.contentWindow.document;
  } } }, attributes: { src: ge, srcdoc: String, name: String, width: String, height: String, seamless: Boolean, allowFullscreen: Boolean, allowUserMedia: Boolean, allowPaymentRequest: Boolean, referrerPolicy: Cr, align: String, scrolling: String, frameBorder: String, longDesc: ge, marginHeight: { type: String, treatNullAsEmptyString: true }, marginWidth: { type: String, treatNullAsEmptyString: true } } });
  C({ tag: "img", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { alt: String, src: ge, srcset: String, crossOrigin: An, useMap: String, isMap: Boolean, height: { type: "unsigned long", default: 0 }, width: { type: "unsigned long", default: 0 }, referrerPolicy: Cr, name: String, lowsrc: ge, align: String, hspace: { type: "unsigned long", default: 0 }, vspace: { type: "unsigned long", default: 0 }, longDesc: ge, border: { type: String, treatNullAsEmptyString: true } } });
  C({ tag: "input", ctor: function(t, r, n) {
    $e.call(this, t, r, n);
  }, props: { form: Ke.form, _post_click_activation_steps: { value: function(e) {
    if (this.type === "checkbox")
      this.checked = !this.checked;
    else if (this.type === "radio")
      for (var t = this.form.getElementsByName(this.name), r = t.length - 1; r >= 0; r--) {
        var n = t[r];
        n.checked = n === this;
      }
  } } }, attributes: { name: String, disabled: Boolean, autofocus: Boolean, accept: String, alt: String, max: String, min: String, pattern: String, placeholder: String, step: String, dirName: String, defaultValue: { name: "value" }, multiple: Boolean, required: Boolean, readOnly: Boolean, checked: Boolean, value: String, src: ge, defaultChecked: { name: "checked", type: Boolean }, size: { type: "unsigned long", default: 20, min: 1, setmin: 1 }, width: { type: "unsigned long", min: 0, setmin: 0, default: 0 }, height: { type: "unsigned long", min: 0, setmin: 0, default: 0 }, minLength: { type: "unsigned long", min: 0, setmin: 0, default: -1 }, maxLength: { type: "unsigned long", min: 0, setmin: 0, default: -1 }, autocomplete: String, type: { type: ["text", "hidden", "search", "tel", "url", "email", "password", "datetime", "date", "month", "week", "time", "datetime-local", "number", "range", "color", "checkbox", "radio", "file", "submit", "image", "reset", "button"], missing: "text" }, formTarget: String, formNoValidate: Boolean, formMethod: { type: ["get", "post"], invalid: "get", missing: "" }, formEnctype: { type: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"], invalid: "application/x-www-form-urlencoded", missing: "" }, inputMode: { type: ["verbatim", "latin", "latin-name", "latin-prose", "full-width-latin", "kana", "kana-name", "katakana", "numeric", "tel", "email", "url"], missing: "" }, align: String, useMap: String } });
  C({ tag: "keygen", ctor: function(t, r, n) {
    $e.call(this, t, r, n);
  }, props: Ke, attributes: { name: String, disabled: Boolean, autofocus: Boolean, challenge: String, keytype: { type: ["rsa"], missing: "" } } });
  C({ tag: "li", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { value: { type: "long", default: 0 }, type: String } });
  C({ tag: "label", ctor: function(t, r, n) {
    $e.call(this, t, r, n);
  }, props: Ke, attributes: { htmlFor: { name: "for", type: String } } });
  C({ tag: "legend", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { align: String } });
  C({ tag: "link", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { href: ge, rel: String, media: String, hreflang: String, type: String, crossOrigin: An, nonce: String, integrity: String, referrerPolicy: Cr, charset: String, rev: String, target: String } });
  C({ tag: "map", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { name: String } });
  C({ tag: "menu", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { type: { type: ["context", "popup", "toolbar"], missing: "toolbar" }, label: String, compact: Boolean } });
  C({ tag: "meta", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { name: String, content: String, httpEquiv: { name: "http-equiv", type: String }, scheme: String } });
  C({ tag: "meter", ctor: function(t, r, n) {
    $e.call(this, t, r, n);
  }, props: Ke });
  C({ tags: ["ins", "del"], ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { cite: ge, dateTime: String } });
  C({ tag: "ol", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, props: { _numitems: { get: function() {
    var e = 0;
    return this.childNodes.forEach(function(t) {
      t.nodeType === ui.ELEMENT_NODE && t.tagName === "LI" && e++;
    }), e;
  } } }, attributes: { type: String, reversed: Boolean, start: { type: "long", default: function() {
    return this.reversed ? this._numitems : 1;
  } }, compact: Boolean } });
  C({ tag: "object", ctor: function(t, r, n) {
    $e.call(this, t, r, n);
  }, props: Ke, attributes: { data: ge, type: String, name: String, useMap: String, typeMustMatch: Boolean, width: String, height: String, align: String, archive: String, code: String, declare: Boolean, hspace: { type: "unsigned long", default: 0 }, standby: String, vspace: { type: "unsigned long", default: 0 }, codeBase: ge, codeType: String, border: { type: String, treatNullAsEmptyString: true } } });
  C({ tag: "optgroup", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { disabled: Boolean, label: String } });
  C({ tag: "option", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, props: { form: { get: function() {
    for (var e = this.parentNode; e && e.nodeType === ui.ELEMENT_NODE; ) {
      if (e.localName === "select")
        return e.form;
      e = e.parentNode;
    }
  } }, value: { get: function() {
    return this._getattr("value") || this.text;
  }, set: function(e) {
    this._setattr("value", e);
  } }, text: { get: function() {
    return this.textContent.replace(/[ \t\n\f\r]+/g, " ").trim();
  }, set: function(e) {
    this.textContent = e;
  } } }, attributes: { disabled: Boolean, defaultSelected: { name: "selected", type: Boolean }, label: String } });
  C({ tag: "output", ctor: function(t, r, n) {
    $e.call(this, t, r, n);
  }, props: Ke, attributes: { name: String } });
  C({ tag: "p", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { align: String } });
  C({ tag: "param", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { name: String, value: String, type: String, valueType: String } });
  C({ tags: ["pre", "listing", "xmp"], ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { width: { type: "long", default: 0 } } });
  C({ tag: "progress", ctor: function(t, r, n) {
    $e.call(this, t, r, n);
  }, props: Ke, attributes: { max: { type: Number, float: true, default: 1, min: 0 } } });
  C({ tags: ["q", "blockquote"], ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { cite: ge } });
  C({ tag: "script", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, props: { text: { get: function() {
    for (var e = "", t = 0, r = this.childNodes.length; t < r; t++) {
      var n = this.childNodes[t];
      n.nodeType === ui.TEXT_NODE && (e += n._data);
    }
    return e;
  }, set: function(e) {
    this.removeChildren(), e !== null && e !== "" && this.appendChild(this.ownerDocument.createTextNode(e));
  } } }, attributes: { src: ge, type: String, charset: String, defer: Boolean, async: Boolean, crossOrigin: An, nonce: String, integrity: String } });
  C({ tag: "select", ctor: function(t, r, n) {
    $e.call(this, t, r, n);
  }, props: { form: Ke.form, options: { get: function() {
    return this.getElementsByTagName("option");
  } } }, attributes: { autocomplete: String, name: String, disabled: Boolean, autofocus: Boolean, multiple: Boolean, required: Boolean, size: { type: "unsigned long", default: 0 } } });
  C({ tag: "source", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { src: ge, type: String, media: String } });
  C({ tag: "span", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  } });
  C({ tag: "style", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { media: String, type: String, scoped: Boolean } });
  C({ tag: "caption", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { align: String } });
  C({ ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { colSpan: { type: "unsigned long", default: 1 }, rowSpan: { type: "unsigned long", default: 1 }, scope: { type: ["row", "col", "rowgroup", "colgroup"], missing: "" }, abbr: String, align: String, axis: String, height: String, width: String, ch: { name: "char", type: String }, chOff: { name: "charoff", type: String }, noWrap: Boolean, vAlign: String, bgColor: { type: String, treatNullAsEmptyString: true } } });
  C({ tags: ["col", "colgroup"], ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { span: { type: "limited unsigned long with fallback", default: 1, min: 1 }, align: String, ch: { name: "char", type: String }, chOff: { name: "charoff", type: String }, vAlign: String, width: String } });
  C({ tag: "table", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, props: { rows: { get: function() {
    return this.getElementsByTagName("tr");
  } } }, attributes: { align: String, border: String, frame: String, rules: String, summary: String, width: String, bgColor: { type: String, treatNullAsEmptyString: true }, cellPadding: { type: String, treatNullAsEmptyString: true }, cellSpacing: { type: String, treatNullAsEmptyString: true } } });
  C({ tag: "template", ctor: function(t, r, n) {
    R.call(this, t, r, n), this._contentFragment = t._templateDoc.createDocumentFragment();
  }, props: { content: { get: function() {
    return this._contentFragment;
  } }, serialize: { value: function() {
    return this.content.serialize();
  } } } });
  C({ tag: "tr", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, props: { cells: { get: function() {
    return this.querySelectorAll("td,th");
  } } }, attributes: { align: String, ch: { name: "char", type: String }, chOff: { name: "charoff", type: String }, vAlign: String, bgColor: { type: String, treatNullAsEmptyString: true } } });
  C({ tags: ["thead", "tfoot", "tbody"], ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, props: { rows: { get: function() {
    return this.getElementsByTagName("tr");
  } } }, attributes: { align: String, ch: { name: "char", type: String }, chOff: { name: "charoff", type: String }, vAlign: String } });
  C({ tag: "textarea", ctor: function(t, r, n) {
    $e.call(this, t, r, n);
  }, props: { form: Ke.form, type: { get: function() {
    return "textarea";
  } }, defaultValue: { get: function() {
    return this.textContent;
  }, set: function(e) {
    this.textContent = e;
  } }, value: { get: function() {
    return this.defaultValue;
  }, set: function(e) {
    this.defaultValue = e;
  } }, textLength: { get: function() {
    return this.value.length;
  } } }, attributes: { autocomplete: String, name: String, disabled: Boolean, autofocus: Boolean, placeholder: String, wrap: String, dirName: String, required: Boolean, readOnly: Boolean, rows: { type: "limited unsigned long with fallback", default: 2 }, cols: { type: "limited unsigned long with fallback", default: 20 }, maxLength: { type: "unsigned long", min: 0, setmin: 0, default: -1 }, minLength: { type: "unsigned long", min: 0, setmin: 0, default: -1 }, inputMode: { type: ["verbatim", "latin", "latin-name", "latin-prose", "full-width-latin", "kana", "kana-name", "katakana", "numeric", "tel", "email", "url"], missing: "" } } });
  C({ tag: "time", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { dateTime: String, pubDate: Boolean } });
  C({ tag: "title", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, props: { text: { get: function() {
    return this.textContent;
  } } } });
  C({ tag: "ul", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { type: String, compact: Boolean } });
  C({ ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { src: ge, crossOrigin: An, preload: { type: ["metadata", "none", "auto", { value: "", alias: "auto" }], missing: "auto" }, loop: Boolean, autoplay: Boolean, mediaGroup: String, controls: Boolean, defaultMuted: { name: "muted", type: Boolean } } });
  C({ tag: "audio", superclass: lt.HTMLMediaElement, ctor: function(t, r, n) {
    lt.HTMLMediaElement.call(this, t, r, n);
  } });
  C({ tag: "video", superclass: lt.HTMLMediaElement, ctor: function(t, r, n) {
    lt.HTMLMediaElement.call(this, t, r, n);
  }, attributes: { poster: ge, width: { type: "unsigned long", min: 0, default: 0 }, height: { type: "unsigned long", min: 0, default: 0 } } });
  C({ tag: "td", superclass: lt.HTMLTableCellElement, ctor: function(t, r, n) {
    lt.HTMLTableCellElement.call(this, t, r, n);
  } });
  C({ tag: "th", superclass: lt.HTMLTableCellElement, ctor: function(t, r, n) {
    lt.HTMLTableCellElement.call(this, t, r, n);
  } });
  C({ tag: "frameset", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  } });
  C({ tag: "frame", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  } });
  C({ tag: "canvas", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, props: { getContext: { value: Ie.nyi }, probablySupportsContext: { value: Ie.nyi }, setContext: { value: Ie.nyi }, transferControlToProxy: { value: Ie.nyi }, toDataURL: { value: Ie.nyi }, toBlob: { value: Ie.nyi } }, attributes: { width: { type: "unsigned long", default: 300 }, height: { type: "unsigned long", default: 150 } } });
  C({ tag: "dialog", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, props: { show: { value: Ie.nyi }, showModal: { value: Ie.nyi }, close: { value: Ie.nyi } }, attributes: { open: Boolean, returnValue: String } });
  C({ tag: "menuitem", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, props: { _label: { get: function() {
    var e = this._getattr("label");
    return e !== null && e !== "" ? e : (e = this.textContent, e.replace(/[ \t\n\f\r]+/g, " ").trim());
  } }, label: { get: function() {
    var e = this._getattr("label");
    return e !== null ? e : this._label;
  }, set: function(e) {
    this._setattr("label", e);
  } } }, attributes: { type: { type: ["command", "checkbox", "radio"], missing: "command" }, icon: ge, disabled: Boolean, checked: Boolean, radiogroup: String, default: Boolean } });
  C({ tag: "source", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { srcset: String, sizes: String, media: String, src: ge, type: String } });
  C({ tag: "track", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { src: ge, srclang: String, label: String, default: Boolean, kind: { type: ["subtitles", "captions", "descriptions", "chapters", "metadata"], missing: "subtitles", invalid: "metadata" } }, props: { NONE: { get: function() {
    return 0;
  } }, LOADING: { get: function() {
    return 1;
  } }, LOADED: { get: function() {
    return 2;
  } }, ERROR: { get: function() {
    return 3;
  } }, readyState: { get: Ie.nyi }, track: { get: Ie.nyi } } });
  C({ tag: "font", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { color: { type: String, treatNullAsEmptyString: true }, face: { type: String }, size: { type: String } } });
  C({ tag: "dir", ctor: function(t, r, n) {
    R.call(this, t, r, n);
  }, attributes: { compact: Boolean } });
  C({ tags: ["abbr", "address", "article", "aside", "b", "bdi", "bdo", "cite", "code", "dd", "dfn", "dt", "em", "figcaption", "figure", "footer", "header", "hgroup", "i", "kbd", "main", "mark", "nav", "noscript", "rb", "rp", "rt", "rtc", "ruby", "s", "samp", "section", "small", "strong", "sub", "summary", "sup", "u", "var", "wbr", "acronym", "basefont", "big", "center", "nobr", "noembed", "noframes", "plaintext", "strike", "tt"] });
});
var fc = O((pd, uc) => {
  uc.exports = { VALUE: 1, ATTR: 2, REMOVE_ATTR: 3, REMOVE: 4, MOVE: 5, INSERT: 6 };
});
var kn = O((md, vc) => {
  vc.exports = Lr;
  var Ce = we(), Q0 = It(), dc = Jr(), Tt = Xt(), Z0 = Ra(), J0 = Ia(), Ar = zt(), ef = Fa(), tf = Pa(), rf = kr(), nf = ao(), af = uo(), hc = vr(), xc = hn(), pc = an(), sf = $a(), Dn = en(), fi = Tn(), of = oi(), K = he(), er = fc(), tr = K.NAMESPACE, di = Xr().isApiWritable;
  function Lr(e, t) {
    dc.call(this), this.nodeType = Ce.DOCUMENT_NODE, this.isHTML = e, this._address = t || "about:blank", this.readyState = "loading", this.implementation = new rf(this), this.ownerDocument = null, this._contentType = e ? "text/html" : "application/xml", this.doctype = null, this.documentElement = null, this._templateDocCache = null, this._nodeIterators = null, this._nid = 1, this._nextnid = 2, this._nodes = [null, this], this.byId = Object.create(null), this.modclock = 0;
  }
  var cf = { event: "Event", customevent: "CustomEvent", uievent: "UIEvent", mouseevent: "MouseEvent" }, lf = { events: "event", htmlevents: "event", mouseevents: "mouseevent", mutationevents: "mutationevent", uievents: "uievent" }, rr = function(e, t, r) {
    return { get: function() {
      var n = e.call(this);
      return n ? n[t] : r;
    }, set: function(n) {
      var l = e.call(this);
      l && (l[t] = n);
    } };
  };
  function mc(e, t) {
    var r, n, l;
    return e === "" && (e = null), Dn.isValidQName(t) || K.InvalidCharacterError(), r = null, n = t, l = t.indexOf(":"), l >= 0 && (r = t.substring(0, l), n = t.substring(l + 1)), r !== null && e === null && K.NamespaceError(), r === "xml" && e !== tr.XML && K.NamespaceError(), (r === "xmlns" || t === "xmlns") && e !== tr.XMLNS && K.NamespaceError(), e === tr.XMLNS && !(r === "xmlns" || t === "xmlns") && K.NamespaceError(), { namespace: e, prefix: r, localName: n };
  }
  Lr.prototype = Object.create(dc.prototype, { _setMutationHandler: { value: function(e) {
    this.mutationHandler = e;
  } }, _dispatchRendererEvent: { value: function(e, t, r) {
    var n = this._nodes[e];
    !n || n._dispatchEvent(new Ar(t, r), true);
  } }, nodeName: { value: "#document" }, nodeValue: { get: function() {
    return null;
  }, set: function() {
  } }, documentURI: { get: function() {
    return this._address;
  }, set: K.nyi }, compatMode: { get: function() {
    return this._quirks ? "BackCompat" : "CSS1Compat";
  } }, createTextNode: { value: function(e) {
    return new Z0(this, String(e));
  } }, createComment: { value: function(e) {
    return new J0(this, e);
  } }, createDocumentFragment: { value: function() {
    return new ef(this);
  } }, createProcessingInstruction: { value: function(e, t) {
    return (!Dn.isValidName(e) || t.indexOf("?>") !== -1) && K.InvalidCharacterError(), new tf(this, e, t);
  } }, createAttribute: { value: function(e) {
    return e = String(e), Dn.isValidName(e) || K.InvalidCharacterError(), this.isHTML && (e = K.toASCIILowerCase(e)), new Tt._Attr(null, e, null, null, "");
  } }, createAttributeNS: { value: function(e, t) {
    e = e == null || e === "" ? null : String(e), t = String(t);
    var r = mc(e, t);
    return new Tt._Attr(null, r.localName, r.prefix, r.namespace, "");
  } }, createElement: { value: function(e) {
    return e = String(e), Dn.isValidName(e) || K.InvalidCharacterError(), this.isHTML ? (/[A-Z]/.test(e) && (e = K.toASCIILowerCase(e)), fi.createElement(this, e, null)) : this.contentType === "application/xhtml+xml" ? fi.createElement(this, e, null) : new Tt(this, e, null, null);
  }, writable: di }, createElementNS: { value: function(e, t) {
    e = e == null || e === "" ? null : String(e), t = String(t);
    var r = mc(e, t);
    return this._createElementNS(r.localName, r.namespace, r.prefix);
  }, writable: di }, _createElementNS: { value: function(e, t, r) {
    return t === tr.HTML ? fi.createElement(this, e, r) : t === tr.SVG ? of.createElement(this, e, r) : new Tt(this, e, t, r);
  } }, createEvent: { value: function(t) {
    t = t.toLowerCase();
    var r = lf[t] || t, n = sf[cf[r]];
    if (n) {
      var l = new n();
      return l._initialized = false, l;
    } else
      K.NotSupportedError();
  } }, createTreeWalker: { value: function(e, t, r) {
    if (!e)
      throw new TypeError("root argument is required");
    if (!(e instanceof Ce))
      throw new TypeError("root not a node");
    return t = t === void 0 ? hc.SHOW_ALL : +t, r = r === void 0 ? null : r, new nf(e, t, r);
  } }, createNodeIterator: { value: function(e, t, r) {
    if (!e)
      throw new TypeError("root argument is required");
    if (!(e instanceof Ce))
      throw new TypeError("root not a node");
    return t = t === void 0 ? hc.SHOW_ALL : +t, r = r === void 0 ? null : r, new af(e, t, r);
  } }, _attachNodeIterator: { value: function(e) {
    this._nodeIterators || (this._nodeIterators = []), this._nodeIterators.push(e);
  } }, _detachNodeIterator: { value: function(e) {
    var t = this._nodeIterators.indexOf(e);
    this._nodeIterators.splice(t, 1);
  } }, _preremoveNodeIterators: { value: function(e) {
    this._nodeIterators && this._nodeIterators.forEach(function(t) {
      t._preremove(e);
    });
  } }, _updateDocTypeElement: { value: function() {
    this.doctype = this.documentElement = null;
    for (var t = this.firstChild; t !== null; t = t.nextSibling)
      t.nodeType === Ce.DOCUMENT_TYPE_NODE ? this.doctype = t : t.nodeType === Ce.ELEMENT_NODE && (this.documentElement = t);
  } }, insertBefore: { value: function(t, r) {
    return Ce.prototype.insertBefore.call(this, t, r), this._updateDocTypeElement(), t;
  } }, replaceChild: { value: function(t, r) {
    return Ce.prototype.replaceChild.call(this, t, r), this._updateDocTypeElement(), r;
  } }, removeChild: { value: function(t) {
    return Ce.prototype.removeChild.call(this, t), this._updateDocTypeElement(), t;
  } }, getElementById: { value: function(e) {
    var t = this.byId[e];
    return t ? t instanceof ut ? t.getFirst() : t : null;
  } }, _hasMultipleElementsWithId: { value: function(e) {
    return this.byId[e] instanceof ut;
  } }, getElementsByName: { value: Tt.prototype.getElementsByName }, getElementsByTagName: { value: Tt.prototype.getElementsByTagName }, getElementsByTagNameNS: { value: Tt.prototype.getElementsByTagNameNS }, getElementsByClassName: { value: Tt.prototype.getElementsByClassName }, adoptNode: { value: function(t) {
    return t.nodeType === Ce.DOCUMENT_NODE && K.NotSupportedError(), t.nodeType === Ce.ATTRIBUTE_NODE || (t.parentNode && t.parentNode.removeChild(t), t.ownerDocument !== this && Ec(t, this)), t;
  } }, importNode: { value: function(t, r) {
    return this.adoptNode(t.cloneNode(r));
  }, writable: di }, origin: { get: function() {
    return null;
  } }, characterSet: { get: function() {
    return "UTF-8";
  } }, contentType: { get: function() {
    return this._contentType;
  } }, URL: { get: function() {
    return this._address;
  } }, domain: { get: K.nyi, set: K.nyi }, referrer: { get: K.nyi }, cookie: { get: K.nyi, set: K.nyi }, lastModified: { get: K.nyi }, location: { get: function() {
    return this.defaultView ? this.defaultView.location : null;
  }, set: K.nyi }, _titleElement: { get: function() {
    return this.getElementsByTagName("title").item(0) || null;
  } }, title: { get: function() {
    var e = this._titleElement, t = e ? e.textContent : "";
    return t.replace(/[ \t\n\r\f]+/g, " ").replace(/(^ )|( $)/g, "");
  }, set: function(e) {
    var t = this._titleElement, r = this.head;
    !t && !r || (t || (t = this.createElement("title"), r.appendChild(t)), t.textContent = e);
  } }, dir: rr(function() {
    var e = this.documentElement;
    if (e && e.tagName === "HTML")
      return e;
  }, "dir", ""), fgColor: rr(function() {
    return this.body;
  }, "text", ""), linkColor: rr(function() {
    return this.body;
  }, "link", ""), vlinkColor: rr(function() {
    return this.body;
  }, "vLink", ""), alinkColor: rr(function() {
    return this.body;
  }, "aLink", ""), bgColor: rr(function() {
    return this.body;
  }, "bgColor", ""), charset: { get: function() {
    return this.characterSet;
  } }, inputEncoding: { get: function() {
    return this.characterSet;
  } }, scrollingElement: { get: function() {
    return this._quirks ? this.body : this.documentElement;
  } }, body: { get: function() {
    return gc(this.documentElement, "body");
  }, set: K.nyi }, head: { get: function() {
    return gc(this.documentElement, "head");
  } }, images: { get: K.nyi }, embeds: { get: K.nyi }, plugins: { get: K.nyi }, links: { get: K.nyi }, forms: { get: K.nyi }, scripts: { get: K.nyi }, applets: { get: function() {
    return [];
  } }, activeElement: { get: function() {
    return null;
  } }, innerHTML: { get: function() {
    return this.serialize();
  }, set: K.nyi }, outerHTML: { get: function() {
    return this.serialize();
  }, set: K.nyi }, write: { value: function(e) {
    if (this.isHTML || K.InvalidStateError(), !!this._parser) {
      !this._parser;
      var t = arguments.join("");
      this._parser.parse(t);
    }
  } }, writeln: { value: function(t) {
    this.write(Array.prototype.join.call(arguments, "") + `
`);
  } }, open: { value: function() {
    this.documentElement = null;
  } }, close: { value: function() {
    this.readyState = "interactive", this._dispatchEvent(new Ar("readystatechange"), true), this._dispatchEvent(new Ar("DOMContentLoaded"), true), this.readyState = "complete", this._dispatchEvent(new Ar("readystatechange"), true), this.defaultView && this.defaultView._dispatchEvent(new Ar("load"), true);
  } }, clone: { value: function() {
    var t = new Lr(this.isHTML, this._address);
    return t._quirks = this._quirks, t._contentType = this._contentType, t;
  } }, cloneNode: { value: function(t) {
    var r = Ce.prototype.cloneNode.call(this, false);
    if (t)
      for (var n = this.firstChild; n !== null; n = n.nextSibling)
        r._appendChild(r.importNode(n, true));
    return r._updateDocTypeElement(), r;
  } }, isEqual: { value: function(t) {
    return true;
  } }, mutateValue: { value: function(e) {
    this.mutationHandler && this.mutationHandler({ type: er.VALUE, target: e, data: e.data });
  } }, mutateAttr: { value: function(e, t) {
    this.mutationHandler && this.mutationHandler({ type: er.ATTR, target: e.ownerElement, attr: e });
  } }, mutateRemoveAttr: { value: function(e) {
    this.mutationHandler && this.mutationHandler({ type: er.REMOVE_ATTR, target: e.ownerElement, attr: e });
  } }, mutateRemove: { value: function(e) {
    this.mutationHandler && this.mutationHandler({ type: er.REMOVE, target: e.parentNode, node: e }), _c(e);
  } }, mutateInsert: { value: function(e) {
    bc(e), this.mutationHandler && this.mutationHandler({ type: er.INSERT, target: e.parentNode, node: e });
  } }, mutateMove: { value: function(e) {
    this.mutationHandler && this.mutationHandler({ type: er.MOVE, target: e });
  } }, addId: { value: function(t, r) {
    var n = this.byId[t];
    n ? (n instanceof ut || (n = new ut(n), this.byId[t] = n), n.add(r)) : this.byId[t] = r;
  } }, delId: { value: function(t, r) {
    var n = this.byId[t];
    K.assert(n), n instanceof ut ? (n.del(r), n.length === 1 && (this.byId[t] = n.downgrade())) : this.byId[t] = void 0;
  } }, _resolve: { value: function(e) {
    return new xc(this._documentBaseURL).resolve(e);
  } }, _documentBaseURL: { get: function() {
    var e = this._address;
    e === "about:blank" && (e = "/");
    var t = this.querySelector("base[href]");
    return t ? new xc(e).resolve(t.getAttribute("href")) : e;
  } }, _templateDoc: { get: function() {
    if (!this._templateDocCache) {
      var e = new Lr(this.isHTML, this._address);
      this._templateDocCache = e._templateDocCache = e;
    }
    return this._templateDocCache;
  } }, querySelector: { value: function(e) {
    return pc(e, this)[0];
  } }, querySelectorAll: { value: function(e) {
    var t = pc(e, this);
    return t.item ? t : new Q0(t);
  } } });
  var uf = ["abort", "canplay", "canplaythrough", "change", "click", "contextmenu", "cuechange", "dblclick", "drag", "dragend", "dragenter", "dragleave", "dragover", "dragstart", "drop", "durationchange", "emptied", "ended", "input", "invalid", "keydown", "keypress", "keyup", "loadeddata", "loadedmetadata", "loadstart", "mousedown", "mousemove", "mouseout", "mouseover", "mouseup", "mousewheel", "pause", "play", "playing", "progress", "ratechange", "readystatechange", "reset", "seeked", "seeking", "select", "show", "stalled", "submit", "suspend", "timeupdate", "volumechange", "waiting", "blur", "error", "focus", "load", "scroll"];
  uf.forEach(function(e) {
    Object.defineProperty(Lr.prototype, "on" + e, { get: function() {
      return this._getEventHandler(e);
    }, set: function(t) {
      this._setEventHandler(e, t);
    } });
  });
  function gc(e, t) {
    if (e && e.isHTML) {
      for (var r = e.firstChild; r !== null; r = r.nextSibling)
        if (r.nodeType === Ce.ELEMENT_NODE && r.localName === t && r.namespaceURI === tr.HTML)
          return r;
    }
    return null;
  }
  function ff(e) {
    if (e._nid = e.ownerDocument._nextnid++, e.ownerDocument._nodes[e._nid] = e, e.nodeType === Ce.ELEMENT_NODE) {
      var t = e.getAttribute("id");
      t && e.ownerDocument.addId(t, e), e._roothook && e._roothook();
    }
  }
  function df(e) {
    if (e.nodeType === Ce.ELEMENT_NODE) {
      var t = e.getAttribute("id");
      t && e.ownerDocument.delId(t, e);
    }
    e.ownerDocument._nodes[e._nid] = void 0, e._nid = void 0;
  }
  function bc(e) {
    if (ff(e), e.nodeType === Ce.ELEMENT_NODE)
      for (var t = e.firstChild; t !== null; t = t.nextSibling)
        bc(t);
  }
  function _c(e) {
    df(e);
    for (var t = e.firstChild; t !== null; t = t.nextSibling)
      _c(t);
  }
  function Ec(e, t) {
    e.ownerDocument = t, e._lastModTime = void 0, Object.prototype.hasOwnProperty.call(e, "_tagName") && (e._tagName = void 0);
    for (var r = e.firstChild; r !== null; r = r.nextSibling)
      Ec(r, t);
  }
  function ut(e) {
    this.nodes = Object.create(null), this.nodes[e._nid] = e, this.length = 1, this.firstNode = void 0;
  }
  ut.prototype.add = function(e) {
    this.nodes[e._nid] || (this.nodes[e._nid] = e, this.length++, this.firstNode = void 0);
  };
  ut.prototype.del = function(e) {
    this.nodes[e._nid] && (delete this.nodes[e._nid], this.length--, this.firstNode = void 0);
  };
  ut.prototype.getFirst = function() {
    if (!this.firstNode) {
      var e;
      for (e in this.nodes)
        (this.firstNode === void 0 || this.firstNode.compareDocumentPosition(this.nodes[e]) & Ce.DOCUMENT_POSITION_PRECEDING) && (this.firstNode = this.nodes[e]);
    }
    return this.firstNode;
  };
  ut.prototype.downgrade = function() {
    if (this.length === 1) {
      var e;
      for (e in this.nodes)
        return this.nodes[e];
    }
    return this;
  };
});
var kr = O((gd, kc) => {
  kc.exports = Tc;
  var yc = kn(), wc = mn(), hf = wn(), Rn = he(), xf = en();
  function Tc(e) {
    this.contextObject = e;
  }
  var pf = { xml: { "": true, "1.0": true, "2.0": true }, core: { "": true, "2.0": true }, html: { "": true, "1.0": true, "2.0": true }, xhtml: { "": true, "1.0": true, "2.0": true } };
  Tc.prototype = { hasFeature: function(t, r) {
    var n = pf[(t || "").toLowerCase()];
    return n && n[r || ""] || false;
  }, createDocumentType: function(t, r, n) {
    return xf.isValidQName(t) || Rn.InvalidCharacterError(), new wc(this.contextObject, t, r, n);
  }, createDocument: function(t, r, n) {
    var l = new yc(false, null), f;
    return r ? f = l.createElementNS(t, r) : f = null, n && l.appendChild(n), f && l.appendChild(f), t === Rn.NAMESPACE.HTML ? l._contentType = "application/xhtml+xml" : t === Rn.NAMESPACE.SVG ? l._contentType = "image/svg+xml" : l._contentType = "application/xml", l;
  }, createHTMLDocument: function(t) {
    var r = new yc(true, null);
    r.appendChild(new wc(r, "html"));
    var n = r.createElement("html");
    r.appendChild(n);
    var l = r.createElement("head");
    if (n.appendChild(l), t !== void 0) {
      var f = r.createElement("title");
      l.appendChild(f), f.appendChild(r.createTextNode(t));
    }
    return n.appendChild(r.createElement("body")), r.modclock = 1, r;
  }, mozSetOutputMutationHandler: function(e, t) {
    e.mutationHandler = t;
  }, mozGetInputMutationHandler: function(e) {
    Rn.nyi();
  }, mozHTMLParser: hf };
});
var gf = O((Pt) => {
  var Sc = kr(), Nc = wn(), mf = Nn();
  Pt.createDOMImplementation = function() {
    return new Sc(null);
  };
  Pt.createDocument = function(e, t) {
    if (e || t) {
      var r = new Nc();
      return r.parse(e || "", true), r.document();
    }
    return new Sc(null).createHTMLDocument("");
  };
  Pt.createIncrementalHTMLParser = function() {
    var e = new Nc();
    return { write: function(t) {
      t.length > 0 && e.parse(t, false, function() {
        return true;
      });
    }, end: function(t) {
      e.parse(t || "", true, function() {
        return true;
      });
    }, process: function(t) {
      return e.parse("", false, t);
    }, document: function() {
      return e.document();
    } };
  };
  Pt.createWindow = function(e, t) {
    var r = Pt.createDocument(e);
    return t !== void 0 && (r._address = t), new mf(r);
  };
  Pt.impl = li();
});
var domino_default = gf();
var qDev = globalThis.qDev !== false;

// src/core/util/markers.ts
var AttributeMarker;
(function(AttributeMarker2) {
  AttributeMarker2["OnMount"] = "on:q-mount";
  AttributeMarker2["OnRender"] = "on:q-render";
  AttributeMarker2["OnRenderSelector"] = "[on\\:q\\-render]";
  AttributeMarker2["OnUnmount"] = "on:q-unmount";
  AttributeMarker2["OnHydrate"] = "on:q-hydrate";
  AttributeMarker2["OnDehydrate"] = "on:q-dehydrate";
  AttributeMarker2["ComponentStyles"] = "q:sstyle";
  AttributeMarker2["ComponentUnscopedStyles"] = "q:ustyle";
  AttributeMarker2["ComponentStylesPrefixHost"] = "\u{1F4E6}";
  AttributeMarker2["ComponentStylesPrefixContent"] = "\u{1F3F7}\uFE0F";
  AttributeMarker2["EventPrefix"] = "on:";
  AttributeMarker2["EventAny"] = "on:.";
  AttributeMarker2["RenderNotify"] = "on:q-render-notify";
  AttributeMarker2["RenderNotifySelector"] = "[on\\:q-render-notify]";
  AttributeMarker2["QSlot"] = "Q:SLOT";
  AttributeMarker2["QSlotSelector"] = "Q\\:SLOT";
  AttributeMarker2["QSlotAttr"] = "q:slot";
  AttributeMarker2["QSlotName"] = "name";
  AttributeMarker2["QSlotInertName"] = "\0";
})(AttributeMarker || (AttributeMarker = {}));

// src/core/util/types.ts
var NodeType;
(function(NodeType2) {
  NodeType2[NodeType2["ELEMENT_NODE"] = 1] = "ELEMENT_NODE";
  NodeType2[NodeType2["ATTRIBUTE_NODE"] = 2] = "ATTRIBUTE_NODE";
  NodeType2[NodeType2["TEXT_NODE"] = 3] = "TEXT_NODE";
  NodeType2[NodeType2["CDATA_SECTION_NODE"] = 4] = "CDATA_SECTION_NODE";
  NodeType2[NodeType2["PROCESSING_INSTRUCTION_NODE"] = 7] = "PROCESSING_INSTRUCTION_NODE";
  NodeType2[NodeType2["COMMENT_NODE"] = 8] = "COMMENT_NODE";
  NodeType2[NodeType2["DOCUMENT_NODE"] = 9] = "DOCUMENT_NODE";
  NodeType2[NodeType2["DOCUMENT_TYPE_NODE"] = 10] = "DOCUMENT_TYPE_NODE";
  NodeType2[NodeType2["DOCUMENT_FRAGMENT_NODE"] = 11] = "DOCUMENT_FRAGMENT_NODE";
})(NodeType || (NodeType = {}));

// src/core/util/flyweight.ts
var EMPTY_ARRAY = [];
var EMPTY_OBJ = {};
if (qDev) {
  Object.freeze(EMPTY_ARRAY);
  Object.freeze(EMPTY_OBJ);
}

// src/core/error/error.ts
var QError;
(function(QError3) {
  QError3[QError3["Core_qConfigNotFound_path"] = 1] = "Core_qConfigNotFound_path";
  QError3[QError3["Core_unrecognizedStack_frame"] = 2] = "Core_unrecognizedStack_frame";
  QError3[QError3["Core_noAttribute_atr1_element"] = 3] = "Core_noAttribute_atr1_element";
  QError3[QError3["Core_noAttribute_atr1_attr2_element"] = 4] = "Core_noAttribute_atr1_attr2_element";
  QError3[QError3["Core_missingProperty_name_props"] = 5] = "Core_missingProperty_name_props";
  QError3[QError3["Core_missingExport_name_url_props"] = 6] = "Core_missingExport_name_url_props";
  QError3[QError3["QRL_expectFunction_url_actual"] = 100] = "QRL_expectFunction_url_actual";
  QError3[QError3["Injector_noHost_element"] = 200] = "Injector_noHost_element";
  QError3[QError3["Injector_expectedSpecificInjector_expected_actual"] = 201] = "Injector_expectedSpecificInjector_expected_actual";
  QError3[QError3["Injector_notElement_arg"] = 202] = "Injector_notElement_arg";
  QError3[QError3["Injector_wrongMethodThis_expected_actual"] = 203] = "Injector_wrongMethodThis_expected_actual";
  QError3[QError3["Injector_missingSerializedState_entityKey_element"] = 204] = "Injector_missingSerializedState_entityKey_element";
  QError3[QError3["Injector_notFound_element"] = 206] = "Injector_notFound_element";
  QError3[QError3["Injector_eventInjectorNotSerializable"] = 207] = "Injector_eventInjectorNotSerializable";
  QError3[QError3["Entity_notValidKey_key"] = 300] = "Entity_notValidKey_key";
  QError3[QError3["Entity_keyAlreadyExists_key"] = 301] = "Entity_keyAlreadyExists_key";
  QError3[QError3["Entity_invalidAttribute_name"] = 303] = "Entity_invalidAttribute_name";
  QError3[QError3["Entity_missingExpandoOrState_attrName"] = 304] = "Entity_missingExpandoOrState_attrName";
  QError3[QError3["Entity_elementMissingEntityAttr_element_attr"] = 305] = "Entity_elementMissingEntityAttr_element_attr";
  QError3[QError3["Entity_noState_entity_props"] = 306] = "Entity_noState_entity_props";
  QError3[QError3["Entity_expected_obj"] = 307] = "Entity_expected_obj";
  QError3[QError3["Entity_overridesConstructor_entity"] = 308] = "Entity_overridesConstructor_entity";
  QError3[QError3["Entity_keyMissingParts_key_key"] = 309] = "Entity_keyMissingParts_key_key";
  QError3[QError3["Entity_no$type_entity"] = 310] = "Entity_no$type_entity";
  QError3[QError3["Entity_no$keyProps_entity"] = 311] = "Entity_no$keyProps_entity";
  QError3[QError3["Entity_no$qrl_entity"] = 312] = "Entity_no$qrl_entity";
  QError3[QError3["Entity_nameCollision_name_currentQrl_expectedQrl"] = 313] = "Entity_nameCollision_name_currentQrl_expectedQrl";
  QError3[QError3["Entity_keyTooManyParts_entity_parts_key"] = 314] = "Entity_keyTooManyParts_entity_parts_key";
  QError3[QError3["Entity_keyNameMismatch_key_name_entity_name"] = 315] = "Entity_keyNameMismatch_key_name_entity_name";
  QError3[QError3["Entity_stateMissingKey_state"] = 316] = "Entity_stateMissingKey_state";
  QError3[QError3["Component_bindNeedsKey"] = 400] = "Component_bindNeedsKey";
  QError3[QError3["Component_bindNeedsValue"] = 401] = "Component_bindNeedsValue";
  QError3[QError3["Component_needsState"] = 402] = "Component_needsState";
  QError3[QError3["Component_needsInjectionContext_constructor"] = 403] = "Component_needsInjectionContext_constructor";
  QError3[QError3["Component_noProperty_propName_props_host"] = 404] = "Component_noProperty_propName_props_host";
  QError3[QError3["Component_notFound_component"] = 405] = "Component_notFound_component";
  QError3[QError3["Component_doesNotMatch_component_actual"] = 406] = "Component_doesNotMatch_component_actual";
  QError3[QError3["Component_noState_component_props"] = 408] = "Component_noState_component_props";
  QError3[QError3["Provider_unrecognizedFormat_value"] = 500] = "Provider_unrecognizedFormat_value";
  QError3[QError3["Render_unexpectedJSXNodeType_type"] = 600] = "Render_unexpectedJSXNodeType_type";
  QError3[QError3["Render_unsupportedFormat_obj_attr"] = 601] = "Render_unsupportedFormat_obj_attr";
  QError3[QError3["Render_expectingEntity_entity"] = 602] = "Render_expectingEntity_entity";
  QError3[QError3["Render_expectingEntityArray_obj"] = 603] = "Render_expectingEntityArray_obj";
  QError3[QError3["Render_expectingEntityOrComponent_obj"] = 604] = "Render_expectingEntityOrComponent_obj";
  QError3[QError3["Render_stateMachineStuck"] = 699] = "Render_stateMachineStuck";
  QError3[QError3["Event_emitEventRequiresName_url"] = 700] = "Event_emitEventRequiresName_url";
  QError3[QError3["Event_emitEventCouldNotFindListener_event_element"] = 701] = "Event_emitEventCouldNotFindListener_event_element";
})(QError || (QError = {}));

// src/core/render/slots.ts
var NamedSlotEnum;
(function(NamedSlotEnum2) {
  NamedSlotEnum2[NamedSlotEnum2["index"] = 0] = "index";
  NamedSlotEnum2[NamedSlotEnum2["parent"] = 1] = "parent";
  NamedSlotEnum2[NamedSlotEnum2["firstNode"] = 2] = "firstNode";
})(NamedSlotEnum || (NamedSlotEnum = {}));

// src/core/import/qImport.ts
function qExport(url) {
  const match = url.match(/#([^?]*).*$/);
  return (match == null ? void 0 : match[1]) || "default";
}

// src/server/platform.ts
var _setInmediate = typeof setImmediate === "function" ? setImmediate : setTimeout;
var _nextTick = typeof queueMicrotask === "function" ? queueMicrotask : process.nextTick;
function createPlatform(document, _opts) {
  if (!document || document.nodeType !== 9) {
    throw new Error(`Invalid Document implementation`);
  }
  let queuePromise;
  const doc = document;
  const serverPlatform = {
    async importSymbol(_, url) {
      await Promise.resolve();
      const symbolName = qExport(url.toString());
      const symbolFn = qHookMap.get(symbolName);
      console.log("importSymbol", symbolName, symbolFn);
      const module = await symbolFn();
      return module[symbolName];
    },
    queueRender: (renderMarked) => {
      if (!queuePromise) {
        queuePromise = new Promise((resolve, reject) => _setInmediate(() => {
          queuePromise = null;
          renderMarked(doc).then(resolve, reject);
        }));
      }
      return queuePromise;
    },
    queueStoreFlush: (flushStore) => {
      if (!queuePromise) {
        queuePromise = new Promise((resolve, reject) => _nextTick(() => {
          queuePromise = null;
          flushStore(doc).then(resolve, reject);
        }));
      }
      return queuePromise;
    }
  };
  return serverPlatform;
}
async function setServerPlatform(document, opts) {
  const platform = createPlatform(document);
  setPlatform(document, platform);
}

// src/server/serialize.ts
function serializeDocument(doc, opts) {
  if (!doc || doc.nodeType !== 9) {
    throw new Error(`Invalid document to serialize`);
  }
  let html = "<!DOCTYPE html>" + doc.documentElement.outerHTML;
  const qrlMapper = opts == null ? void 0 : opts.qrlMapper;
  if (typeof qrlMapper === "function") {
    html = html.replace(QRL_MATCHER, (_, _prefix, _qrl, path, symbol) => `="${qrlMapper(path, symbol)}"`);
  }
  return html;
}
var QRL_MATCHER = /="(.\/)?(([\w\d-_.]+)#([\w\d_]+))[?"]/g;

// src/server/utils.ts
function createTimer() {
  if (typeof performance === "undefined") {
    return () => 0;
  }
  const start = performance.now();
  return () => {
    const end = performance.now();
    const delta = end - start;
    return delta / 1e6;
  };
}

// src/server/document.ts
function createGlobal(opts) {
  opts = opts || {};
  const doc = domino_default.createDocument();
  const baseURI = typeof opts.url !== "string" ? BASE_URI : opts.url;
  const loc = new URL(baseURI, BASE_URI);
  Object.defineProperty(doc, "baseURI", {
    get: () => loc.href,
    set: (url) => loc.href = url
  });
  const glb = {
    document: doc,
    location: loc,
    CustomEvent: class CustomEvent {
      constructor(type, details) {
        Object.assign(this, details);
        this.type = type;
      }
    }
  };
  glb.document.defaultView = glb;
  return glb;
}
function createDocument(opts) {
  const glb = createGlobal(opts);
  return glb.document;
}
async function renderToDocument(doc, rootNode, opts) {
  if (!doc || doc.nodeType !== 9) {
    throw new Error(`Invalid document`);
  }
  opts = opts || {};
  await setServerPlatform(doc);
  await qRender(doc, rootNode);
  if (opts.dehydrate !== false) {
    qDehydrate(doc);
  }
}
async function renderToString(rootNode, opts) {
  const createDocTimer = createTimer();
  const doc = createDocument(opts);
  const createDocTime = createDocTimer();
  const renderDocTimer = createTimer();
  await renderToDocument(doc, rootNode, opts);
  const renderDocTime = renderDocTimer();
  const docToStringTimer = createTimer();
  const result = {
    html: serializeDocument(doc, opts),
    timing: {
      createDocument: createDocTime,
      render: renderDocTime,
      toString: docToStringTimer()
    }
  };
  return result;
}
var BASE_URI = `http://document.qwik.dev/`;

// src/server/qrl-mapper.ts
function createQrlMapper(qEntryMap) {
  const symbolManifest = new Map();
  const qrlMapper = (path, symbolName) => {
    path = symbolManifest.get(symbolName) || path;
    path = path.slice(0, path.lastIndexOf("."));
    return `./${path}#${symbolName}`;
  };
  for (const symbolName in qEntryMap.mapping) {
    const chunkName = qEntryMap.mapping[symbolName];
    symbolManifest.set(symbolName, chunkName);
  }
  return qrlMapper;
}

// src/server/scripts.ts
var QWIK_LOADER_DEFAULT_MINIFIED = 'const qrlResolver=(e,t,r,s,n)=>(void 0===r?t?(s=t.getAttribute("q:base"),n=qrlResolver(e,t.parentNode&&t.parentNode.closest("[q\\\\:base]"))):s=e.baseURI:r&&(s=r,n=qrlResolver(e,t.closest("[q\\\\:base]"))),s?new URL(s,n):void 0);((e,t)=>{const r=async(t,r)=>{e.querySelectorAll("[on\\\\:"+t.replace(":","\\\\:")+"]").forEach((e=>s(e,t,r)))},s=async(t,r,s,o)=>{(o=qrlResolver(e,t,t.getAttribute("on:"+r)))&&n(o,window[o.pathname]||await import((o+"").split("#")[0]+".js"))(t,s,o)},n=(e,t,r)=>t[r=e.hash.replace(/^#?([^?]*).*$/,"$1")||"default"]||(e=>{throw Error("QWIK: "+e)})(e+" does not export "+r),o=async(t,n)=>{if((n=t.target)==e)setTimeout((()=>r("document:"+t.type,t)));else for(;n&&n.getAttribute;)s(n,t.type,t),n=t.bubbles?n.parentElement:null},a=t=>e.addEventListener(t,o,{capture:!0}),l=s=>{s=e.readyState,t||"interactive"!=s&&"complete"!=s||(t=1,r("q-init",new CustomEvent("qInit")))};{const t=e.querySelector("script[events]");if(t)(t.getAttribute("events")||"").split(/[\\s,;]+/).forEach(a);else for(const t in e)0==t.indexOf("on")&&a(t.substring(2))}e.addEventListener("readystatechange",l),l()})(document);';
var QWIK_LOADER_DEFAULT_DEBUG = 'const qrlResolver = (doc, element, eventUrl, _url, _base) => {\n    if (void 0 === eventUrl) {\n        if (element) {\n            _url = element.getAttribute("q:base");\n            _base = qrlResolver(doc, element.parentNode && element.parentNode.closest("[q\\\\:base]"));\n        } else {\n            _url = doc.baseURI;\n        }\n    } else if (eventUrl) {\n        _url = eventUrl;\n        _base = qrlResolver(doc, element.closest("[q\\\\:base]"));\n    }\n    return _url ? new URL(_url, _base) : void 0;\n};\n\nconst error = msg => {\n    throw new Error("QWIK: " + msg);\n};\n\nconst qwikLoader = (doc, hasInitialized) => {\n    const broadcast = async (type, event) => {\n        doc.querySelectorAll("[on\\\\:" + type.replace(":", "\\\\:") + "]").forEach((target => dispatch(target, type, event)));\n    };\n    const dispatch = async (element, eventName, ev, url) => {\n        if (url = qrlResolver(doc, element, element.getAttribute("on:" + eventName))) {\n            getModuleExport(url, window[url.pathname] || await import(String(url).split("#")[0] + ".js"))(element, ev, url);\n        }\n    };\n    const getModuleExport = (url, module, exportName) => module[exportName = url.hash.replace(/^#?([^?]*).*$/, "$1") || "default"] || error(url + " does not export " + exportName);\n    const processEvent = async (ev, element) => {\n        if ((element = ev.target) == doc) {\n            setTimeout((() => broadcast("document:" + ev.type, ev)));\n        } else {\n            while (element && element.getAttribute) {\n                dispatch(element, ev.type, ev);\n                element = ev.bubbles ? element.parentElement : null;\n            }\n        }\n    };\n    const addEventListener = eventName => doc.addEventListener(eventName, processEvent, {\n        capture: !0\n    });\n    const processReadyStateChange = readyState => {\n        readyState = doc.readyState;\n        if (!hasInitialized && ("interactive" == readyState || "complete" == readyState)) {\n            hasInitialized = 1;\n            broadcast("q-init", new CustomEvent("qInit"));\n        }\n    };\n    {\n        const scriptTag = doc.querySelector("script[events]");\n        if (scriptTag) {\n            (scriptTag.getAttribute("events") || "").split(/[\\s,;]+/).forEach(addEventListener);\n        } else {\n            for (const key in doc) {\n                if (0 == key.indexOf("on")) {\n                    addEventListener(key.substring(2));\n                }\n            }\n        }\n    }\n    doc.addEventListener("readystatechange", processReadyStateChange);\n    processReadyStateChange();\n    return {\n        getModuleExport: getModuleExport,\n        processReadyStateChange: processReadyStateChange\n    };\n};\n\nqwikLoader(document);';
var QWIK_LOADER_OPTIMIZE_MINIFIED = 'const qrlResolver=(e,t,r,o,a)=>(void 0===r?t?(o=t.getAttribute("q:base"),a=qrlResolver(e,t.parentNode&&t.parentNode.closest("[q\\\\:base]"))):o=e.baseURI:r&&(o=r,a=qrlResolver(e,t.closest("[q\\\\:base]"))),o?new URL(o,a):void 0);((e,t)=>{const r=async(t,r)=>{e.querySelectorAll("[on\\\\:"+t.replace(":","\\\\:")+"]").forEach((e=>o(e,t,r)))},o=async(t,r,o,n)=>{(n=qrlResolver(e,t,t.getAttribute("on:"+r)))&&a(n,window[n.pathname]||await import((n+"").split("#")[0]+".js"))(t,o,n)},a=(e,t,r)=>t[r=e.hash.replace(/^#?([^?]*).*$/,"$1")||"default"]||(e=>{throw Error("QWIK: "+e)})(e+" does not export "+r),n=async(t,a)=>{if((a=t.target)==e)setTimeout((()=>r("document:"+t.type,t)));else for(;a&&a.getAttribute;)o(a,t.type,t),a=t.bubbles?a.parentElement:null},s=o=>{o=e.readyState,t||"interactive"!=o&&"complete"!=o||(t=1,r("q-init",new CustomEvent("qInit")))};window.qEvents.forEach((t=>e.addEventListener(t,n,{capture:!0}))),e.addEventListener("readystatechange",s),s()})(document);';
var QWIK_LOADER_OPTIMIZE_DEBUG = 'const qrlResolver = (doc, element, eventUrl, _url, _base) => {\n    if (void 0 === eventUrl) {\n        if (element) {\n            _url = element.getAttribute("q:base");\n            _base = qrlResolver(doc, element.parentNode && element.parentNode.closest("[q\\\\:base]"));\n        } else {\n            _url = doc.baseURI;\n        }\n    } else if (eventUrl) {\n        _url = eventUrl;\n        _base = qrlResolver(doc, element.closest("[q\\\\:base]"));\n    }\n    return _url ? new URL(_url, _base) : void 0;\n};\n\nconst error = msg => {\n    throw new Error("QWIK: " + msg);\n};\n\nconst qwikLoader = (doc, hasInitialized) => {\n    const broadcast = async (type, event) => {\n        doc.querySelectorAll("[on\\\\:" + type.replace(":", "\\\\:") + "]").forEach((target => dispatch(target, type, event)));\n    };\n    const dispatch = async (element, eventName, ev, url) => {\n        if (url = qrlResolver(doc, element, element.getAttribute("on:" + eventName))) {\n            getModuleExport(url, window[url.pathname] || await import(String(url).split("#")[0] + ".js"))(element, ev, url);\n        }\n    };\n    const getModuleExport = (url, module, exportName) => module[exportName = url.hash.replace(/^#?([^?]*).*$/, "$1") || "default"] || error(url + " does not export " + exportName);\n    const processEvent = async (ev, element) => {\n        if ((element = ev.target) == doc) {\n            setTimeout((() => broadcast("document:" + ev.type, ev)));\n        } else {\n            while (element && element.getAttribute) {\n                dispatch(element, ev.type, ev);\n                element = ev.bubbles ? element.parentElement : null;\n            }\n        }\n    };\n    const addEventListener = eventName => doc.addEventListener(eventName, processEvent, {\n        capture: !0\n    });\n    const processReadyStateChange = readyState => {\n        readyState = doc.readyState;\n        if (!hasInitialized && ("interactive" == readyState || "complete" == readyState)) {\n            hasInitialized = 1;\n            broadcast("q-init", new CustomEvent("qInit"));\n        }\n    };\n    window.qEvents.forEach(addEventListener);\n    doc.addEventListener("readystatechange", processReadyStateChange);\n    processReadyStateChange();\n    return {\n        getModuleExport: getModuleExport,\n        processReadyStateChange: processReadyStateChange\n    };\n};\n\nqwikLoader(document);';
function getQwikLoaderScript(opts = {}) {
  if (Array.isArray(opts.events) && opts.events.length > 0) {
    const loader = opts.debug ? QWIK_LOADER_OPTIMIZE_DEBUG : QWIK_LOADER_OPTIMIZE_MINIFIED;
    return loader.replace("window.qEvents", JSON.stringify(opts.events));
  }
  return opts.debug ? QWIK_LOADER_DEFAULT_DEBUG : QWIK_LOADER_DEFAULT_MINIFIED;
}
var QwikLoader = ({ events, debug }) => {
  return jsx("script", {
    children: [getQwikLoaderScript({ events, debug })]
  });
};
/*!
Parser-Lib
Copyright (c) 2009-2011 Nicholas C. Zakas. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/
/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

const ToDoApp = /*#__PURE__*/ qComponent({
    tagName: 'todo',
    onRender: qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
    , "ToDoApp_onRender")
});
const Header = /*#__PURE__*/ qComponent({
    tagName: 'header',
    onMount: qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
    , "Header_onMount"),
    onRender: qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
    , "Header_onRender")
});
const Main = /*#__PURE__*/ qComponent({
    tagName: 'main',
    onRender: qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
    , "Main_onRender")
});
const Item = /*#__PURE__*/ qComponent({
    tagName: 'li',
    onMount: qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
    , "Item_onMount"),
    onRender: qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
    , "Item_onRender")
});
const Footer = /*#__PURE__*/ qComponent({
    tagName: 'footer',
    onRender: qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
    , "Footer_onRender")
});

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */ function serverRender(opts) {
    const todos = {
        filter: 'all',
        items: [
            {
                completed: false,
                title: 'Read Qwik docs'
            },
            {
                completed: false,
                title: 'Build HelloWorld'
            },
            {
                completed: false,
                title: 'Profit'
            }, 
        ]
    };
    return renderToString(/*#__PURE__*/ h("html", null, /*#__PURE__*/ h("head", null, /*#__PURE__*/ h("title", null, "Qwik Demo: ToDo"), /*#__PURE__*/ h("link", {
        rel: "stylesheet",
        href: "/static/base.css"
    }), /*#__PURE__*/ h("link", {
        rel: "stylesheet",
        href: "/static/index.css"
    })), /*#__PURE__*/ h("body", {
        "q:base": "/build/"
    }, /*#__PURE__*/ h(ToDoApp, {
        todos: todos
    }), /*#__PURE__*/ h(QwikLoader, {
        debug: opts.debug
    }))), opts);
}

var mapping = {
	ToDoApp_onRender: "q-c9f597e9.js",
	Header_onMount: "q-4ca16d16.js",
	Header_onRender_on_keyup: "q-74db785c.js",
	Header_onRender: "q-8fd3601e.js",
	Main_onRender: "q-f251b7c4.js",
	Item_onMount: "q-a6eee2c6.js",
	Item_onRender_on_click: "q-c1f9f9d3.js",
	Item_onRender_on_dblclick: "q-12d95884.js",
	Item_onRender_on_click9: "q-ee6f4634.js",
	Item_onRender_on_blur: "q-e814be48.js",
	Item_onRender_on_keyup: "q-a7d693a3.js",
	Item_onRender: "q-60971e89.js",
	Footer_onRender_Filter_on_click: "q-46ef443e.js",
	Footer_onRender_on_click: "q-a37b724e.js",
	Footer_onRender: "q-49f25ebf.js"
};
var version = "1";
var qmapping = {
	mapping: mapping,
	version: version
};

var dist = {};

/**
 * @param typeMap [Object] Map of MIME type -> Array[extensions]
 * @param ...
 */
function Mime$1() {
  this._types = Object.create(null);
  this._extensions = Object.create(null);

  for (let i = 0; i < arguments.length; i++) {
    this.define(arguments[i]);
  }

  this.define = this.define.bind(this);
  this.getType = this.getType.bind(this);
  this.getExtension = this.getExtension.bind(this);
}

/**
 * Define mimetype -> extension mappings.  Each key is a mime-type that maps
 * to an array of extensions associated with the type.  The first extension is
 * used as the default extension for the type.
 *
 * e.g. mime.define({'audio/ogg', ['oga', 'ogg', 'spx']});
 *
 * If a type declares an extension that has already been defined, an error will
 * be thrown.  To suppress this error and force the extension to be associated
 * with the new type, pass `force`=true.  Alternatively, you may prefix the
 * extension with "*" to map the type to extension, without mapping the
 * extension to the type.
 *
 * e.g. mime.define({'audio/wav', ['wav']}, {'audio/x-wav', ['*wav']});
 *
 *
 * @param map (Object) type definitions
 * @param force (Boolean) if true, force overriding of existing definitions
 */
Mime$1.prototype.define = function(typeMap, force) {
  for (let type in typeMap) {
    let extensions = typeMap[type].map(function(t) {
      return t.toLowerCase();
    });
    type = type.toLowerCase();

    for (let i = 0; i < extensions.length; i++) {
      const ext = extensions[i];

      // '*' prefix = not the preferred type for this extension.  So fixup the
      // extension, and skip it.
      if (ext[0] === '*') {
        continue;
      }

      if (!force && (ext in this._types)) {
        throw new Error(
          'Attempt to change mapping for "' + ext +
          '" extension from "' + this._types[ext] + '" to "' + type +
          '". Pass `force=true` to allow this, otherwise remove "' + ext +
          '" from the list of extensions for "' + type + '".'
        );
      }

      this._types[ext] = type;
    }

    // Use first extension as default
    if (force || !this._extensions[type]) {
      const ext = extensions[0];
      this._extensions[type] = (ext[0] !== '*') ? ext : ext.substr(1);
    }
  }
};

/**
 * Lookup a mime type based on extension
 */
Mime$1.prototype.getType = function(path) {
  path = String(path);
  let last = path.replace(/^.*[/\\]/, '').toLowerCase();
  let ext = last.replace(/^.*\./, '').toLowerCase();

  let hasPath = last.length < path.length;
  let hasDot = ext.length < last.length - 1;

  return (hasDot || !hasPath) && this._types[ext] || null;
};

/**
 * Return file extension associated with a mime type
 */
Mime$1.prototype.getExtension = function(type) {
  type = /^\s*([^;\s]*)/.test(type) && RegExp.$1;
  return type && this._extensions[type.toLowerCase()] || null;
};

var Mime_1 = Mime$1;

var standard = {"application/andrew-inset":["ez"],"application/applixware":["aw"],"application/atom+xml":["atom"],"application/atomcat+xml":["atomcat"],"application/atomdeleted+xml":["atomdeleted"],"application/atomsvc+xml":["atomsvc"],"application/atsc-dwd+xml":["dwd"],"application/atsc-held+xml":["held"],"application/atsc-rsat+xml":["rsat"],"application/bdoc":["bdoc"],"application/calendar+xml":["xcs"],"application/ccxml+xml":["ccxml"],"application/cdfx+xml":["cdfx"],"application/cdmi-capability":["cdmia"],"application/cdmi-container":["cdmic"],"application/cdmi-domain":["cdmid"],"application/cdmi-object":["cdmio"],"application/cdmi-queue":["cdmiq"],"application/cu-seeme":["cu"],"application/dash+xml":["mpd"],"application/davmount+xml":["davmount"],"application/docbook+xml":["dbk"],"application/dssc+der":["dssc"],"application/dssc+xml":["xdssc"],"application/ecmascript":["es","ecma"],"application/emma+xml":["emma"],"application/emotionml+xml":["emotionml"],"application/epub+zip":["epub"],"application/exi":["exi"],"application/express":["exp"],"application/fdt+xml":["fdt"],"application/font-tdpfr":["pfr"],"application/geo+json":["geojson"],"application/gml+xml":["gml"],"application/gpx+xml":["gpx"],"application/gxf":["gxf"],"application/gzip":["gz"],"application/hjson":["hjson"],"application/hyperstudio":["stk"],"application/inkml+xml":["ink","inkml"],"application/ipfix":["ipfix"],"application/its+xml":["its"],"application/java-archive":["jar","war","ear"],"application/java-serialized-object":["ser"],"application/java-vm":["class"],"application/javascript":["js","mjs"],"application/json":["json","map"],"application/json5":["json5"],"application/jsonml+json":["jsonml"],"application/ld+json":["jsonld"],"application/lgr+xml":["lgr"],"application/lost+xml":["lostxml"],"application/mac-binhex40":["hqx"],"application/mac-compactpro":["cpt"],"application/mads+xml":["mads"],"application/manifest+json":["webmanifest"],"application/marc":["mrc"],"application/marcxml+xml":["mrcx"],"application/mathematica":["ma","nb","mb"],"application/mathml+xml":["mathml"],"application/mbox":["mbox"],"application/mediaservercontrol+xml":["mscml"],"application/metalink+xml":["metalink"],"application/metalink4+xml":["meta4"],"application/mets+xml":["mets"],"application/mmt-aei+xml":["maei"],"application/mmt-usd+xml":["musd"],"application/mods+xml":["mods"],"application/mp21":["m21","mp21"],"application/mp4":["mp4s","m4p"],"application/msword":["doc","dot"],"application/mxf":["mxf"],"application/n-quads":["nq"],"application/n-triples":["nt"],"application/node":["cjs"],"application/octet-stream":["bin","dms","lrf","mar","so","dist","distz","pkg","bpk","dump","elc","deploy","exe","dll","deb","dmg","iso","img","msi","msp","msm","buffer"],"application/oda":["oda"],"application/oebps-package+xml":["opf"],"application/ogg":["ogx"],"application/omdoc+xml":["omdoc"],"application/onenote":["onetoc","onetoc2","onetmp","onepkg"],"application/oxps":["oxps"],"application/p2p-overlay+xml":["relo"],"application/patch-ops-error+xml":["xer"],"application/pdf":["pdf"],"application/pgp-encrypted":["pgp"],"application/pgp-signature":["asc","sig"],"application/pics-rules":["prf"],"application/pkcs10":["p10"],"application/pkcs7-mime":["p7m","p7c"],"application/pkcs7-signature":["p7s"],"application/pkcs8":["p8"],"application/pkix-attr-cert":["ac"],"application/pkix-cert":["cer"],"application/pkix-crl":["crl"],"application/pkix-pkipath":["pkipath"],"application/pkixcmp":["pki"],"application/pls+xml":["pls"],"application/postscript":["ai","eps","ps"],"application/provenance+xml":["provx"],"application/pskc+xml":["pskcxml"],"application/raml+yaml":["raml"],"application/rdf+xml":["rdf","owl"],"application/reginfo+xml":["rif"],"application/relax-ng-compact-syntax":["rnc"],"application/resource-lists+xml":["rl"],"application/resource-lists-diff+xml":["rld"],"application/rls-services+xml":["rs"],"application/route-apd+xml":["rapd"],"application/route-s-tsid+xml":["sls"],"application/route-usd+xml":["rusd"],"application/rpki-ghostbusters":["gbr"],"application/rpki-manifest":["mft"],"application/rpki-roa":["roa"],"application/rsd+xml":["rsd"],"application/rss+xml":["rss"],"application/rtf":["rtf"],"application/sbml+xml":["sbml"],"application/scvp-cv-request":["scq"],"application/scvp-cv-response":["scs"],"application/scvp-vp-request":["spq"],"application/scvp-vp-response":["spp"],"application/sdp":["sdp"],"application/senml+xml":["senmlx"],"application/sensml+xml":["sensmlx"],"application/set-payment-initiation":["setpay"],"application/set-registration-initiation":["setreg"],"application/shf+xml":["shf"],"application/sieve":["siv","sieve"],"application/smil+xml":["smi","smil"],"application/sparql-query":["rq"],"application/sparql-results+xml":["srx"],"application/srgs":["gram"],"application/srgs+xml":["grxml"],"application/sru+xml":["sru"],"application/ssdl+xml":["ssdl"],"application/ssml+xml":["ssml"],"application/swid+xml":["swidtag"],"application/tei+xml":["tei","teicorpus"],"application/thraud+xml":["tfi"],"application/timestamped-data":["tsd"],"application/toml":["toml"],"application/trig":["trig"],"application/ttml+xml":["ttml"],"application/ubjson":["ubj"],"application/urc-ressheet+xml":["rsheet"],"application/urc-targetdesc+xml":["td"],"application/voicexml+xml":["vxml"],"application/wasm":["wasm"],"application/widget":["wgt"],"application/winhlp":["hlp"],"application/wsdl+xml":["wsdl"],"application/wspolicy+xml":["wspolicy"],"application/xaml+xml":["xaml"],"application/xcap-att+xml":["xav"],"application/xcap-caps+xml":["xca"],"application/xcap-diff+xml":["xdf"],"application/xcap-el+xml":["xel"],"application/xcap-ns+xml":["xns"],"application/xenc+xml":["xenc"],"application/xhtml+xml":["xhtml","xht"],"application/xliff+xml":["xlf"],"application/xml":["xml","xsl","xsd","rng"],"application/xml-dtd":["dtd"],"application/xop+xml":["xop"],"application/xproc+xml":["xpl"],"application/xslt+xml":["*xsl","xslt"],"application/xspf+xml":["xspf"],"application/xv+xml":["mxml","xhvml","xvml","xvm"],"application/yang":["yang"],"application/yin+xml":["yin"],"application/zip":["zip"],"audio/3gpp":["*3gpp"],"audio/adpcm":["adp"],"audio/amr":["amr"],"audio/basic":["au","snd"],"audio/midi":["mid","midi","kar","rmi"],"audio/mobile-xmf":["mxmf"],"audio/mp3":["*mp3"],"audio/mp4":["m4a","mp4a"],"audio/mpeg":["mpga","mp2","mp2a","mp3","m2a","m3a"],"audio/ogg":["oga","ogg","spx","opus"],"audio/s3m":["s3m"],"audio/silk":["sil"],"audio/wav":["wav"],"audio/wave":["*wav"],"audio/webm":["weba"],"audio/xm":["xm"],"font/collection":["ttc"],"font/otf":["otf"],"font/ttf":["ttf"],"font/woff":["woff"],"font/woff2":["woff2"],"image/aces":["exr"],"image/apng":["apng"],"image/avif":["avif"],"image/bmp":["bmp"],"image/cgm":["cgm"],"image/dicom-rle":["drle"],"image/emf":["emf"],"image/fits":["fits"],"image/g3fax":["g3"],"image/gif":["gif"],"image/heic":["heic"],"image/heic-sequence":["heics"],"image/heif":["heif"],"image/heif-sequence":["heifs"],"image/hej2k":["hej2"],"image/hsj2":["hsj2"],"image/ief":["ief"],"image/jls":["jls"],"image/jp2":["jp2","jpg2"],"image/jpeg":["jpeg","jpg","jpe"],"image/jph":["jph"],"image/jphc":["jhc"],"image/jpm":["jpm"],"image/jpx":["jpx","jpf"],"image/jxr":["jxr"],"image/jxra":["jxra"],"image/jxrs":["jxrs"],"image/jxs":["jxs"],"image/jxsc":["jxsc"],"image/jxsi":["jxsi"],"image/jxss":["jxss"],"image/ktx":["ktx"],"image/ktx2":["ktx2"],"image/png":["png"],"image/sgi":["sgi"],"image/svg+xml":["svg","svgz"],"image/t38":["t38"],"image/tiff":["tif","tiff"],"image/tiff-fx":["tfx"],"image/webp":["webp"],"image/wmf":["wmf"],"message/disposition-notification":["disposition-notification"],"message/global":["u8msg"],"message/global-delivery-status":["u8dsn"],"message/global-disposition-notification":["u8mdn"],"message/global-headers":["u8hdr"],"message/rfc822":["eml","mime"],"model/3mf":["3mf"],"model/gltf+json":["gltf"],"model/gltf-binary":["glb"],"model/iges":["igs","iges"],"model/mesh":["msh","mesh","silo"],"model/mtl":["mtl"],"model/obj":["obj"],"model/step+xml":["stpx"],"model/step+zip":["stpz"],"model/step-xml+zip":["stpxz"],"model/stl":["stl"],"model/vrml":["wrl","vrml"],"model/x3d+binary":["*x3db","x3dbz"],"model/x3d+fastinfoset":["x3db"],"model/x3d+vrml":["*x3dv","x3dvz"],"model/x3d+xml":["x3d","x3dz"],"model/x3d-vrml":["x3dv"],"text/cache-manifest":["appcache","manifest"],"text/calendar":["ics","ifb"],"text/coffeescript":["coffee","litcoffee"],"text/css":["css"],"text/csv":["csv"],"text/html":["html","htm","shtml"],"text/jade":["jade"],"text/jsx":["jsx"],"text/less":["less"],"text/markdown":["markdown","md"],"text/mathml":["mml"],"text/mdx":["mdx"],"text/n3":["n3"],"text/plain":["txt","text","conf","def","list","log","in","ini"],"text/richtext":["rtx"],"text/rtf":["*rtf"],"text/sgml":["sgml","sgm"],"text/shex":["shex"],"text/slim":["slim","slm"],"text/spdx":["spdx"],"text/stylus":["stylus","styl"],"text/tab-separated-values":["tsv"],"text/troff":["t","tr","roff","man","me","ms"],"text/turtle":["ttl"],"text/uri-list":["uri","uris","urls"],"text/vcard":["vcard"],"text/vtt":["vtt"],"text/xml":["*xml"],"text/yaml":["yaml","yml"],"video/3gpp":["3gp","3gpp"],"video/3gpp2":["3g2"],"video/h261":["h261"],"video/h263":["h263"],"video/h264":["h264"],"video/iso.segment":["m4s"],"video/jpeg":["jpgv"],"video/jpm":["*jpm","jpgm"],"video/mj2":["mj2","mjp2"],"video/mp2t":["ts"],"video/mp4":["mp4","mp4v","mpg4"],"video/mpeg":["mpeg","mpg","mpe","m1v","m2v"],"video/ogg":["ogv"],"video/quicktime":["qt","mov"],"video/webm":["webm"]};

var other = {"application/prs.cww":["cww"],"application/vnd.1000minds.decision-model+xml":["1km"],"application/vnd.3gpp.pic-bw-large":["plb"],"application/vnd.3gpp.pic-bw-small":["psb"],"application/vnd.3gpp.pic-bw-var":["pvb"],"application/vnd.3gpp2.tcap":["tcap"],"application/vnd.3m.post-it-notes":["pwn"],"application/vnd.accpac.simply.aso":["aso"],"application/vnd.accpac.simply.imp":["imp"],"application/vnd.acucobol":["acu"],"application/vnd.acucorp":["atc","acutc"],"application/vnd.adobe.air-application-installer-package+zip":["air"],"application/vnd.adobe.formscentral.fcdt":["fcdt"],"application/vnd.adobe.fxp":["fxp","fxpl"],"application/vnd.adobe.xdp+xml":["xdp"],"application/vnd.adobe.xfdf":["xfdf"],"application/vnd.ahead.space":["ahead"],"application/vnd.airzip.filesecure.azf":["azf"],"application/vnd.airzip.filesecure.azs":["azs"],"application/vnd.amazon.ebook":["azw"],"application/vnd.americandynamics.acc":["acc"],"application/vnd.amiga.ami":["ami"],"application/vnd.android.package-archive":["apk"],"application/vnd.anser-web-certificate-issue-initiation":["cii"],"application/vnd.anser-web-funds-transfer-initiation":["fti"],"application/vnd.antix.game-component":["atx"],"application/vnd.apple.installer+xml":["mpkg"],"application/vnd.apple.keynote":["key"],"application/vnd.apple.mpegurl":["m3u8"],"application/vnd.apple.numbers":["numbers"],"application/vnd.apple.pages":["pages"],"application/vnd.apple.pkpass":["pkpass"],"application/vnd.aristanetworks.swi":["swi"],"application/vnd.astraea-software.iota":["iota"],"application/vnd.audiograph":["aep"],"application/vnd.balsamiq.bmml+xml":["bmml"],"application/vnd.blueice.multipass":["mpm"],"application/vnd.bmi":["bmi"],"application/vnd.businessobjects":["rep"],"application/vnd.chemdraw+xml":["cdxml"],"application/vnd.chipnuts.karaoke-mmd":["mmd"],"application/vnd.cinderella":["cdy"],"application/vnd.citationstyles.style+xml":["csl"],"application/vnd.claymore":["cla"],"application/vnd.cloanto.rp9":["rp9"],"application/vnd.clonk.c4group":["c4g","c4d","c4f","c4p","c4u"],"application/vnd.cluetrust.cartomobile-config":["c11amc"],"application/vnd.cluetrust.cartomobile-config-pkg":["c11amz"],"application/vnd.commonspace":["csp"],"application/vnd.contact.cmsg":["cdbcmsg"],"application/vnd.cosmocaller":["cmc"],"application/vnd.crick.clicker":["clkx"],"application/vnd.crick.clicker.keyboard":["clkk"],"application/vnd.crick.clicker.palette":["clkp"],"application/vnd.crick.clicker.template":["clkt"],"application/vnd.crick.clicker.wordbank":["clkw"],"application/vnd.criticaltools.wbs+xml":["wbs"],"application/vnd.ctc-posml":["pml"],"application/vnd.cups-ppd":["ppd"],"application/vnd.curl.car":["car"],"application/vnd.curl.pcurl":["pcurl"],"application/vnd.dart":["dart"],"application/vnd.data-vision.rdz":["rdz"],"application/vnd.dbf":["dbf"],"application/vnd.dece.data":["uvf","uvvf","uvd","uvvd"],"application/vnd.dece.ttml+xml":["uvt","uvvt"],"application/vnd.dece.unspecified":["uvx","uvvx"],"application/vnd.dece.zip":["uvz","uvvz"],"application/vnd.denovo.fcselayout-link":["fe_launch"],"application/vnd.dna":["dna"],"application/vnd.dolby.mlp":["mlp"],"application/vnd.dpgraph":["dpg"],"application/vnd.dreamfactory":["dfac"],"application/vnd.ds-keypoint":["kpxx"],"application/vnd.dvb.ait":["ait"],"application/vnd.dvb.service":["svc"],"application/vnd.dynageo":["geo"],"application/vnd.ecowin.chart":["mag"],"application/vnd.enliven":["nml"],"application/vnd.epson.esf":["esf"],"application/vnd.epson.msf":["msf"],"application/vnd.epson.quickanime":["qam"],"application/vnd.epson.salt":["slt"],"application/vnd.epson.ssf":["ssf"],"application/vnd.eszigno3+xml":["es3","et3"],"application/vnd.ezpix-album":["ez2"],"application/vnd.ezpix-package":["ez3"],"application/vnd.fdf":["fdf"],"application/vnd.fdsn.mseed":["mseed"],"application/vnd.fdsn.seed":["seed","dataless"],"application/vnd.flographit":["gph"],"application/vnd.fluxtime.clip":["ftc"],"application/vnd.framemaker":["fm","frame","maker","book"],"application/vnd.frogans.fnc":["fnc"],"application/vnd.frogans.ltf":["ltf"],"application/vnd.fsc.weblaunch":["fsc"],"application/vnd.fujitsu.oasys":["oas"],"application/vnd.fujitsu.oasys2":["oa2"],"application/vnd.fujitsu.oasys3":["oa3"],"application/vnd.fujitsu.oasysgp":["fg5"],"application/vnd.fujitsu.oasysprs":["bh2"],"application/vnd.fujixerox.ddd":["ddd"],"application/vnd.fujixerox.docuworks":["xdw"],"application/vnd.fujixerox.docuworks.binder":["xbd"],"application/vnd.fuzzysheet":["fzs"],"application/vnd.genomatix.tuxedo":["txd"],"application/vnd.geogebra.file":["ggb"],"application/vnd.geogebra.tool":["ggt"],"application/vnd.geometry-explorer":["gex","gre"],"application/vnd.geonext":["gxt"],"application/vnd.geoplan":["g2w"],"application/vnd.geospace":["g3w"],"application/vnd.gmx":["gmx"],"application/vnd.google-apps.document":["gdoc"],"application/vnd.google-apps.presentation":["gslides"],"application/vnd.google-apps.spreadsheet":["gsheet"],"application/vnd.google-earth.kml+xml":["kml"],"application/vnd.google-earth.kmz":["kmz"],"application/vnd.grafeq":["gqf","gqs"],"application/vnd.groove-account":["gac"],"application/vnd.groove-help":["ghf"],"application/vnd.groove-identity-message":["gim"],"application/vnd.groove-injector":["grv"],"application/vnd.groove-tool-message":["gtm"],"application/vnd.groove-tool-template":["tpl"],"application/vnd.groove-vcard":["vcg"],"application/vnd.hal+xml":["hal"],"application/vnd.handheld-entertainment+xml":["zmm"],"application/vnd.hbci":["hbci"],"application/vnd.hhe.lesson-player":["les"],"application/vnd.hp-hpgl":["hpgl"],"application/vnd.hp-hpid":["hpid"],"application/vnd.hp-hps":["hps"],"application/vnd.hp-jlyt":["jlt"],"application/vnd.hp-pcl":["pcl"],"application/vnd.hp-pclxl":["pclxl"],"application/vnd.hydrostatix.sof-data":["sfd-hdstx"],"application/vnd.ibm.minipay":["mpy"],"application/vnd.ibm.modcap":["afp","listafp","list3820"],"application/vnd.ibm.rights-management":["irm"],"application/vnd.ibm.secure-container":["sc"],"application/vnd.iccprofile":["icc","icm"],"application/vnd.igloader":["igl"],"application/vnd.immervision-ivp":["ivp"],"application/vnd.immervision-ivu":["ivu"],"application/vnd.insors.igm":["igm"],"application/vnd.intercon.formnet":["xpw","xpx"],"application/vnd.intergeo":["i2g"],"application/vnd.intu.qbo":["qbo"],"application/vnd.intu.qfx":["qfx"],"application/vnd.ipunplugged.rcprofile":["rcprofile"],"application/vnd.irepository.package+xml":["irp"],"application/vnd.is-xpr":["xpr"],"application/vnd.isac.fcs":["fcs"],"application/vnd.jam":["jam"],"application/vnd.jcp.javame.midlet-rms":["rms"],"application/vnd.jisp":["jisp"],"application/vnd.joost.joda-archive":["joda"],"application/vnd.kahootz":["ktz","ktr"],"application/vnd.kde.karbon":["karbon"],"application/vnd.kde.kchart":["chrt"],"application/vnd.kde.kformula":["kfo"],"application/vnd.kde.kivio":["flw"],"application/vnd.kde.kontour":["kon"],"application/vnd.kde.kpresenter":["kpr","kpt"],"application/vnd.kde.kspread":["ksp"],"application/vnd.kde.kword":["kwd","kwt"],"application/vnd.kenameaapp":["htke"],"application/vnd.kidspiration":["kia"],"application/vnd.kinar":["kne","knp"],"application/vnd.koan":["skp","skd","skt","skm"],"application/vnd.kodak-descriptor":["sse"],"application/vnd.las.las+xml":["lasxml"],"application/vnd.llamagraphics.life-balance.desktop":["lbd"],"application/vnd.llamagraphics.life-balance.exchange+xml":["lbe"],"application/vnd.lotus-1-2-3":["123"],"application/vnd.lotus-approach":["apr"],"application/vnd.lotus-freelance":["pre"],"application/vnd.lotus-notes":["nsf"],"application/vnd.lotus-organizer":["org"],"application/vnd.lotus-screencam":["scm"],"application/vnd.lotus-wordpro":["lwp"],"application/vnd.macports.portpkg":["portpkg"],"application/vnd.mapbox-vector-tile":["mvt"],"application/vnd.mcd":["mcd"],"application/vnd.medcalcdata":["mc1"],"application/vnd.mediastation.cdkey":["cdkey"],"application/vnd.mfer":["mwf"],"application/vnd.mfmp":["mfm"],"application/vnd.micrografx.flo":["flo"],"application/vnd.micrografx.igx":["igx"],"application/vnd.mif":["mif"],"application/vnd.mobius.daf":["daf"],"application/vnd.mobius.dis":["dis"],"application/vnd.mobius.mbk":["mbk"],"application/vnd.mobius.mqy":["mqy"],"application/vnd.mobius.msl":["msl"],"application/vnd.mobius.plc":["plc"],"application/vnd.mobius.txf":["txf"],"application/vnd.mophun.application":["mpn"],"application/vnd.mophun.certificate":["mpc"],"application/vnd.mozilla.xul+xml":["xul"],"application/vnd.ms-artgalry":["cil"],"application/vnd.ms-cab-compressed":["cab"],"application/vnd.ms-excel":["xls","xlm","xla","xlc","xlt","xlw"],"application/vnd.ms-excel.addin.macroenabled.12":["xlam"],"application/vnd.ms-excel.sheet.binary.macroenabled.12":["xlsb"],"application/vnd.ms-excel.sheet.macroenabled.12":["xlsm"],"application/vnd.ms-excel.template.macroenabled.12":["xltm"],"application/vnd.ms-fontobject":["eot"],"application/vnd.ms-htmlhelp":["chm"],"application/vnd.ms-ims":["ims"],"application/vnd.ms-lrm":["lrm"],"application/vnd.ms-officetheme":["thmx"],"application/vnd.ms-outlook":["msg"],"application/vnd.ms-pki.seccat":["cat"],"application/vnd.ms-pki.stl":["*stl"],"application/vnd.ms-powerpoint":["ppt","pps","pot"],"application/vnd.ms-powerpoint.addin.macroenabled.12":["ppam"],"application/vnd.ms-powerpoint.presentation.macroenabled.12":["pptm"],"application/vnd.ms-powerpoint.slide.macroenabled.12":["sldm"],"application/vnd.ms-powerpoint.slideshow.macroenabled.12":["ppsm"],"application/vnd.ms-powerpoint.template.macroenabled.12":["potm"],"application/vnd.ms-project":["mpp","mpt"],"application/vnd.ms-word.document.macroenabled.12":["docm"],"application/vnd.ms-word.template.macroenabled.12":["dotm"],"application/vnd.ms-works":["wps","wks","wcm","wdb"],"application/vnd.ms-wpl":["wpl"],"application/vnd.ms-xpsdocument":["xps"],"application/vnd.mseq":["mseq"],"application/vnd.musician":["mus"],"application/vnd.muvee.style":["msty"],"application/vnd.mynfc":["taglet"],"application/vnd.neurolanguage.nlu":["nlu"],"application/vnd.nitf":["ntf","nitf"],"application/vnd.noblenet-directory":["nnd"],"application/vnd.noblenet-sealer":["nns"],"application/vnd.noblenet-web":["nnw"],"application/vnd.nokia.n-gage.ac+xml":["*ac"],"application/vnd.nokia.n-gage.data":["ngdat"],"application/vnd.nokia.n-gage.symbian.install":["n-gage"],"application/vnd.nokia.radio-preset":["rpst"],"application/vnd.nokia.radio-presets":["rpss"],"application/vnd.novadigm.edm":["edm"],"application/vnd.novadigm.edx":["edx"],"application/vnd.novadigm.ext":["ext"],"application/vnd.oasis.opendocument.chart":["odc"],"application/vnd.oasis.opendocument.chart-template":["otc"],"application/vnd.oasis.opendocument.database":["odb"],"application/vnd.oasis.opendocument.formula":["odf"],"application/vnd.oasis.opendocument.formula-template":["odft"],"application/vnd.oasis.opendocument.graphics":["odg"],"application/vnd.oasis.opendocument.graphics-template":["otg"],"application/vnd.oasis.opendocument.image":["odi"],"application/vnd.oasis.opendocument.image-template":["oti"],"application/vnd.oasis.opendocument.presentation":["odp"],"application/vnd.oasis.opendocument.presentation-template":["otp"],"application/vnd.oasis.opendocument.spreadsheet":["ods"],"application/vnd.oasis.opendocument.spreadsheet-template":["ots"],"application/vnd.oasis.opendocument.text":["odt"],"application/vnd.oasis.opendocument.text-master":["odm"],"application/vnd.oasis.opendocument.text-template":["ott"],"application/vnd.oasis.opendocument.text-web":["oth"],"application/vnd.olpc-sugar":["xo"],"application/vnd.oma.dd2+xml":["dd2"],"application/vnd.openblox.game+xml":["obgx"],"application/vnd.openofficeorg.extension":["oxt"],"application/vnd.openstreetmap.data+xml":["osm"],"application/vnd.openxmlformats-officedocument.presentationml.presentation":["pptx"],"application/vnd.openxmlformats-officedocument.presentationml.slide":["sldx"],"application/vnd.openxmlformats-officedocument.presentationml.slideshow":["ppsx"],"application/vnd.openxmlformats-officedocument.presentationml.template":["potx"],"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":["xlsx"],"application/vnd.openxmlformats-officedocument.spreadsheetml.template":["xltx"],"application/vnd.openxmlformats-officedocument.wordprocessingml.document":["docx"],"application/vnd.openxmlformats-officedocument.wordprocessingml.template":["dotx"],"application/vnd.osgeo.mapguide.package":["mgp"],"application/vnd.osgi.dp":["dp"],"application/vnd.osgi.subsystem":["esa"],"application/vnd.palm":["pdb","pqa","oprc"],"application/vnd.pawaafile":["paw"],"application/vnd.pg.format":["str"],"application/vnd.pg.osasli":["ei6"],"application/vnd.picsel":["efif"],"application/vnd.pmi.widget":["wg"],"application/vnd.pocketlearn":["plf"],"application/vnd.powerbuilder6":["pbd"],"application/vnd.previewsystems.box":["box"],"application/vnd.proteus.magazine":["mgz"],"application/vnd.publishare-delta-tree":["qps"],"application/vnd.pvi.ptid1":["ptid"],"application/vnd.quark.quarkxpress":["qxd","qxt","qwd","qwt","qxl","qxb"],"application/vnd.rar":["rar"],"application/vnd.realvnc.bed":["bed"],"application/vnd.recordare.musicxml":["mxl"],"application/vnd.recordare.musicxml+xml":["musicxml"],"application/vnd.rig.cryptonote":["cryptonote"],"application/vnd.rim.cod":["cod"],"application/vnd.rn-realmedia":["rm"],"application/vnd.rn-realmedia-vbr":["rmvb"],"application/vnd.route66.link66+xml":["link66"],"application/vnd.sailingtracker.track":["st"],"application/vnd.seemail":["see"],"application/vnd.sema":["sema"],"application/vnd.semd":["semd"],"application/vnd.semf":["semf"],"application/vnd.shana.informed.formdata":["ifm"],"application/vnd.shana.informed.formtemplate":["itp"],"application/vnd.shana.informed.interchange":["iif"],"application/vnd.shana.informed.package":["ipk"],"application/vnd.simtech-mindmapper":["twd","twds"],"application/vnd.smaf":["mmf"],"application/vnd.smart.teacher":["teacher"],"application/vnd.software602.filler.form+xml":["fo"],"application/vnd.solent.sdkm+xml":["sdkm","sdkd"],"application/vnd.spotfire.dxp":["dxp"],"application/vnd.spotfire.sfs":["sfs"],"application/vnd.stardivision.calc":["sdc"],"application/vnd.stardivision.draw":["sda"],"application/vnd.stardivision.impress":["sdd"],"application/vnd.stardivision.math":["smf"],"application/vnd.stardivision.writer":["sdw","vor"],"application/vnd.stardivision.writer-global":["sgl"],"application/vnd.stepmania.package":["smzip"],"application/vnd.stepmania.stepchart":["sm"],"application/vnd.sun.wadl+xml":["wadl"],"application/vnd.sun.xml.calc":["sxc"],"application/vnd.sun.xml.calc.template":["stc"],"application/vnd.sun.xml.draw":["sxd"],"application/vnd.sun.xml.draw.template":["std"],"application/vnd.sun.xml.impress":["sxi"],"application/vnd.sun.xml.impress.template":["sti"],"application/vnd.sun.xml.math":["sxm"],"application/vnd.sun.xml.writer":["sxw"],"application/vnd.sun.xml.writer.global":["sxg"],"application/vnd.sun.xml.writer.template":["stw"],"application/vnd.sus-calendar":["sus","susp"],"application/vnd.svd":["svd"],"application/vnd.symbian.install":["sis","sisx"],"application/vnd.syncml+xml":["xsm"],"application/vnd.syncml.dm+wbxml":["bdm"],"application/vnd.syncml.dm+xml":["xdm"],"application/vnd.syncml.dmddf+xml":["ddf"],"application/vnd.tao.intent-module-archive":["tao"],"application/vnd.tcpdump.pcap":["pcap","cap","dmp"],"application/vnd.tmobile-livetv":["tmo"],"application/vnd.trid.tpt":["tpt"],"application/vnd.triscape.mxs":["mxs"],"application/vnd.trueapp":["tra"],"application/vnd.ufdl":["ufd","ufdl"],"application/vnd.uiq.theme":["utz"],"application/vnd.umajin":["umj"],"application/vnd.unity":["unityweb"],"application/vnd.uoml+xml":["uoml"],"application/vnd.vcx":["vcx"],"application/vnd.visio":["vsd","vst","vss","vsw"],"application/vnd.visionary":["vis"],"application/vnd.vsf":["vsf"],"application/vnd.wap.wbxml":["wbxml"],"application/vnd.wap.wmlc":["wmlc"],"application/vnd.wap.wmlscriptc":["wmlsc"],"application/vnd.webturbo":["wtb"],"application/vnd.wolfram.player":["nbp"],"application/vnd.wordperfect":["wpd"],"application/vnd.wqd":["wqd"],"application/vnd.wt.stf":["stf"],"application/vnd.xara":["xar"],"application/vnd.xfdl":["xfdl"],"application/vnd.yamaha.hv-dic":["hvd"],"application/vnd.yamaha.hv-script":["hvs"],"application/vnd.yamaha.hv-voice":["hvp"],"application/vnd.yamaha.openscoreformat":["osf"],"application/vnd.yamaha.openscoreformat.osfpvg+xml":["osfpvg"],"application/vnd.yamaha.smaf-audio":["saf"],"application/vnd.yamaha.smaf-phrase":["spf"],"application/vnd.yellowriver-custom-menu":["cmp"],"application/vnd.zul":["zir","zirz"],"application/vnd.zzazz.deck+xml":["zaz"],"application/x-7z-compressed":["7z"],"application/x-abiword":["abw"],"application/x-ace-compressed":["ace"],"application/x-apple-diskimage":["*dmg"],"application/x-arj":["arj"],"application/x-authorware-bin":["aab","x32","u32","vox"],"application/x-authorware-map":["aam"],"application/x-authorware-seg":["aas"],"application/x-bcpio":["bcpio"],"application/x-bdoc":["*bdoc"],"application/x-bittorrent":["torrent"],"application/x-blorb":["blb","blorb"],"application/x-bzip":["bz"],"application/x-bzip2":["bz2","boz"],"application/x-cbr":["cbr","cba","cbt","cbz","cb7"],"application/x-cdlink":["vcd"],"application/x-cfs-compressed":["cfs"],"application/x-chat":["chat"],"application/x-chess-pgn":["pgn"],"application/x-chrome-extension":["crx"],"application/x-cocoa":["cco"],"application/x-conference":["nsc"],"application/x-cpio":["cpio"],"application/x-csh":["csh"],"application/x-debian-package":["*deb","udeb"],"application/x-dgc-compressed":["dgc"],"application/x-director":["dir","dcr","dxr","cst","cct","cxt","w3d","fgd","swa"],"application/x-doom":["wad"],"application/x-dtbncx+xml":["ncx"],"application/x-dtbook+xml":["dtb"],"application/x-dtbresource+xml":["res"],"application/x-dvi":["dvi"],"application/x-envoy":["evy"],"application/x-eva":["eva"],"application/x-font-bdf":["bdf"],"application/x-font-ghostscript":["gsf"],"application/x-font-linux-psf":["psf"],"application/x-font-pcf":["pcf"],"application/x-font-snf":["snf"],"application/x-font-type1":["pfa","pfb","pfm","afm"],"application/x-freearc":["arc"],"application/x-futuresplash":["spl"],"application/x-gca-compressed":["gca"],"application/x-glulx":["ulx"],"application/x-gnumeric":["gnumeric"],"application/x-gramps-xml":["gramps"],"application/x-gtar":["gtar"],"application/x-hdf":["hdf"],"application/x-httpd-php":["php"],"application/x-install-instructions":["install"],"application/x-iso9660-image":["*iso"],"application/x-iwork-keynote-sffkey":["*key"],"application/x-iwork-numbers-sffnumbers":["*numbers"],"application/x-iwork-pages-sffpages":["*pages"],"application/x-java-archive-diff":["jardiff"],"application/x-java-jnlp-file":["jnlp"],"application/x-keepass2":["kdbx"],"application/x-latex":["latex"],"application/x-lua-bytecode":["luac"],"application/x-lzh-compressed":["lzh","lha"],"application/x-makeself":["run"],"application/x-mie":["mie"],"application/x-mobipocket-ebook":["prc","mobi"],"application/x-ms-application":["application"],"application/x-ms-shortcut":["lnk"],"application/x-ms-wmd":["wmd"],"application/x-ms-wmz":["wmz"],"application/x-ms-xbap":["xbap"],"application/x-msaccess":["mdb"],"application/x-msbinder":["obd"],"application/x-mscardfile":["crd"],"application/x-msclip":["clp"],"application/x-msdos-program":["*exe"],"application/x-msdownload":["*exe","*dll","com","bat","*msi"],"application/x-msmediaview":["mvb","m13","m14"],"application/x-msmetafile":["*wmf","*wmz","*emf","emz"],"application/x-msmoney":["mny"],"application/x-mspublisher":["pub"],"application/x-msschedule":["scd"],"application/x-msterminal":["trm"],"application/x-mswrite":["wri"],"application/x-netcdf":["nc","cdf"],"application/x-ns-proxy-autoconfig":["pac"],"application/x-nzb":["nzb"],"application/x-perl":["pl","pm"],"application/x-pilot":["*prc","*pdb"],"application/x-pkcs12":["p12","pfx"],"application/x-pkcs7-certificates":["p7b","spc"],"application/x-pkcs7-certreqresp":["p7r"],"application/x-rar-compressed":["*rar"],"application/x-redhat-package-manager":["rpm"],"application/x-research-info-systems":["ris"],"application/x-sea":["sea"],"application/x-sh":["sh"],"application/x-shar":["shar"],"application/x-shockwave-flash":["swf"],"application/x-silverlight-app":["xap"],"application/x-sql":["sql"],"application/x-stuffit":["sit"],"application/x-stuffitx":["sitx"],"application/x-subrip":["srt"],"application/x-sv4cpio":["sv4cpio"],"application/x-sv4crc":["sv4crc"],"application/x-t3vm-image":["t3"],"application/x-tads":["gam"],"application/x-tar":["tar"],"application/x-tcl":["tcl","tk"],"application/x-tex":["tex"],"application/x-tex-tfm":["tfm"],"application/x-texinfo":["texinfo","texi"],"application/x-tgif":["*obj"],"application/x-ustar":["ustar"],"application/x-virtualbox-hdd":["hdd"],"application/x-virtualbox-ova":["ova"],"application/x-virtualbox-ovf":["ovf"],"application/x-virtualbox-vbox":["vbox"],"application/x-virtualbox-vbox-extpack":["vbox-extpack"],"application/x-virtualbox-vdi":["vdi"],"application/x-virtualbox-vhd":["vhd"],"application/x-virtualbox-vmdk":["vmdk"],"application/x-wais-source":["src"],"application/x-web-app-manifest+json":["webapp"],"application/x-x509-ca-cert":["der","crt","pem"],"application/x-xfig":["fig"],"application/x-xliff+xml":["*xlf"],"application/x-xpinstall":["xpi"],"application/x-xz":["xz"],"application/x-zmachine":["z1","z2","z3","z4","z5","z6","z7","z8"],"audio/vnd.dece.audio":["uva","uvva"],"audio/vnd.digital-winds":["eol"],"audio/vnd.dra":["dra"],"audio/vnd.dts":["dts"],"audio/vnd.dts.hd":["dtshd"],"audio/vnd.lucent.voice":["lvp"],"audio/vnd.ms-playready.media.pya":["pya"],"audio/vnd.nuera.ecelp4800":["ecelp4800"],"audio/vnd.nuera.ecelp7470":["ecelp7470"],"audio/vnd.nuera.ecelp9600":["ecelp9600"],"audio/vnd.rip":["rip"],"audio/x-aac":["aac"],"audio/x-aiff":["aif","aiff","aifc"],"audio/x-caf":["caf"],"audio/x-flac":["flac"],"audio/x-m4a":["*m4a"],"audio/x-matroska":["mka"],"audio/x-mpegurl":["m3u"],"audio/x-ms-wax":["wax"],"audio/x-ms-wma":["wma"],"audio/x-pn-realaudio":["ram","ra"],"audio/x-pn-realaudio-plugin":["rmp"],"audio/x-realaudio":["*ra"],"audio/x-wav":["*wav"],"chemical/x-cdx":["cdx"],"chemical/x-cif":["cif"],"chemical/x-cmdf":["cmdf"],"chemical/x-cml":["cml"],"chemical/x-csml":["csml"],"chemical/x-xyz":["xyz"],"image/prs.btif":["btif"],"image/prs.pti":["pti"],"image/vnd.adobe.photoshop":["psd"],"image/vnd.airzip.accelerator.azv":["azv"],"image/vnd.dece.graphic":["uvi","uvvi","uvg","uvvg"],"image/vnd.djvu":["djvu","djv"],"image/vnd.dvb.subtitle":["*sub"],"image/vnd.dwg":["dwg"],"image/vnd.dxf":["dxf"],"image/vnd.fastbidsheet":["fbs"],"image/vnd.fpx":["fpx"],"image/vnd.fst":["fst"],"image/vnd.fujixerox.edmics-mmr":["mmr"],"image/vnd.fujixerox.edmics-rlc":["rlc"],"image/vnd.microsoft.icon":["ico"],"image/vnd.ms-dds":["dds"],"image/vnd.ms-modi":["mdi"],"image/vnd.ms-photo":["wdp"],"image/vnd.net-fpx":["npx"],"image/vnd.pco.b16":["b16"],"image/vnd.tencent.tap":["tap"],"image/vnd.valve.source.texture":["vtf"],"image/vnd.wap.wbmp":["wbmp"],"image/vnd.xiff":["xif"],"image/vnd.zbrush.pcx":["pcx"],"image/x-3ds":["3ds"],"image/x-cmu-raster":["ras"],"image/x-cmx":["cmx"],"image/x-freehand":["fh","fhc","fh4","fh5","fh7"],"image/x-icon":["*ico"],"image/x-jng":["jng"],"image/x-mrsid-image":["sid"],"image/x-ms-bmp":["*bmp"],"image/x-pcx":["*pcx"],"image/x-pict":["pic","pct"],"image/x-portable-anymap":["pnm"],"image/x-portable-bitmap":["pbm"],"image/x-portable-graymap":["pgm"],"image/x-portable-pixmap":["ppm"],"image/x-rgb":["rgb"],"image/x-tga":["tga"],"image/x-xbitmap":["xbm"],"image/x-xpixmap":["xpm"],"image/x-xwindowdump":["xwd"],"message/vnd.wfa.wsc":["wsc"],"model/vnd.collada+xml":["dae"],"model/vnd.dwf":["dwf"],"model/vnd.gdl":["gdl"],"model/vnd.gtw":["gtw"],"model/vnd.mts":["mts"],"model/vnd.opengex":["ogex"],"model/vnd.parasolid.transmit.binary":["x_b"],"model/vnd.parasolid.transmit.text":["x_t"],"model/vnd.sap.vds":["vds"],"model/vnd.usdz+zip":["usdz"],"model/vnd.valve.source.compiled-map":["bsp"],"model/vnd.vtu":["vtu"],"text/prs.lines.tag":["dsc"],"text/vnd.curl":["curl"],"text/vnd.curl.dcurl":["dcurl"],"text/vnd.curl.mcurl":["mcurl"],"text/vnd.curl.scurl":["scurl"],"text/vnd.dvb.subtitle":["sub"],"text/vnd.fly":["fly"],"text/vnd.fmi.flexstor":["flx"],"text/vnd.graphviz":["gv"],"text/vnd.in3d.3dml":["3dml"],"text/vnd.in3d.spot":["spot"],"text/vnd.sun.j2me.app-descriptor":["jad"],"text/vnd.wap.wml":["wml"],"text/vnd.wap.wmlscript":["wmls"],"text/x-asm":["s","asm"],"text/x-c":["c","cc","cxx","cpp","h","hh","dic"],"text/x-component":["htc"],"text/x-fortran":["f","for","f77","f90"],"text/x-handlebars-template":["hbs"],"text/x-java-source":["java"],"text/x-lua":["lua"],"text/x-markdown":["mkd"],"text/x-nfo":["nfo"],"text/x-opml":["opml"],"text/x-org":["*org"],"text/x-pascal":["p","pas"],"text/x-processing":["pde"],"text/x-sass":["sass"],"text/x-scss":["scss"],"text/x-setext":["etx"],"text/x-sfv":["sfv"],"text/x-suse-ymp":["ymp"],"text/x-uuencode":["uu"],"text/x-vcalendar":["vcs"],"text/x-vcard":["vcf"],"video/vnd.dece.hd":["uvh","uvvh"],"video/vnd.dece.mobile":["uvm","uvvm"],"video/vnd.dece.pd":["uvp","uvvp"],"video/vnd.dece.sd":["uvs","uvvs"],"video/vnd.dece.video":["uvv","uvvv"],"video/vnd.dvb.file":["dvb"],"video/vnd.fvt":["fvt"],"video/vnd.mpegurl":["mxu","m4u"],"video/vnd.ms-playready.media.pyv":["pyv"],"video/vnd.uvvu.mp4":["uvu","uvvu"],"video/vnd.vivo":["viv"],"video/x-f4v":["f4v"],"video/x-fli":["fli"],"video/x-flv":["flv"],"video/x-m4v":["m4v"],"video/x-matroska":["mkv","mk3d","mks"],"video/x-mng":["mng"],"video/x-ms-asf":["asf","asx"],"video/x-ms-vob":["vob"],"video/x-ms-wm":["wm"],"video/x-ms-wmv":["wmv"],"video/x-ms-wmx":["wmx"],"video/x-ms-wvx":["wvx"],"video/x-msvideo":["avi"],"video/x-sgi-movie":["movie"],"video/x-smv":["smv"],"x-conference/x-cooltalk":["ice"]};

let Mime = Mime_1;
var mime = new Mime(standard, other);

var types = {};

Object.defineProperty(types, "__esModule", { value: true });
types.InternalError = types.NotFoundError = types.MethodNotAllowedError = types.KVError = void 0;
class KVError extends Error {
    constructor(message, status = 500) {
        super(message);
        // see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
        Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
        this.name = KVError.name; // stack traces display correctly now
        this.status = status;
    }
}
types.KVError = KVError;
class MethodNotAllowedError extends KVError {
    constructor(message = `Not a valid request method`, status = 405) {
        super(message, status);
    }
}
types.MethodNotAllowedError = MethodNotAllowedError;
class NotFoundError extends KVError {
    constructor(message = `Not Found`, status = 404) {
        super(message, status);
    }
}
types.NotFoundError = NotFoundError;
class InternalError extends KVError {
    constructor(message = `Internal Error in KV Asset Handler`, status = 500) {
        super(message, status);
    }
}
types.InternalError = InternalError;

(function (exports) {
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalError = exports.NotFoundError = exports.MethodNotAllowedError = exports.serveSinglePageApp = exports.mapRequestToAsset = exports.getAssetFromKV = void 0;
const mime$1 = mime;
const types_1 = types;
Object.defineProperty(exports, "MethodNotAllowedError", { enumerable: true, get: function () { return types_1.MethodNotAllowedError; } });
Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function () { return types_1.NotFoundError; } });
Object.defineProperty(exports, "InternalError", { enumerable: true, get: function () { return types_1.InternalError; } });
const defaultCacheControl = {
    browserTTL: null,
    edgeTTL: 2 * 60 * 60 * 24,
    bypassCache: false, // do not bypass Cloudflare's cache
};
const parseStringAsObject = (maybeString) => typeof maybeString === 'string' ? JSON.parse(maybeString) : maybeString;
const getAssetFromKVDefaultOptions = {
    ASSET_NAMESPACE: typeof __STATIC_CONTENT !== 'undefined' ? __STATIC_CONTENT : undefined,
    ASSET_MANIFEST: typeof __STATIC_CONTENT_MANIFEST !== 'undefined'
        ? parseStringAsObject(__STATIC_CONTENT_MANIFEST)
        : {},
    cacheControl: defaultCacheControl,
    defaultMimeType: 'text/plain',
    defaultDocument: 'index.html',
    pathIsEncoded: false,
};
function assignOptions(options) {
    // Assign any missing options passed in to the default
    // options.mapRequestToAsset is handled manually later
    return Object.assign({}, getAssetFromKVDefaultOptions, options);
}
/**
 * maps the path of incoming request to the request pathKey to look up
 * in bucket and in cache
 * e.g.  for a path '/' returns '/index.html' which serves
 * the content of bucket/index.html
 * @param {Request} request incoming request
 */
const mapRequestToAsset = (request, options) => {
    options = assignOptions(options);
    const parsedUrl = new URL(request.url);
    let pathname = parsedUrl.pathname;
    if (pathname.endsWith('/')) {
        // If path looks like a directory append options.defaultDocument
        // e.g. If path is /about/ -> /about/index.html
        pathname = pathname.concat(options.defaultDocument);
    }
    else if (!mime$1.getType(pathname)) {
        // If path doesn't look like valid content
        //  e.g. /about.me ->  /about.me/index.html
        pathname = pathname.concat('/' + options.defaultDocument);
    }
    parsedUrl.pathname = pathname;
    return new Request(parsedUrl.toString(), request);
};
exports.mapRequestToAsset = mapRequestToAsset;
/**
 * maps the path of incoming request to /index.html if it evaluates to
 * any HTML file.
 * @param {Request} request incoming request
 */
function serveSinglePageApp(request, options) {
    options = assignOptions(options);
    // First apply the default handler, which already has logic to detect
    // paths that should map to HTML files.
    request = mapRequestToAsset(request, options);
    const parsedUrl = new URL(request.url);
    // Detect if the default handler decided to map to
    // a HTML file in some specific directory.
    if (parsedUrl.pathname.endsWith('.html')) {
        // If expected HTML file was missing, just return the root index.html (or options.defaultDocument)
        return new Request(`${parsedUrl.origin}/${options.defaultDocument}`, request);
    }
    else {
        // The default handler decided this is not an HTML page. It's probably
        // an image, CSS, or JS file. Leave it as-is.
        return request;
    }
}
exports.serveSinglePageApp = serveSinglePageApp;
const getAssetFromKV = async (event, options) => {
    options = assignOptions(options);
    const request = event.request;
    const ASSET_NAMESPACE = options.ASSET_NAMESPACE;
    const ASSET_MANIFEST = parseStringAsObject(options.ASSET_MANIFEST);
    if (typeof ASSET_NAMESPACE === 'undefined') {
        throw new types_1.InternalError(`there is no KV namespace bound to the script`);
    }
    const rawPathKey = new URL(request.url).pathname.replace(/^\/+/, ''); // strip any preceding /'s
    let pathIsEncoded = options.pathIsEncoded;
    let requestKey;
    // if options.mapRequestToAsset is explicitly passed in, always use it and assume user has own intentions
    // otherwise handle request as normal, with default mapRequestToAsset below
    if (options.mapRequestToAsset) {
        requestKey = options.mapRequestToAsset(request);
    }
    else if (ASSET_MANIFEST[rawPathKey]) {
        requestKey = request;
    }
    else if (ASSET_MANIFEST[decodeURIComponent(rawPathKey)]) {
        pathIsEncoded = true;
        requestKey = request;
    }
    else {
        const mappedRequest = mapRequestToAsset(request);
        const mappedRawPathKey = new URL(mappedRequest.url).pathname.replace(/^\/+/, '');
        if (ASSET_MANIFEST[decodeURIComponent(mappedRawPathKey)]) {
            pathIsEncoded = true;
            requestKey = mappedRequest;
        }
        else {
            // use default mapRequestToAsset
            requestKey = mapRequestToAsset(request, options);
        }
    }
    const SUPPORTED_METHODS = ['GET', 'HEAD'];
    if (!SUPPORTED_METHODS.includes(requestKey.method)) {
        throw new types_1.MethodNotAllowedError(`${requestKey.method} is not a valid request method`);
    }
    const parsedUrl = new URL(requestKey.url);
    const pathname = pathIsEncoded ? decodeURIComponent(parsedUrl.pathname) : parsedUrl.pathname; // decode percentage encoded path only when necessary
    // pathKey is the file path to look up in the manifest
    let pathKey = pathname.replace(/^\/+/, ''); // remove prepended /
    // @ts-ignore
    const cache = caches.default;
    let mimeType = mime$1.getType(pathKey) || options.defaultMimeType;
    if (mimeType.startsWith('text') || mimeType === 'application/javascript') {
        mimeType += '; charset=utf-8';
    }
    let shouldEdgeCache = false; // false if storing in KV by raw file path i.e. no hash
    // check manifest for map from file path to hash
    if (typeof ASSET_MANIFEST !== 'undefined') {
        if (ASSET_MANIFEST[pathKey]) {
            pathKey = ASSET_MANIFEST[pathKey];
            // if path key is in asset manifest, we can assume it contains a content hash and can be cached
            shouldEdgeCache = true;
        }
    }
    // TODO this excludes search params from cache, investigate ideal behavior
    let cacheKey = new Request(`${parsedUrl.origin}/${pathKey}`, request);
    // if argument passed in for cacheControl is a function then
    // evaluate that function. otherwise return the Object passed in
    // or default Object
    const evalCacheOpts = (() => {
        switch (typeof options.cacheControl) {
            case 'function':
                return options.cacheControl(request);
            case 'object':
                return options.cacheControl;
            default:
                return defaultCacheControl;
        }
    })();
    // formats the etag depending on the response context. if the entityId
    // is invalid, returns an empty string (instead of null) to prevent the
    // the potentially disastrous scenario where the value of the Etag resp
    // header is "null". Could be modified in future to base64 encode etc
    const formatETag = (entityId = pathKey, validatorType = 'strong') => {
        if (!entityId) {
            return '';
        }
        switch (validatorType) {
            case 'weak':
                if (!entityId.startsWith('W/')) {
                    return `W/${entityId}`;
                }
                return entityId;
            case 'strong':
                if (entityId.startsWith(`W/"`)) {
                    entityId = entityId.replace('W/', '');
                }
                if (!entityId.endsWith(`"`)) {
                    entityId = `"${entityId}"`;
                }
                return entityId;
            default:
                return '';
        }
    };
    options.cacheControl = Object.assign({}, defaultCacheControl, evalCacheOpts);
    // override shouldEdgeCache if options say to bypassCache
    if (options.cacheControl.bypassCache ||
        options.cacheControl.edgeTTL === null ||
        request.method == 'HEAD') {
        shouldEdgeCache = false;
    }
    // only set max-age if explicitly passed in a number as an arg
    const shouldSetBrowserCache = typeof options.cacheControl.browserTTL === 'number';
    let response = null;
    if (shouldEdgeCache) {
        response = await cache.match(cacheKey);
    }
    if (response) {
        if (response.status > 300 && response.status < 400) {
            if (response.body && 'cancel' in Object.getPrototypeOf(response.body)) {
                // Body exists and environment supports readable streams
                response.body.cancel();
            }
            response = new Response(null, response);
        }
        else {
            // fixes #165
            let opts = {
                headers: new Headers(response.headers),
                status: 0,
                statusText: '',
            };
            opts.headers.set('cf-cache-status', 'HIT');
            if (response.status) {
                opts.status = response.status;
                opts.statusText = response.statusText;
            }
            else if (opts.headers.has('Content-Range')) {
                opts.status = 206;
                opts.statusText = 'Partial Content';
            }
            else {
                opts.status = 200;
                opts.statusText = 'OK';
            }
            response = new Response(response.body, opts);
        }
    }
    else {
        const body = await ASSET_NAMESPACE.get(pathKey, 'arrayBuffer');
        if (body === null) {
            throw new types_1.NotFoundError(`could not find ${pathKey} in your content namespace`);
        }
        response = new Response(body);
        if (shouldEdgeCache) {
            response.headers.set('Accept-Ranges', 'bytes');
            response.headers.set('Content-Length', body.length);
            // set etag before cache insertion
            if (!response.headers.has('etag')) {
                response.headers.set('etag', formatETag(pathKey, 'strong'));
            }
            // determine Cloudflare cache behavior
            response.headers.set('Cache-Control', `max-age=${options.cacheControl.edgeTTL}`);
            event.waitUntil(cache.put(cacheKey, response.clone()));
            response.headers.set('CF-Cache-Status', 'MISS');
        }
    }
    response.headers.set('Content-Type', mimeType);
    if (response.status === 304) {
        let etag = formatETag(response.headers.get('etag'), 'strong');
        let ifNoneMatch = cacheKey.headers.get('if-none-match');
        let proxyCacheStatus = response.headers.get('CF-Cache-Status');
        if (etag) {
            if (ifNoneMatch && ifNoneMatch === etag && proxyCacheStatus === 'MISS') {
                response.headers.set('CF-Cache-Status', 'EXPIRED');
            }
            else {
                response.headers.set('CF-Cache-Status', 'REVALIDATED');
            }
            response.headers.set('etag', formatETag(etag, 'weak'));
        }
    }
    if (shouldSetBrowserCache) {
        response.headers.set('Cache-Control', `max-age=${options.cacheControl.browserTTL}`);
    }
    else {
        response.headers.delete('Cache-Control');
    }
    return response;
};
exports.getAssetFromKV = getAssetFromKV;
}(dist));

async function handleQwik(request) {
    const html = await serverRender({
        url: request.url,
        debug: true,
        qrlMapper: createQrlMapper(qmapping)
    });
    return new Response(html.html, {
        headers: {
            'content-type': 'text/html'
        }
    });
}
addEventListener("fetch", (event)=>{
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/build/') || url.pathname.startsWith('/static/')) try {
        event.respondWith(dist.getAssetFromKV(event));
    } catch (e) {
        event.respondWith(new Response(`"${url.pathname}" not found`, {
            status: 404,
            statusText: "not found"
        }));
    }
    else event.respondWith(handleQwik(event.request));
});

const ToDoApp_onRender = /*#__PURE__*/ qHook(({ todos  })=>{
    console.log('on:qRender => <ToDoApp/>');
    return h("section", {
        class: "todoapp"
    }, h(Header, {
        todos: todos
    }), h(Main, {
        todos: todos
    }), h(Footer, {
        todos: todos
    }));
});

const Header_onMount = /*#__PURE__*/ qHook(()=>({
        text: ''
    })
);

function addItem(todos, text) {
    todos.items.push(qObject({
        completed: false,
        title: text
    }));
    updateFilter(todos);
}
function removeItem(todos, TodoItem) {
    todos.items = todos.items.filter((i)=>i != TodoItem
    );
    updateFilter(todos);
}
function toggleItem(todos, TodoItem) {
    TodoItem.completed = !TodoItem.completed;
    updateFilter(todos);
}
function clearCompleted(todos) {
    todos.items = todos.items.filter(FILTERS.active);
    updateFilter(todos);
}
const FilterStates = [
    'all',
    'active',
    'completed'
];
const FILTERS = {
    all: ()=>true
    ,
    active: (i)=>i.completed == false
    ,
    completed: (i)=>i.completed == true
};
function updateFilter(todos, filter) {
    if (filter) todos.filter = filter.toLowerCase();
}
function getFilteredItems(todos) {
    return todos.items.filter(FILTERS[todos.filter]);
}
function getFilteredCount(todos) {
    return getFilteredItems(todos).filter(FILTERS.active).length;
}

const Header_onRender_on_keyup = /*#__PURE__*/ qHook(({ todos  }, state)=>{
    const event = useEvent();
    const inputValue = (event.target).value;
    state.text = inputValue;
    if (event.key === 'Enter' && inputValue) {
        addItem(todos, state.text);
        state.text = '';
    }
});

const Header_onRender = /*#__PURE__*/ qHook((_, { text  })=>{
    console.log('on:qRender => <Header/>');
    return h(Fragment, null, h("h1", null, "todos"), h("input", {
        class: "new-todo",
        placeholder: "What needs to be done?",
        autoFocus: true,
        value: text,
        "on:keyup": qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
        , "Header_onRender_on_keyup")
    }));
});

const Main_onRender = /*#__PURE__*/ qHook(({ todos  })=>{
    console.log('on:qRender => <Main/>');
    return h(Host, {
        class: "main"
    }, h("ul", {
        class: "todo-list"
    }, getFilteredItems(todos).map((key)=>h(Item, {
            item: key,
            todos: todos
        })
    )));
});

const Item_onMount = /*#__PURE__*/ qHook(()=>({
        editing: false
    })
);

const Item_onRender_on_click = /*#__PURE__*/ qHook(({ item , todos  })=>toggleItem(todos, item)
);

const Item_onRender_on_dblclick = /*#__PURE__*/ qHook(async (props, state)=>{
    state.editing = true;
    const hostElement = useHostElement();
    await qNotifyRender(hostElement);
    const inputEl = hostElement.querySelector('input.edit');
    inputEl.focus();
    inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
});

const Item_onRender_on_click9 = /*#__PURE__*/ qHook(({ item , todos  })=>removeItem(todos, item)
);

const Item_onRender_on_blur = /*#__PURE__*/ qHook((_, state)=>(state.editing = false)
);

const Item_onRender_on_keyup = /*#__PURE__*/ qHook(({ item  }, state)=>{
    const event = useEvent();
    const inputValue = (event.target).value;
    item.title = inputValue;
    if (event.key === 'Enter') {
        state.editing = false;
    }
});

const Item_onRender = /*#__PURE__*/ qHook(({ item  }, { editing  })=>{
    console.log('on:qRender => <Item item="' + JSON.stringify(item, (key, value)=>(key.startsWith('__') ? undefined : value)
    ) + '"/>');
    return h(Host, {
        class: {
            completed: item.completed,
            editing: editing
        }
    }, h("div", {
        class: "view"
    }, h("input", {
        class: "toggle",
        type: "checkbox",
        checked: item.completed,
        "on:click": qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
        , "Item_onRender_on_click")
    }), h("label", {
        "on:dblclick": qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
        , "Item_onRender_on_dblclick")
    }, item.title), h("button", {
        class: "destroy",
        "on:click": qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
        , "Item_onRender_on_click9")
    })), editing ? h("input", {
        class: "edit",
        value: item.title,
        "on:blur": qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
        , "Item_onRender_on_blur"),
        "on:keyup": qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
        , "Item_onRender_on_keyup")
    }) : null);
});

const Footer_onRender_Filter_on_click = /*#__PURE__*/ qHook((props, _, { filter  })=>updateFilter(props.todos, filter)
);

const Footer_onRender_on_click = /*#__PURE__*/ qHook(({ todos  })=>clearCompleted(todos)
);

const Footer_onRender = /*#__PURE__*/ qHook(({ todos  })=>{
    console.log('on:qRender => <Footer/>');
    function Filter({ filter  }) {
        const lMode = filter.toLowerCase();
        return h("li", null, h("a", {
            class: {
                selected: todos.filter == lMode
            },
            "on:click": qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
            , "Footer_onRender_Filter_on_click").with({
                filter
            })
        }, filter[0].toUpperCase() + filter.substr(1)));
    }
    const remaining = getFilteredCount(todos);
    return h(Host, {
        class: "footer"
    }, todos.items.length > 0 ? h(Fragment, null, h("span", {
        class: "todo-count"
    }, h("strong", null, remaining), remaining == 1 ? ' item' : ' items', " left"), h("ul", {
        class: "filters"
    }, FilterStates.map((f)=>h(Filter, {
            filter: f
        })
    )), remaining > 0 ? h("button", {
        class: "clear-completed",
        "on:click": qHook(()=>Promise.resolve().then(function () { return entry_hooks; })
        , "Footer_onRender_on_click")
    }, "Clear completed") : null) : null);
});

var entry_hooks = /*#__PURE__*/Object.freeze({
    __proto__: null,
    ToDoApp_onRender: ToDoApp_onRender,
    Header_onMount: Header_onMount,
    Header_onRender_on_keyup: Header_onRender_on_keyup,
    Header_onRender: Header_onRender,
    Main_onRender: Main_onRender,
    Item_onMount: Item_onMount,
    Item_onRender_on_click: Item_onRender_on_click,
    Item_onRender_on_dblclick: Item_onRender_on_dblclick,
    Item_onRender_on_click9: Item_onRender_on_click9,
    Item_onRender_on_blur: Item_onRender_on_blur,
    Item_onRender_on_keyup: Item_onRender_on_keyup,
    Item_onRender: Item_onRender,
    Footer_onRender_Filter_on_click: Footer_onRender_Filter_on_click,
    Footer_onRender_on_click: Footer_onRender_on_click,
    Footer_onRender: Footer_onRender
});
