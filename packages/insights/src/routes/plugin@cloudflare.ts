import type { RequestHandler } from '@qwik.dev/router';
import type { PlatformCloudflarePages } from '@qwik.dev/router/middleware/cloudflare-pages';

export const onRequest: RequestHandler = ({ next, platform }) => {
  const completion = next();
  // Keep telemetry writes alive after Cloudflare sends the response.
  const { ctx } = platform as Partial<PlatformCloudflarePages>;
  // The router handles redirects and errors through the original promise.
  ctx?.waitUntil(completion.catch(() => {}));
  return completion;
};
