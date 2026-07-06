/** @public */
export class AbortMessage {
  /** Type-only brand so `Exclude<>` can drop control-flow signals from resolved loader/action data. */
  declare readonly __controlFlow: true;
}

/** @public */
export class RedirectMessage extends AbortMessage {}
