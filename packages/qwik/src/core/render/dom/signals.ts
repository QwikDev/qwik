
type SignalSetProperty = [id: 0, elm: Node, prop: string];
type SignalSetAttribute = [id: 1, elm: Element, attribute: string];
type SignalToggleClass = [id: 2, elm: Element, prop: string];

export type SignalOp = SignalSetProperty | SignalSetAttribute | SignalToggleClass;
