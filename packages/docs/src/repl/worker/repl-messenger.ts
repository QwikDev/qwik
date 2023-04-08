import type { ReplMessageBase, ReplMessage } from '../types';
import { appUpdate } from './app-update';

export const receiveMessageFromMain = (ev: MessageEvent) => {
  if (ev.data) {
    const msg: ReplMessage = JSON.parse(ev.data);
    if (msg.type === 'update') {
      appUpdate(ev.source as any as WindowClient, msg.clientId, msg.options);
    }
  }
};

export const sendMessageToReplServer = async (source: WindowClient, msg: ReplMessageBase) => {
  source.postMessage(msg);
};

export interface WindowClient {
  focused: boolean;
  frameType: 'nested';
  id: string;
  type: 'window';
  url: string;
  visibilityState: string;
  postMessage: (msg: ReplMessageBase) => void;
}
