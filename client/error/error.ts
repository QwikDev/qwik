/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { stringifyDebug } from './stringify.js';

export const enum QError {
  // core 000-099
  Core_qConfigNotFound_path = 1,
  Core_unrecognizedStack_frame = 2,
  Core_noAttribute_atr1_element = 3,
  Core_noAttribute_atr1_attr2_element = 4,
  Core_missingProperty_name_props = 5,
  Core_missingExport_name_url_props = 6,
  // QRL 100-199
  QRL_expectFunction_url_actual = 100,
  // Injection 200-299
  Injection_noHost_element = 200,
  Injection_expectedSpecificInjector_expected_actual = 201,
  Injection_notElement_arg = 202,
  Injection_wrongMethodThis_expected_actual = 203,
  Injection_missingSerializedState_serviceKey_element = 204,
  Injection_notEventInjector = 205,
  Injection_notFound_element = 206,
  // Services 300-399
  Service_notValidKey_key = 300,
  Service_keyAlreadyExists_key = 301,
  Service_invalidAttribute_name = 303,
  Service_missingExpandoOrState_attrName = 304,
  Service_elementMissingServiceAttr_element_attr = 305,
  Service_noState_service_props = 306,
  Service_expected_obj = 307,
  Service_overridesConstructor_service = 308,
  Service_keyMissingParts_key_key = 309,
  Service_no$type_service = 310,
  Service_no$keyProps_service = 311,
  Service_no$qrl_service = 312,
  Service_nameCollision_name_currentQrl_expectedQrl = 313,
  Service_keyTooManyParts_service_parts_key = 314,
  Service_keyNameMismatch_key_name_service_name = 315,
  // Component 400-499
  Component_bindNeedsKey = 400,
  Component_bindNeedsValue = 401,
  Component_needsState = 402,
  Component_needsInjectionContext_constructor = 403,
  Component_noProperty_propName_props_host = 404,
  Component_notFound_component = 405,
  Component_doesNotMatch_component_actual = 406,
  Component_missingTemplateQRL_component = 407,
  Component_noState_component_props = 408,
  // Provider 500-599
  Provider_unrecognizedFormat_value = 500,
  // Render 600-699
  Render_unexpectedJSXNodeType_type = 600,
  // Event
  Event_emitEventRequiresName_url = 700,
  Event_emitEventCouldNotFindListener_event_element = 701,
}

