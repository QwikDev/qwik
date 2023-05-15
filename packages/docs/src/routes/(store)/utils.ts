import { createContextId } from '@builder.io/qwik';

export const COOKIE_CART_ID_KEY = 'cartid';

export const STORE_CONTEXT = createContextId<{
  products?: any;
  cart?: any;
}>('store_context');

export const fetchFromShopify = async (body: unknown) =>
  await fetch(import.meta.env.PUBLIC_SHOPIFY_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': import.meta.env.PUBLIC_SHOPIFY_TOKEN,
    },
    body: JSON.stringify(body),
  });

export const mapProducts = (data: any[]) =>
  data
    .filter(({ node }) => node.availableForSale)
    .map(({ node }: any) => ({
      id: node.id,
      title: node.title,
      availableForSale: node.availableForSale,
      image: node.images.edges[0].node,
      body_html: node.descriptionHtml,
      variants: node.variants.edges.map(({ node }: any) => node),
    }));

export const setCookie = (name: string, value: string, days: number) => {
  let expires = '';
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    expires = '; expires=' + date.toUTCString();
  }
  document.cookie =
    name +
    '=' +
    (value.split('=').join('|___|') || '') +
    expires +
    `; Secure; SameSite=Strict; path=/`;
};

export const getCookie = (name: string) => {
  const keyValues = document.cookie.split(';');
  let result = '';
  keyValues.forEach((item) => {
    const [key, value] = item.split('=');
    if (key.trim() === name) {
      result = value.split('|___|').join('=');
    }
  });
  return result;
};

export function formatPrice(value = 0, currency: any) {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency,
	}).format(value);
}
