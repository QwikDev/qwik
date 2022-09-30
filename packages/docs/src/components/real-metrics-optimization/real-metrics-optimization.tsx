export default (props: RealMetricsOptimizationProps) => (
  <script
    dangerouslySetInnerHTML={`((d) => {
    const id = () =>  Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
    const qrlEvents = [];
    const logged = new Set();

    const send = () => { 
      fetch("https://cdn.builder.io/api/v1/track", {
        method: "POST",
        body: JSON.stringify({
          events: qrlEvents,
        }),
        keepalive: true,
      });
      qrlEvents.length = 0;
    };

    d.addEventListener("qsymbol", (ev) => {
      const qsymbol = ev.detail?.symbol;
      if (qsymbol && !logged.has(qsymbol)) {
        logged.add(qsymbol);
        console.debug("QSymbol", qsymbol);

        qrlEvents.push({
          type: "qrl",
          data: {
            metadata: {
              url: location.href,
              timestamp: Date.now(),
              sinceStart: performance.now(),
              qsymbol: qsymbol,
            },
            ownerId: ${JSON.stringify(props.builderApiKey)},
            sessionId: (sessionStorage["q:sId"] = sessionStorage["q:sId"] || id()),
            visitorId: (localStorage["q:vId"] = localStorage["q:vId"] || id()),
          },
        });

        if (qrlEvents.length > 9) {
          send();
        }
      }
    });

    d.addEventListener("visibilitychange", () => {
      if (d.visibilityState === "hidden" && qrlEvents.length > 0) {
        send();
      }
    });
  })(document);
`}
  />
);

interface RealMetricsOptimizationProps {
  builderApiKey: string;
}
