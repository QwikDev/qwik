import { component$ } from '@builder.io/qwik';

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
    const data =
      getPropertyByPath(hit, `_snippetResult.${attribute ?? `hierarchy.${hit.type}`}.value`) ||
      getPropertyByPath(hit, attribute ?? `hierarchy.${hit.type}`);
    return <span {...rest} dangerouslySetInnerHTML={data} />;
  }
);
