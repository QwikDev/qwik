import { App } from "./components/app/app";
import { partytownSnippet } from "@qwik.dev/partytown/integration";

import "./global.css";

export default () => {
  return (
    <>
      <head>
        <meta charset="utf-8" />
        <title>Qwik + Partytown Blank App</title>
        <script
          dangerouslySetInnerHTML={partytownSnippet({
            fallbackTimeout: 1000,
            debug: true,
          })}
        />
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
  document.dispatchEvent(
    new Event("expensiveComputationStarted", { bubbles: true }),
  );
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
