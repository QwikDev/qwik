import { renderToString, RenderOptions } from '@builder.io/qwik/server';
import { Root } from './root';

export function render(opts: RenderOptions) {
  return renderToString(<Root />, opts);
}
