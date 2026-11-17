import type { RequestHandler } from '@qwik.dev/router';
import { releaseStreams } from '~/components/fixtures/streaming/stream-gate';

export const onGet: RequestHandler = ({ json }) => {
  releaseStreams();
  json(200, { released: true });
};
