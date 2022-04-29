import { renderToString, RenderToStringOptions } from '@builder.io/qwik/server';
import { Root } from './root';

export function render(opts: RenderToStringOptions) {
  return renderToString(<Root />, opts);
}
