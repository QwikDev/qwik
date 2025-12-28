import { VNodeOperationType } from '../enums/vnode-operation-type.enum';

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

/** Factory functions to create operations with consistent hidden classes. */
export const createDeleteOperation = (target: Element | Text): DeleteOperation => ({
  operationType: VNodeOperationType.Delete,
  target,
});

export const createRemoveAllChildrenOperation = (target: Element): RemoveAllChildrenOperation => ({
  operationType: VNodeOperationType.RemoveAllChildren,
  target,
});

export const createSetTextOperation = (target: Text, text: string): SetTextOperation => ({
  operationType: VNodeOperationType.SetText,
  target,
  text,
});

export const createInsertOrMoveOperation = (
  target: Element | Text,
  parent: Element,
  beforeTarget: Element | Text | null
): InsertOrMoveOperation => ({
  operationType: VNodeOperationType.InsertOrMove,
  target,
  parent,
  beforeTarget,
});

export const createSetAttributeOperation = (
  target: Element,
  attrName: string,
  attrValue: string | null | boolean
): SetAttributeOperation => ({
  operationType: VNodeOperationType.SetAttribute,
  target,
  attrName,
  attrValue,
});
