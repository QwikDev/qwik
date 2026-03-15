import { component$ } from '@qwik.dev/core';

export function getPropertyByPath(object: Record<string, any>, path: string): any {
  const parts = path.split('.');

  return parts.reduce((prev, current) => {
    if (prev?.[current]) {
      return prev[current];
    }
    return null;
  }, object);
}

interface SnippetProps<TItem> {
  hit: TItem;
  attribute?: string;
  tagName?: string;
  [prop: string]: unknown;
}

export const Snippet = component$(
  ({ hit, attribute, tagName = 'span', ...rest }: SnippetProps<any>) => {
    let data =
      getPropertyByPath(hit, `_snippetResult.${attribute ?? `hierarchy.${hit.type}`}.value`) ||
      getPropertyByPath(hit, attribute ?? `hierarchy.${hit.type}`) ||
      getPropertyByPath(hit, 'hierarchy.lvl0') + ' ' + getPropertyByPath(hit, 'hierarchy.lvl2');

    const cleanedData = data.replace('<mark>', '').replace('</mark>', '').toLowerCase();
    if (cleanedData === 'runtime-less') {
      const paths = hit.url.split('/');
      paths.pop();
      data = `example: ${paths.pop()}`;
    }

    return <span {...rest} dangerouslySetInnerHTML={data} />;
  }
);
