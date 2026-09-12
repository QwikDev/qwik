import { QwikHook } from '../words';
import { CoreOperation } from '../schema';
import { LocalKind } from './locals';

interface SetupCallContract {
  operation: CoreOperation;
  result?: LocalKind.Const | LocalKind.Qrl | LocalKind.Signal;
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
  [QwikHook.UseComputed, { operation: CoreOperation.CreateComputed, result: LocalKind.Signal }],
  [QwikHook.UseTask, { operation: CoreOperation.Task, blocksRender: true }],
  [QwikHook.UseVisibleTask, { operation: CoreOperation.VisibleTask }],
  [QwikHook.UseSerializer, { operation: CoreOperation.Serializer, result: LocalKind.Signal }],
]);
