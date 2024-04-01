import {
  domRender,
  ssrRenderToDom,
} from "packages/qwik/src/core/v2/rendering.unit-util";
import { beforeEach, describe, it, expect } from "vitest";
import { trigger } from "packages/qwik/src/testing/element-fixture";
import { Attributes } from "./attributes";

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])("$render.name: attributes.e2e", ({ render }) => {
  describe("<Attributes/>", () => {
    // let vNode: VNode;
    let document: Document;
    // let container: ClientContainer;
    // let getStyles: () => Record<string, string | string[]>;

    beforeEach(async () => {
      const result = await render(<Attributes />, { debug });
      // vNode = result.vNode!;
      document = result.document;
      // container = result.container;
      // getStyles = result.getStyles;
    });

    it("should type and reflect changes", async () => {
      const input = document.querySelector("#input") as HTMLInputElement;
      const svg = document.querySelector("#svg")!;
      const inputCopy = document.querySelector(
        "#input-copy",
      ) as HTMLInputElement;
      const inputValue = document.querySelector("#input-value");
      const stuffBtn = document.querySelector("#stuff");
      const renders = document.querySelector("#renders");

      expect(inputCopy).toHaveProperty("value", "");
      input.value = "Hello";
      await trigger(document.body, input, "input");
      expect(input.getAttribute("value")).toEqual("Hello");
      expect(inputCopy.getAttribute("value")).toEqual("Hello");
      expect(inputValue?.textContent).toEqual("Hello");
      expect(renders?.textContent).toEqual("1");

      await trigger(document.body, stuffBtn, "input");

      expect(inputCopy.getAttribute("value")).toEqual("Hello");
      expect(inputValue?.textContent).toEqual("Hello");
      expect(renders?.textContent).toEqual("1");

      input.value = "ByeHello";
      await trigger(document.body, input, "input");

      expect(inputCopy.getAttribute("value")).toEqual("ByeHello");
      expect(inputValue?.textContent).toEqual("ByeHello");
      expect(renders?.textContent).toEqual("1");

      expect(svg.getAttribute("width")).toEqual("15");
      expect(svg.getAttribute("height")).toEqual("15");
      expect(svg.getAttribute("preserveAspectRatio")).toEqual("xMidYMin slice");
      expect(svg.className).toContain("is-svg");
      expect(svg.getAttribute("aria-hidden")).toEqual("true");
    });

    it("should hide all attributes", async () => {
      let input = document.querySelector("#input")!;
      let renders = document.querySelector("#renders");
      const requiredBtn = document.querySelector(
        "#required",
      ) as HTMLButtonElement;
      await trigger(document.body, requiredBtn, "click");
      const hideBtn = document.querySelector("#hide") as HTMLButtonElement;
      await trigger(document.body, hideBtn, "click");
      input = document.querySelector("#input")!;
      renders = document.querySelector("#renders");

      expect(input.getAttribute("aria-hidden")).toEqual(null);
      expect(input.getAttribute("aria-label")).toEqual(null);
      expect(input.getAttribute("tabindex")).toEqual(null);
      expect(input.getAttribute("required")).toEqual(null);
      expect(input.getAttribute("aria-required")).toEqual(null);
      expect(input.getAttribute("draggable")).toEqual(null);
      expect(input.getAttribute("spellcheck")).toEqual(null);
      expect(renders?.textContent).toEqual("2");
    });
  });
});
