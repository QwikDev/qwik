import { AbortMessage } from "./redirect-handler";

/** @public */
export class RewriteMessage extends AbortMessage {
  constructor(readonly pathname: string) {
    super();
  }
}
