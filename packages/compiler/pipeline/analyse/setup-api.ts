import { QwikHook } from '../words';
import { CoreOperation } from '../schema';
import { LocalKind } from './locals';

export interface SetupCallContract {
  operation: CoreOperation;
  result?: LocalKind.Const | LocalKind.Qrl | LocalKind.Signal | LocalKind.Store;
  maxArgs?: number;
  /** The initial run must finish before the render reads its writes. */
  blocksRender?: true;
}

/** Binding-resolved core contracts, independent of call emission. */
export const coreSetupCalls: ReadonlyMap<string, SetupCallContract> = new Map([
  [
    QwikHook.UseSignal,
    { operation: CoreOperation.CreateSignal, result: LocalKind.Signal, maxArgs: 1 },
  ],
  [QwikHook.UseStore, { operation: CoreOperation.CreateStore, result: LocalKind.Store }],
  [QwikHook.UseId, { operation: CoreOperation.UseId, result: LocalKind.Const, maxArgs: 0 }],
  [
    QwikHook.UseChildrenInfo,
    { operation: CoreOperation.ChildrenInfo, result: LocalKind.Const, maxArgs: 0 },
  ],
  [QwikHook.UseComputed, { operation: CoreOperation.CreateComputed, result: LocalKind.Signal }],
  [QwikHook.UseTask, { operation: CoreOperation.Task, blocksRender: true }],
  [QwikHook.UseVisibleTask, { operation: CoreOperation.VisibleTask }],
  [QwikHook.UseSerializer, { operation: CoreOperation.Serializer, result: LocalKind.Signal }],
]);
