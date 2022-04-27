import { stringifyDebug } from './stringify';
import { qDev } from '../util/qdev';

export const enum QError {
  // core 000-099
  TODO = 0, // Temporary ID until we create a propr error code.
  Core_qConfigNotFound_path = 1,
  Core_unrecognizedStack_frame = 2,
  Core_noAttribute_atr1_element = 3,
  Core_noAttribute_atr1_attr2_element = 4,
  Core_missingProperty_name_props = 5,
  Core_missingExport_name_url_props = 6,
  // QRL 100-199
  QRL_expectFunction_url_actual = 100,
  // Injection 200-299
  Injector_noHost_element = 200,
  Injector_expectedSpecificInjector_expected_actual = 201,
  Injector_notElement_arg = 202,
  Injector_wrongMethodThis_expected_actual = 203,
  Injector_missingSerializedState_entityKey_element = 204,
  Injector_notFound_element = 206,
  Injector_eventInjectorNotSerializable = 207,
  // Entities 300-399
  Entity_notValidKey_key = 300,
  Entity_keyAlreadyExists_key = 301,
  Entity_invalidAttribute_name = 303,
  Entity_missingExpandoOrState_attrName = 304,
  Entity_elementMissingEntityAttr_element_attr = 305,
  Entity_noState_entity_props = 306,
  Entity_expected_obj = 307,
  Entity_overridesConstructor_entity = 308,
  Entity_keyMissingParts_key_key = 309,
  Entity_no$type_entity = 310,
  Entity_no$keyProps_entity = 311,
  Entity_no$qrl_entity = 312,
  Entity_nameCollision_name_currentQrl_expectedQrl = 313,
  Entity_keyTooManyParts_entity_parts_key = 314,
  Entity_keyNameMismatch_key_name_entity_name = 315,
  Entity_stateMissingKey_state = 316,
  // Component 400-499
  Component_bindNeedsKey = 400,
  Component_bindNeedsValue = 401,
  Component_needsState = 402,
  Component_needsInjectionContext_constructor = 403,
  Component_noProperty_propName_props_host = 404,
  Component_notFound_component = 405,
  Component_doesNotMatch_component_actual = 406,
  Component_noState_component_props = 408,
  // Provider 500-599
  Provider_unrecognizedFormat_value = 500,
  // Render 600-699
  Render_unexpectedJSXNodeType_type = 600,
  Render_unsupportedFormat_obj_attr = 601,
  Render_expectingEntity_entity = 602,
  Render_expectingEntityArray_obj = 603,
  Render_expectingEntityOrComponent_obj = 604,
  Render_stateMachineStuck = 699,
  // Event
  Event_emitEventRequiresName_url = 700,
  Event_emitEventCouldNotFindListener_event_element = 701,
}

export function qError(code: QError, ...args: any[]): Error {
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
  } else {
    return new Error(`QError ` + code);
  }
}

function codeToText(code: QError): string {
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
    [QError.Core_noAttribute_atr1_element]:
      "Could not find entity state '{}' at '{}' or any of it's parents.",
    [QError.Core_noAttribute_atr1_attr2_element]:
      "Could not find entity state '{}' ( or entity provider '{}') at '{}' or any of it's parents.",
    [QError.Core_missingProperty_name_props]: "Missing property '{}' in props '{}'.",
    [QError.Core_missingExport_name_url_props]:
      "Missing export '{}' from '{}'. Exported symbols are: {}",
    //////////////
    [QError.QRL_expectFunction_url_actual]: "QRL '${}' should point to function, was '{}'.",
    //////////////
    [QError.Injector_noHost_element]: "Can't find host element above '{}'.",
    [QError.Injector_expectedSpecificInjector_expected_actual]:
      "Provider is expecting '{}' but got '{}'.",
    [QError.Injector_notElement_arg]: "Expected 'Element' was '{}'.",
    [QError.Injector_wrongMethodThis_expected_actual]:
      "Expected injection 'this' to be of type '{}', but was of type '{}'.",
    [QError.Injector_missingSerializedState_entityKey_element]:
      "Entity key '{}' is found on '{}' but does not contain state. Was 'serializeState()' not run during dehydration?",
    [QError.Injector_notFound_element]: "No injector can be found starting at '{}'.",
    [QError.Injector_eventInjectorNotSerializable]: 'EventInjector does not support serialization.',
    //////////////
    [QError.Entity_notValidKey_key]:
      "Data key '{}' is not a valid key.\n" +
      '  - Data key can only contain characters (preferably lowercase) or number\n' +
      '  - Data key is prefixed with entity name\n' +
      "  - Data key is made up from parts that are separated with ':'.",
    [QError.Entity_keyAlreadyExists_key]: "A entity with key '{}' already exists.",
    [QError.Entity_invalidAttribute_name]:
      "'{}' is not a valid attribute. " +
      "Attributes can only contain 'a-z' (lowercase), '0-9', '-' and '_'.",
    [QError.Entity_missingExpandoOrState_attrName]:
      "Found '{}' but expando did not have entity and attribute did not have state.",
    [QError.Entity_elementMissingEntityAttr_element_attr]:
      "Element '{}' is missing entity attribute definition '{}'.",
    [QError.Entity_noState_entity_props]:
      "Unable to create state for entity '{}' with props '{}' because no state found and '$newState()' method was not defined on entity.",
    [QError.Entity_expected_obj]: "'{}' is not an instance of 'Entity'.",
    [QError.Entity_overridesConstructor_entity]:
      "'{}' overrides 'constructor' property preventing 'EntityType' retrieval.",
    [QError.Entity_no$keyProps_entity]: "Entity '{}' does not define '$keyProps'.",
    [QError.Entity_no$type_entity]:
      "Entity '{}' must have static '$type' property defining the name of the entity.",
    [QError.Entity_no$qrl_entity]:
      "Entity '{}' must have static '$qrl' property defining the import location of the entity.",
    [QError.Entity_nameCollision_name_currentQrl_expectedQrl]:
      "Name collision. Already have entity named '{}' with QRL '{}' but expected QRL '{}'.",
    [QError.Entity_keyMissingParts_key_key]:
      "Entity key '{}' is missing values. Expecting '{}:someValue'.",
    [QError.Entity_keyTooManyParts_entity_parts_key]:
      "Entity '{}' defines '$keyProps' as  '{}'. Actual key '{}' has more parts than entity defines.",
    [QError.Entity_keyNameMismatch_key_name_entity_name]:
      "Key '{}' belongs to entity named '{}', but expected entity '{}' with name '{}'.",
    [QError.Entity_stateMissingKey_state]:
      "Entity state is missing '$key'. Are you sure you passed in state? Got '{}'.",
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
      "Requesting component type '{}' does not match existing component instance '{}'.",
    [QError.Component_noState_component_props]:
      "Unable to create state for component '{}' with props '{}' because no state found and '$newState()' method was not defined on component.",
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
    [QError.Event_emitEventCouldNotFindListener_event_element]:
      "Re-emitting event '{}' but no listener found at '{}' or any of its parents.",
  }[code];
  let textCode = '000' + code;
  textCode = textCode.slice(-3);
  return `${area}(Q-${textCode}): ${text}`;
}
