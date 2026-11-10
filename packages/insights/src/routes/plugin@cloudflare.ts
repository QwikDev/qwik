import type { RequestHandler } from '@builder.io/qwik-city';
import type { PlatformCloudflarePages } from '@builder.io/qwik-city/middleware/cloudflare-pages';

export const onRequest: RequestHandler = ({ next, platform }) => {
  const completion = next();
  // Telemetry handlers respond before writing to Turso. Keep those writes alive
  // after Cloudflare sends the response, including when the browser disconnects.
  const { ctx } = platform as Partial<PlatformCloudflarePages>;
  ctx?.waitUntil(completion);
  return completion;
};
