/** Contains additional items which Qwik patches on the Document. */
export interface QwikDocument extends Document {
  __q_context__?: [HTMLElement, Event, URL] | {};
}

export const _is_module = true;
