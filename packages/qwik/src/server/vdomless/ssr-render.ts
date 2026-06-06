import { StringSSRWriter } from '../ssr-stream-writer';
import type {
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
} from '../types';

export interface SsrRenderContext {}

export type SsrRenderRoot = (_props: undefined, ctx: SsrRenderContext) => string;

export const renderToString = async (
  root: SsrRenderRoot,
  opts: RenderToStringOptions = {}
): Promise<RenderToStringResult> => {
  const stream = new StringSSRWriter();
  const result = await renderToStream(root, { ...opts, stream });

  return {
    html: stream.toString(),
    isStatic: result.isStatic,
    manifest: result.manifest,
    snapshotResult: result.snapshotResult,
    timing: result.timing,
  };
};

export const renderToStream = async (
  root: SsrRenderRoot,
  opts: RenderToStreamOptions
): Promise<RenderToStreamResult> => {
  const html = root(undefined, {});
  await opts.stream.write(html);

  return {
    flushes: 0,
    size: html.length,
    isStatic: false,
    manifest: undefined,
    timing: {
      firstFlush: 0,
      render: 0,
      snapshot: 0,
    },
  };
};
