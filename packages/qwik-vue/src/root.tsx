import { VueComponent } from './examples/app';

export const Root = () => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Qwik Blank App</title>
        <style>
          {`
            box {
              display: block;
              width: 200px;
              height: 200px;
              margin-bottom: 20px;
              background: blue;
            }
          `}
        </style>
      </head>

      <body>
        <box />
        <box />
        <box />
        <box />
        <box />
        <box />
        <box />
        <box />
        <box />
        <box />
        <box />
        <VueComponent client:visible label="hello">
          Slot content
        </VueComponent>
      </body>
    </html>
  );
};
