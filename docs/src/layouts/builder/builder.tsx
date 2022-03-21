import { $, component$, Host, useStyles$ } from '@builder.io/qwik';
import { useLocation } from '../../utils/useLocation';
import { Header } from '../../components/header/header';
import styles from './builder.css';

export const Builder = component$(() => {
  useStyles$(styles);
  return $(async () => {
    const loc = useLocation();
    const html = await fetchQwikBuilderContent(loc.pathname);
    return (
      <Host>
        <Header />
        {html && <main class="builder" dangerouslySetInnerHTML={html} />}
      </Host>
    );
  });
});

export const fetchQwikBuilderContent = async (url: string) => {
  const qwikUrl = new URL('https://qa.builder.io/api/v1/qwik/content-page');
  qwikUrl.searchParams.set('apiKey', 'fe30f73e01ef40558cd69a9493eba2a2'); // 889802a78f7041a0a71d2c9ee0437f5e
  qwikUrl.searchParams.set('userAttributes.urlPath', url);

  const response = (await fetch(String(qwikUrl))) as Response;
  if (response.status === 200) {
    const { html } = await response.json();
    return html;
  }
  return undefined;
};
