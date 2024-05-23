import { App } from "./components/app/app";

import "./global.css";

export default () => {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Qwik Blank App</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <App />
      </body>
    </html>
  );
};
