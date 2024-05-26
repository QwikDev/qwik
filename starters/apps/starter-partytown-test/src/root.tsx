import { App } from "./components/app/app";
import { partytownSnippet } from "@builder.io/partytown/integration";

import "./global.css";

export default () => {
  return (
    <>
      <head>
        <meta charset="utf-8" />
        <title>Qwik + Partytown Blank App</title>
        <script dangerouslySetInnerHTML={partytownSnippet({ debug: true })} />
      </head>
      <body>
        <App />
        <script
          type="text/partytown"
          dangerouslySetInnerHTML={`(${partyTownExampleWhichBlocksMainThreadForOneSecond.toString()})()`}
        ></script>
      </body>
    </>
  );
};

function partyTownExampleWhichBlocksMainThreadForOneSecond() {
  // Block execution for 1 second.
  const start = new Date().getTime();
  // eslint-disable-next-line no-console
  console.log("Expensive computation started at:", start);
  let end = 0;
  while (end < start + 500) {
    end = new Date().getTime();
  }
  // eslint-disable-next-line no-console
  console.log("Expensive computation ended at:", end);
  document.dispatchEvent(
    new Event("expensiveComputationDone", { bubbles: true }),
  );
}
