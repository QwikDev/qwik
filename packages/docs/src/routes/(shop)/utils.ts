import { createContextId } from '@builder.io/qwik';
import type { Product, ShopApp } from './types';

export const COOKIE_CART_ID_KEY = 'cartid';

export const SHOP_CONTEXT = createContextId<ShopApp>('shop_context');

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

export const mapProducts = (data: { node: Product }[]) =>
  data
    .filter(({ node }) => node.availableForSale)
    .map(({ node }) => ({
      id: node.id,
      title: node.title,
      availableForSale: node.availableForSale,
      descriptionHtml: node.descriptionHtml,
      image: node.images.edges[0].node,
      variants: node.variants.edges.map(({ node }) => node),
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

export const deleteCookie = (name: string) => {
  document.cookie = `${name}=; expires=-1; Secure; SameSite=Strict; path=/`;
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

export function formatPrice(value = 0, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(value);
}
