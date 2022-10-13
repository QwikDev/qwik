import { renderToString } from 'react-dom/server';
export { createElement } from 'react';
export { renderToString } from '@builder.io/qwik/server';

export function render(App: any, props: any) {
  const html = renderToString(
      <App {...props} />
  );

  return html;
}
