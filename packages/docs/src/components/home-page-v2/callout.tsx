export interface Callout {
  html: string;
  nextToken?: string;
}
export const CALLOUTS: Record<string, Callout> = {
  component$: {
    nextToken: '(',
    html: `Declares component in Qwik. The <code>$</code> suffix tells 
  Qwik Optimizer to pull out the component into a seperate lazy-executed (lazy-loaded) symbol so
  that the component only gets download to the client if it is needed for re-rendering.`,
  },
  routeLoader$: {
    nextToken: '(',
    html: `Creates a <code>use____()</code> method which loads data for the route. 
  the data loading runs on the server, but the data can be used on the client. The <code>$</code> allows the
  client code to reffer to server function so that the type information can flow, without forcing the bundler
  to bundle the server code on the client.`,
  },
  onInput$: {
    html: `Listen to <code>input</code> events. The <code>$</code> allows the listener to be resumeb
  on the client. The listener is eagrely loaded in browser chache, but is broght into the application only when
  event happens.`,
  },
  server$: {
    nextToken: `(`,
    html: `Invoke the function on the server. (Similar to RPC.)`,
  },
};

export function getCallout(
  hoverText: string | null | undefined,
  nextText: string | null | undefined
): Callout | null {
  if (hoverText) {
    const callout = CALLOUTS[hoverText];
    if (callout && callout.nextToken && callout.nextToken !== nextText) {
      return null;
    }
    return callout;
  }
  return null;
}
