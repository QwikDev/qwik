import { VNodeOperationType } from '../enums/vnode-operation-type.enum';

export type VNodeOperation =
  | DeleteOperation
  | RemoveAllChildrenOperation
  | SetTextOperation
  | InsertOrMoveOperation
  | SetAttributeOperation;

export class DeleteOperation {
  constructor(public target: Element | Text) {}
}

export class RemoveAllChildrenOperation {
  constructor(public target: Element) {}
}

export class SetTextOperation {
  operationType = VNodeOperationType.SetText;
  constructor(
    public target: Text,
    public text: string
  ) {}
}

export class InsertOrMoveOperation {
  constructor(
    public target: Element | Text,
    public parent: Element,
    public beforeTarget: Element | Text | null
  ) {}
}

export class SetAttributeOperation {
  constructor(
    public target: Element,
    public attrName: string,
    public attrValue: any,
    public scopedStyleIdPrefix: string | null,
    public isSvg: boolean
  ) {}
}

/** Factory functions to create operations with consistent hidden classes. */
export const createDeleteOperation = (target: Element | Text): DeleteOperation =>
  new DeleteOperation(target);

export const createRemoveAllChildrenOperation = (target: Element): RemoveAllChildrenOperation =>
  new RemoveAllChildrenOperation(target);

export const createSetTextOperation = (target: Text, text: string): SetTextOperation =>
  new SetTextOperation(target, text);

export const createInsertOrMoveOperation = (
  target: Element | Text,
  parent: Element,
  beforeTarget: Element | Text | null
): InsertOrMoveOperation => new InsertOrMoveOperation(target, parent, beforeTarget);

export const createSetAttributeOperation = (
  target: Element,
  attrName: string,
  attrValue: any,
  scopedStyleIdPrefix: string | null = null,
  isSvg: boolean = false
): SetAttributeOperation =>
  new SetAttributeOperation(target, attrName, attrValue, scopedStyleIdPrefix, isSvg);
