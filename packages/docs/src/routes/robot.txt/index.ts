import type { RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = ({ url, response }) => {
  response.headers.set('Content-Type', 'text/plain');
  return `User-agent: *
  Allow: /
  Sitemap: https://${url.host}/sitemap.xml`
}