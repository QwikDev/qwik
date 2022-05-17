import { renderToString, RenderToStringOptions } from '@builder.io/qwik/server';
// import { manifest } from '@qwik-client-manifest';
import { Root } from './root';

export function render(opts: RenderToStringOptions) {
  return renderToString(<Root />, { ...opts });
}
