import { QRL, SSRStream } from "@builder.io/qwik";
import {
    renderToString,
    generateHydrationScript
  } from "solid-js/web";

export async function renderFromServer(
    Host: any,
    solidCmp$: QRL<any>,
) {
    const Cmp = await solidCmp$.resolve()

    console.log("Will render to string")
    let html = renderToString(Cmp)
    const hydr = generateHydrationScript()
    html += hydr
    console.log("html: ", html)

    return (
        <div id="root-solid" dangerouslySetInnerHTML={html} />
    )
}
