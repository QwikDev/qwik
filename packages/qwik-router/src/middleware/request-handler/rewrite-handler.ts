import { AbortMessage } from './redirect-handler';

/** @public */
export class RewriteMessage extends AbortMessage {
  constructor(
    readonly pathname: string,
    /** When set, replaces the request's query string; otherwise the original query is kept. */
    readonly search?: string
  ) {
    super();
  }
}
