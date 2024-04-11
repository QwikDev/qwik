import {
  domRender,
  ssrRenderToDom,
} from "packages/qwik/src/core/v2/rendering.unit-util";
import { beforeEach, describe, expect, it } from "vitest";
import { Issue3948 } from "./events";
import { trigger } from "packages/qwik/src/testing/element-fixture";
import type { ClientContainer } from "packages/qwik/src/core/v2/client/types";

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])("$render.name: events.e2e", ({ render }) => {
  describe("<Issue3948/>", () => {
    let document: Document;
    // let vNode: VNode;
    let container: ClientContainer;
    // let getStyles: () => Record<string, string | string[]>;

    beforeEach(async () => {
      const result = await render(<Issue3948 />, { debug });
      document = result.document;
      // vNode = result.vNode!;
      container = result.container;
      // getStyles = result.getStyles;
    });

    it("#3948 - should add event on window after conditional render", async () => {
      const always = document.querySelector("#issue-3948-always")!;
      const toggle = document.querySelector(
        "#issue-3948-toggle",
      ) as HTMLInputElement;
      expect(always.textContent).toEqual("always count: 0");

      await trigger(container.element, "#issue-3948-always", ":window:click");

      expect(always.textContent).toEqual("always count: 1");

      toggle.checked = true;
      await trigger(document.body, toggle, "input");

      const conditional = document.querySelector("#issue-3948-conditional");
      expect(conditional?.getAttribute("on-window:click")).not.toBe(null);
      expect(conditional?.textContent).toEqual("conditional count: 0");

      await trigger(container.element, "#issue-3948-always", ":window:click");
      await trigger(container.element, "#issue-3948-always", ":window:click");
      await trigger(
        container.element,
        "#issue-3948-conditional",
        ":window:click",
      );
      expect(always.textContent).toEqual("always count: 3");
      expect(conditional?.textContent).toEqual("conditional count: 1");

      await trigger(container.element, "#issue-3948-always", ":window:click");
      await trigger(
        container.element,
        "#issue-3948-conditional",
        ":window:click",
      );

      expect(always.textContent).toEqual("always count: 4");
      expect(conditional?.textContent).toEqual("conditional count: 2");
    });
  });
});
