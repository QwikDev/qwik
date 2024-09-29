import { domRender, ssrRenderToDom, trigger } from "@qwik.dev/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { RefRoot } from "./ref";

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])("$render.name: ref.e2e", ({ render }) => {
  describe("<RefRoot/>", () => {
    let document: Document;
    // let vNode: VNode;
    // let container: ClientContainer;
    // let getStyles: () => Record<string, string | string[]>;

    beforeEach(async () => {
      const result = await render(<RefRoot />, { debug });
      document = result.document;
      // vNode = result.vNode!;
      // container = result.container;
      // getStyles = result.getStyles;
    });

    it("should render correctly", async () => {
      const staticEl = document.querySelector("#static");
      const dynamicEl = document.querySelector("#dynamic");
      const static2El = document.querySelector("#static-2");
      const dynamic2El = document.querySelector("#dynamic-2");
      const static3El = document.querySelector("#static-3");
      const dynamic3El = document.querySelector("#dynamic-3");

      if (render === ssrRenderToDom) {
        await trigger(document.body, "#parent", "qvisible");
        await trigger(document.body, staticEl, "qvisible");
        await trigger(document.body, static2El, "qvisible");
        await trigger(document.body, static3El, "qvisible");
      }

      expect(staticEl?.textContent).toEqual("Rendered static");
      expect(dynamicEl?.textContent).toEqual("Rendered dynamic");
      expect(static2El?.textContent).toEqual("Rendered static-2");
      expect(dynamic2El?.textContent).toEqual("Rendered dynamic-2");
      expect(static3El?.textContent).toEqual("Rendered static-3");
      expect(dynamic3El?.textContent).toEqual("Rendered dynamic-3");
    });
  });
});
