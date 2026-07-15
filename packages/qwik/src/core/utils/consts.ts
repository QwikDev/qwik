export const EMPTY_STRING = '';

export const EMPTY_NODES: readonly Node[] = [];

export const EMPTY_ARRAY: [] = [];

export const enum NodeType {
  Element = 1,
  Text = 3,
  Comment = 8,
  Document = 9,
  DocumentFragment = 11,
}

// static strings

export const PassiveEventPrefix = 'passive:';
export const PreventDefaultEventPrefix = 'preventdefault:';
export const StopPropagationEventPrefix = 'stoppropagation:';
export const BindEventPrefix = 'bind:';

export const EventSuffix = '$';

export const ClassAttr = 'class';
export const ClassNameAttr = 'className';
export const ValueAttr = 'value';
export const CheckedAttr = 'checked';
export const RefAttr = 'ref';
export const StyleAttr = 'style';
export const DangerousInnerHTMLAttr = 'dangerouslySetInnerHTML';
