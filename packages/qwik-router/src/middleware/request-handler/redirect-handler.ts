import { shareClassIdentity } from './shared-class-identity';

/** @public */
export class AbortMessage {
  /** Type-only brand so `Exclude<>` can drop control-flow signals from resolved loader/action data. */
  declare readonly __controlFlow: true;
}
shareClassIdentity(AbortMessage, 'AbortMessage');

/** @public */
export class RedirectMessage extends AbortMessage {}
shareClassIdentity(RedirectMessage, 'RedirectMessage');
