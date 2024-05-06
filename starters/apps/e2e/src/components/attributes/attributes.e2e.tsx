import { domRender, ssrRenderToDom } from "@builder.io/qwik/testing";
import { beforeEach, describe, it } from "vitest";
import { Attributes } from "./attributes";

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])("$render.name: attributes.e2e", ({ render }) => {
  describe("<Attributes/>", () => {
    // let document: Document;
    // let vNode: VNode;
    // let container: ClientContainer;
    // let getStyles: () => Record<string, string | string[]>;

    beforeEach(async () => {
      await render(<Attributes />, { debug });
      // document = result.document;
      // vNode = result.vNode!;
      // container = result.container;
      // getStyles = result.getStyles;
    });

    it("should run 'Toggle render'", async () => {});
  });
});
