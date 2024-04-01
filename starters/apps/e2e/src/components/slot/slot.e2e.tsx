import {
  domRender,
  ssrRenderToDom,
} from "packages/qwik/src/core/v2/rendering.unit-util";
import { beforeEach, describe, it, expect } from "vitest";
import { Issue5506, SlotParent } from "./slot";
import { trigger } from "packages/qwik/src/testing/element-fixture";
import {
  Fragment as Component,
  Fragment as Projection,
  Fragment,
} from "@builder.io/qwik/jsx-runtime";

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])("$render.name: slot.e2e", ({ render }) => {
  describe("<SlotParent/>", () => {
    let document: Document;
    // let vNode: VNode;
    // let container: ClientContainer;
    // let getStyles: () => Record<string, string | string[]>;

    beforeEach(async () => {
      const result = await render(<SlotParent />, { debug });
      document = result.document;
      // vNode = result.vNode!;
      // container = result.container;
      // getStyles = result.getStyles;
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

  describe("regression", () => {
    it("#5506", async ({ expect }) => {
      const { document, vNode } = await render(<Issue5506 />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <div key="QT_89" id="issue-5506-div">
            <Component>
              <Projection>
                <Component>
                  <Fragment>
                    <label>
                      <input
                        checked
                        type="checkbox"
                        preventdefault:click
                        id="input-5506"
                      />
                      {"toggle me"}
                    </label>
                  </Fragment>
                </Component>
                <br></br>
                <button>{"Rerender on client"}</button>
              </Projection>
            </Component>
          </div>
        </Component>,
      );
      const initialInput = document.querySelector(
        "#input-5506",
      ) as HTMLInputElement;
      await expect(document.querySelector("#input-5506")).toMatchDOM(
        <input id="input-5506" type="checkbox" checked />,
      );
      expect(initialInput.checked).toBe(true);
      await trigger(document.body, "input#input-5506", "click");
      const updatedInput = document.querySelector(
        "#input-5506",
      ) as HTMLInputElement;
      expect(updatedInput.checked).toBe(false);
      await expect(document.querySelector("#input-5506")).toMatchDOM(
        <input id="input-5506" type="checkbox" checked={false} />,
      );
      expect(updatedInput.checked).toBe(false);
      expect(initialInput).toBe(updatedInput); // Ensure we did not destroy the input
    });
  });
});
