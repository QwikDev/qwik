import { AbortMessage } from './redirect-handler';
import { shareClassIdentity } from './shared-class-identity';

/** @public */
export class RewriteMessage extends AbortMessage {
  constructor(readonly pathname: string) {
    super();
  }
}
shareClassIdentity(RewriteMessage, 'RewriteMessage');
