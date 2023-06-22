import { type JSXNode, type QwikIntrinsicElements } from '@builder.io/qwik';

export function url(url: '/app/'): string;
export function url(url: '/app/__new__/edit/'): string;
export function url(url: '/app/[publicApiKey]/', param: { publicApiKey: string }): string;
export function url(url: '/app/[publicApiKey]/edit/', param: { publicApiKey: string }): string;
export function url(url: '/app/[publicApiKey]/errors/', param: { publicApiKey: string }): string;
export function url(url: '/app/[publicApiKey]/symbols/', param: { publicApiKey: string }): string;
export function url(
  route: '/app/[publicApiKey]/symbols/slow/',
  param: { publicApiKey: string }
): string;
export function url(route: string, params?: Record<string, string>, prefix: string = ''): string {
  const path = route.split('/');
  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    if (segment.startsWith('[') && segment.endsWith(']')) {
      const key = segment.substring(1, segment.length - 1);
      path[i] = params ? params[prefix + key] || params[key] : '';
    }
  }
  return path.join('/');
}

type QwikLinkAlias = QwikIntrinsicElements['a'];

export function AppLink(
  props: {
    route: '/app/';
  } & QwikLinkAlias
): JSXNode;
export function AppLink(
  props: {
    route: '/app/__new__/edit/';
  } & QwikLinkAlias
): JSXNode;
export function AppLink(
  props: {
    route: '/app/[publicApiKey]/';
    'param:publicApiKey': string;
  } & QwikLinkAlias
): JSXNode;
export function AppLink(
  props: {
    route: '/app/[publicApiKey]/edit/';
    'param:publicApiKey': string;
  } & QwikLinkAlias
): JSXNode;
export function AppLink(
  props: {
    route: '/app/[publicApiKey]/errors/';
    'param:publicApiKey': string;
  } & QwikLinkAlias
): JSXNode;
export function AppLink(
  props: {
    route: '/app/[publicApiKey]/symbols/';
    'param:publicApiKey': string;
  } & QwikLinkAlias
): JSXNode;
export function AppLink(
  props: {
    route: '/app/[publicApiKey]/symbols/slow/';
    'param:publicApiKey': string;
  } & QwikLinkAlias
): JSXNode;
export function AppLink(
  props: {
    route: string;
  } & QwikLinkAlias
): JSXNode {
  return (
    <a
      href={(url as (route: string, props: any, prefix: string) => string)(
        props.route,
        props,
        'param:'
      )}
      {...omit(props, ['href'])}
    >
      {props.children}
    </a>
  );
}

function omit<T, KEYS extends keyof T>(obj: T, keys: KEYS[]): Omit<T, KEYS> {
  const omittedObj: Record<string, any> = {};
  for (const key in obj) {
    if (!key.startsWith('param:') && !keys.includes(key as any)) {
      omittedObj[key] = obj[key];
    }
  }
  return omittedObj as Omit<T, KEYS>;
}
