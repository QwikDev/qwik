export default (props: RealMetricsOptimizationProps) => (
  <script
    dangerouslySetInnerHTML={`((d) => {
    const id = () =>  Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
    const sessionId = (sessionStorage["q:sId"] = sessionStorage["q:sId"] || id());
    const visitorId = (localStorage["q:vId"] = localStorage["q:vId"] || id());
    const qrlEvents = [];
    const logged = new Set();

    const send = (body) => { 
      fetch("https://cdn.builder.io/api/v1/track", {
        method: "POST",
        body: body,
        keepalive: true,
      });
    };

    const sendQrls = () => { 
      send(JSON.stringify({ events: qrlEvents }));
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
              sinceStart: Math.round(performance.now()),
              qsymbol: qsymbol,
            },
            ownerId: ${JSON.stringify(props.builderApiKey)},
            sessionId: sessionId,
            visitorId: visitorId
          },
        });

        if (qrlEvents.length > 9) {
          sendQrls();
        }
      }
    });

    d.addEventListener("visibilitychange", () => {
      if (d.visibilityState === "hidden" && qrlEvents.length > 0) {
        sendQrls();
      }
    });
  })(document);
`}
  />
);

interface RealMetricsOptimizationProps {
  builderApiKey: string;
}
