import { renderToString, type RenderOptions } from '@qwik.dev/core/server';
import { Root } from './root';

export default function (opts: RenderOptions) {
  return renderToString(<Root />, opts);
}
