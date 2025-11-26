import type { VNodeOperationType } from '../enums/vnode-operation-type.enum';

export type VNodeOperation = TargetAndParentDomVNodeOperation | SimpleDomVNodeOperation;

export type TargetAndParentDomVNodeOperation = {
  operationType: VNodeOperationType.InsertOrMove;
  target: Element | Text | null;
  parent: Element;
  attrs?: Record<string, string | null | boolean>;
};

export type SimpleDomVNodeOperation = {
  operationType:
    | VNodeOperationType.None
    | VNodeOperationType.Delete
    | VNodeOperationType.RemoveAllChildren
    | VNodeOperationType.SetText;
  attrs?: Record<string, string | null | boolean>;
};

export type VirtualVNodeOperation = {
  operationType: VNodeOperationType.SkipRender;
};
