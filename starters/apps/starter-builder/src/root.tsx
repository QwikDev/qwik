import { App } from './components/app/app';

export const Root = () => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Qwik Builder App</title>
      </head>
      <body>
        <App />
        <script>({fetchQwikBuilderContent.toString()})();</script>
      </body>
    </html>
  );
};

const fetchQwikBuilderContent = async () => {
  const qwikUrl = new URL('https://qa.builder.io/api/v1/qwik/page');
  // Demo API key for demonstration only. Please replace with your key
  qwikUrl.searchParams.set('apiKey', '5b8073f890b043be81574f96cfd1250b');
  qwikUrl.searchParams.set('userAttributes.urlPath', location.pathname);

  const response = await fetch(String(qwikUrl));
  const { html } = await response.json();
  document.querySelector('#builder-content')!.innerHTML = html;
};
