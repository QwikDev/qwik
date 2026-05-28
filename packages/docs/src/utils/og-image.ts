import homeOgUrl from '~/media/og/home-og.svg?url';

const OG_WIDTH = '1200';
const OG_HEIGHT = '630';
const OG_IMAGE_ROUTE = '/og-image/';

export const OG_IMAGE_SIZE = {
  width: OG_WIDTH,
  height: OG_HEIGHT,
};

export const getHomeOgImageUrl = (url: URL) => new URL(homeOgUrl, url).href;

export const getDynamicOgImageUrl = (url: URL, title: string, subtitle: string) => {
  const ogImageUrl = new URL(OG_IMAGE_ROUTE, url);
  ogImageUrl.searchParams.set('title', title);
  ogImageUrl.searchParams.set('subtitle', subtitle);
  return ogImageUrl.href;
};

export const getOgImageUrl = (url: URL, title: string) => {
  const [rawTitle, rawSubtitle] = title.split(' | ');
  const ogTitle = rawTitle?.trim();
  const ogSubtitle = rawSubtitle?.replace(' 📚 Qwik Documentation', '').trim();

  if (!ogTitle || !ogSubtitle) {
    return getHomeOgImageUrl(url);
  }

  return getDynamicOgImageUrl(url, ogTitle, ogSubtitle);
};
