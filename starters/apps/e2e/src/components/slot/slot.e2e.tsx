import type {
  ClientContainer,
  VNode,
} from "packages/qwik/src/core/v2/client/types";
import {
  domRender,
  ssrRenderToDom,
} from "packages/qwik/src/core/v2/rendering.unit-util";
import { beforeEach, describe, it, expect } from "vitest";
import { SlotParent } from "./slot";
import { trigger } from "packages/qwik/src/testing/element-fixture";

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])("$render.name: slot.e2e", ({ render }) => {
  describe("<SlotParent/>", () => {
    let vNode: VNode;
    let document: Document;
    let container: ClientContainer;
    let getStyles: () => Record<string, string | string[]>;

    beforeEach(async () => {
      const result = await render(<SlotParent />, { debug });
      vNode = result.vNode!;
      document = result.document;
      container = result.container;
      getStyles = result.getStyles;
    });

    it("should run 'Toggle render'", async () => {
      await expect(document.querySelector("#isRendered")).toMatchDOM(
        <div id="isRendered" key="">
          Hi
        </div>,
      );
      await trigger(document.body, "[on-document\\:qinit]", "qinit");
      await trigger(document.body, "#btn-toggle-render", "click");
      await expect(document.querySelectorAll("#isRendered").length).toEqual(0);
      await trigger(document.body, "#btn-toggle-render", "click");
      await expect(document.querySelector("#isRendered")).toMatchDOM(
        <div id="isRendered" key="">
          Hi
        </div>,
      );
    });
  });
});
