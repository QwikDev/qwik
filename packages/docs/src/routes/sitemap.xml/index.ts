import type { RequestHandler } from '@builder.io/qwik-city';
import cityPlan from '@qwik-city-plan';

export const onGet: RequestHandler = ({ response }) => {
  response.headers.set(
    'Content-Type', 'application/xml',
  );
  const { routes = [] } = cityPlan
  const pages = routes.map(([pattern]) => {
    return pattern.source.split('\\/')
      .filter(pathLike => ['^', '?$', '$'].indexOf(pathLike) < 0)
      .join('/')
  })
    // can't deal with dynamic routes for now, currently just for testing docs search crawler
    .filter(path => path.startsWith('docs') || path.startsWith('qwikcity'))

  return `<?xml version="1.0" encoding="UTF-8" ?>
	<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
		${pages
			.map(
				(page) =>
					`<url>
			<loc>${website}/${page}</loc>
		  </url>`
			)
			.join('')}
	</urlset>`
};

const website = 'http://host.docker.internal:3000'
