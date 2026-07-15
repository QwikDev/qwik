import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import { Root } from './root';

const render = (opts: RenderToStreamOptions) => {
  return renderToStream(Root, opts);
};

export default render;
