import type { VNodeOperationType } from '../enums/vnode-operation-type.enum';

export type VNodeOperation =
  | DeleteOperation
  | RemoveAllChildrenOperation
  | SetTextOperation
  | InsertOrMoveOperation
  | SetAttributeOperation;

export type DeleteOperation = {
  operationType: VNodeOperationType.Delete;
  target: Element | Text;
};

export type RemoveAllChildrenOperation = {
  operationType: VNodeOperationType.RemoveAllChildren;
  target: Element;
};

export type SetTextOperation = {
  operationType: VNodeOperationType.SetText;
  target: Text;
  text: string;
};

export type InsertOrMoveOperation = {
  operationType: VNodeOperationType.InsertOrMove;
  target: Element | Text;
  parent: Element;
  beforeTarget: Element | Text | null;
};

export type SetAttributeOperation = {
  operationType: VNodeOperationType.SetAttribute;
  target: Element;
  attrName: string;
  attrValue: string | null | boolean;
};
