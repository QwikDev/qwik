import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import { Root } from './root';

export default (options: RenderToStreamOptions) => renderToStream(Root, options);
