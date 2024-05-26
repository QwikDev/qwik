import { QwikCityProvider, RouterOutlet } from "@builder.io/qwik-city";
import { SomeProvider } from "./components/provider/provider";
import { RouterHead } from "./components/router-head/router-head";
import "./global.css";

export default function Root() {
  return (
    <SomeProvider>
      <QwikCityProvider>
        <head>
          <meta charset="utf-8" />
          <RouterHead />
        </head>
        <body>
          <RouterOutlet />
        </body>
      </QwikCityProvider>
    </SomeProvider>
  );
}