export function qError(code: QError, ...args: any[]): Error {
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

function codeToText(code: QError): string {
  const area = {
    0: 'ERROR',
    1: 'QRL-ERROR',
    2: 'INJECTION-ERROR',
    3: 'SERVICE-ERROR',
    4: 'COMPONENT-ERROR',
    5: 'PROVIDER-ERROR',
    6: 'RENDER-ERROR',
    7: 'EVENT-ERROR',
  }[Math.floor(code / 100)];
  const text = {
    [QError.Core_qConfigNotFound_path]: "QConfig not found in path '{}'.",
    [QError.Core_unrecognizedStack_frame]: "Unrecognized stack format '{}'",
    [QError.Core_noAttribute_atr1_element]:
      "Could not find service state '{}' at '{}' or any of it's parents.",
    [QError.Core_noAttribute_atr1_attr2_element]:
      "Could not find service state '{}' ( or service provider '{}') at '{}' or any of it's parents.",
    [QError.Core_missingProperty_name_props]: "Missing property '{}' in props '{}'.",
    [QError.Core_missingExport_name_url_props]:
      "Missing export '{}' from '{}'. Exported symbols are: {}",
    //////////////
    [QError.QRL_expectFunction_url_actual]: "QRL '${}' should point to function, was '{}'.",
    //////////////
    [QError.Injection_noHost_element]: "Can't find host element above '{}'.",
    [QError.Injection_expectedSpecificInjector_expected_actual]:
      "Provider is expecting '{}' but got '{}'.",
    [QError.Injection_notElement_arg]: "Expected 'Element' was '{}'.",
    [QError.Injection_wrongMethodThis_expected_actual]:
      "Expected injection 'this' to be of type '{}', but was of type '{}'.",
    [QError.Injection_missingSerializedState_serviceKey_element]:
      "Service key '{}' is found on '{}' but does not contain state. Was 'serializeState()' not run during dehydration?",
    [QError.Injection_notEventInjector]:
      "Injector is being used as 'EventInjector' but it was 'ElementInjector'. Have you used a provider which expects 'EventInjector' in 'ElementInjector' context?",
    [QError.Injection_notFound_element]: "No injector can be found starting at '{}'.",
    //////////////
    [QError.Service_notValidKey_key]:
      "Data key '{}' is not a valid key.\n" +
      '  - Data key can only contain characters (preferably lowercase) or number\n' +
      '  - Data key is prefixed with service name\n' +
      "  - Data key is made up from parts that are separated with ':'.",
    [QError.Service_keyAlreadyExists_key]: "A service with key '{}' already exists.",
    [QError.Service_invalidAttribute_name]:
      "'{}' is not a valid attribute. " +
      "Attributes can only contain 'a-z' (lowercase), '0-9', '-' and '_'.",
    [QError.Service_missingExpandoOrState_attrName]:
      "Found '{}' but expando did not have service and attribute did not have state.",
    [QError.Service_elementMissingServiceAttr_element_attr]:
      "Element '{}' is missing service attribute definition '{}'.",
    [QError.Service_noState_service_props]:
      "Unable to create state for service '{}' with props '{}' because no state found and '$newState()' method was not defined on service.",
    [QError.Service_expected_obj]: "'{}' is not an instance of 'Service'.",
    [QError.Service_overridesConstructor_service]:
      "'{}' overrides 'constructor' property preventing 'ServiceType' retrieval.",
    [QError.Service_no$keyProps_service]: "Service '{}' does not define '$keyProps'.",
    [QError.Service_no$type_service]:
      "Service '{}' must have static '$type' property defining the name of the service.",
    [QError.Service_no$qrl_service]:
      "Service '{}' must have static '$qrl' property defining the import location of the service.",
    [QError.Service_nameCollision_name_currentQrl_expectedQrl]:
      "Name collision. Already have service named '{}' with QRL '{}' but expected QRL '{}'.",
    [QError.Service_keyMissingParts_key_key]:
      "Service key '{}' is missing values. Expecting '{}:someValue'.",
    [QError.Service_keyTooManyParts_service_parts_key]:
      "Service '{}' defines '$keyProps' as  '{}'. Actual key '{}' has more parts than service defines.",
    [QError.Service_keyNameMismatch_key_name_service_name]:
      "Key '{}' belongs to service named '{}', but expected service '{}' with name '{}'.",
    //////////////
    [QError.Component_bindNeedsKey]:
      "'bind:' must have an key. (Example: 'bind:key=\"propertyName\"').",
    [QError.Component_bindNeedsValue]:
      "'bind:id' must have a property name. (Example: 'bind:key=\"propertyName\"').",
    [QError.Component_needsState]: "Can't find state on host element.",
    [QError.Component_needsInjectionContext_constructor]:
      "Components must be instantiated inside an injection context. Use '{}.new(...)' for creation.",
    [QError.Component_noProperty_propName_props_host]:
      "Property '{}' not found in '{}' on component '{}'.",
    [QError.Component_notFound_component]: "Unable to find '{}' component.",
    [QError.Component_doesNotMatch_component_actual]:
      "Requesting component '{}' does not match existing component '{}'. Verify that the two components have distinct '$templateQRL's.",
    [QError.Component_missingTemplateQRL_component]:
      "Expecting Component '{}' to have static '$templateQRL' property, but none was found.",
    [QError.Component_noState_component_props]:
      "Unable to create state for component '{}' with props '{}' because no state found and '$newState()' method was not defined on component.",
    //////////////
    [QError.Provider_unrecognizedFormat_value]: "Unrecognized expression format '{}'.",
    //////////////
    [QError.Render_unexpectedJSXNodeType_type]: 'Unexpected JSXNode<{}> type.',
    //////////////
    [QError.Event_emitEventRequiresName_url]: "Missing '$type' attribute in the '{}' url.",
    [QError.Event_emitEventCouldNotFindListener_event_element]:
      "Re-emitting event '{}' but no listener found at '{}' or any of its parents.",
  }[code];
  let textCode = '000' + code;
  textCode = textCode.substr(textCode.length - 3);
  return `${area}(Q-${textCode}): ${text}`;
}
