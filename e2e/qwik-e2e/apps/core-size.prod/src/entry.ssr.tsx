import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import { Root } from './root';

// Measures the minimal transfer, so nothing loads before the first interaction.
export default (options: RenderToStreamOptions) =>
  renderToStream(Root, { ...options, preloader: false, qwikLoader: 'inline' });
