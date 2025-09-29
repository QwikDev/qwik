/**
 * @file
 *
 *   This file contains well documented tests so that you can familiarize yourself with:
 *
 *   - How to write tests
 *   - How to run tests
 *   - How to debug tests
 *   - How v2 serialization works
 *
 *   Start by understanding this test before moving on to other tests and contributing to the system.
 *
 *   ## `inlinedQrl`
 *
 *   Normally qwik applications run with optimizer which replace `$()` into `qrl()` calls. The
 *   optimizer does not run in the unite test environment, for this reason it is sometimes necessary
 *   to use `inlinedQrl` which allows us to write tests without the optimizer, and give us full
 *   control on the name of the symbol so that it is better to understand what is going on under the
 *   hood.
 *
 *   If you prefer watching a video "tutorial", we went over some of those concerns in one of the
 *   office hours:
 *   https://around.co/playback/370fe7fd-46f6-4768-a016-95e92e6ce521?sharedKey=dd856234-7619-4974-902b-f8be743249d7
 */

import { domRender, ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$, componentQrl } from '../shared/component.public';
import { inlinedQrl } from '../shared/qrl/qrl';
import {
  Fragment as Component,
  Fragment,
  Fragment as Projection,
  Fragment as SignalTarget,
} from '../shared/jsx/jsx-runtime';
import { Slot } from '../shared/jsx/slot.public';
import { useSignal } from '../use/use-signal';

// To better understand what is going on in the test, set DEBUG to true and run the test.
const DEBUG = false;

function log(...args: any[]) {
  // eslint-disable-next-line no-console
  DEBUG && console.log(...args);
}

/// Qwik apps can run in two modes:

describe.each([
  { render: ssrRenderToDom }, // SSR - which than resumes on the client (this simulate the SSR to CSR hand off.)
  { render: domRender }, // CSR - everything renders on the client.
])('$render.name: contributing', ({ render }) => {
  /**
   * This test demonstrates basic rendering of component. Here are the key learnings:
   *
   * ## `q:vnodeData`
   *
   * VnodeData is additional information placed on HTML which allows Qwik to recover the
   * VirtualVNode information such as `<Component>`, `<Fragment>`, Signal locations etc... raw
   * HTML/DOM is hard to read and so all of the test assertion and display output in the VNode space
   * to make it easier to understand what is going on.
   *
   * ## `<Component q:seq q:props q:renderFn>`
   *
   * A key to resumability is that Qwik needs to be able to recover all information about component.
   * This is done by placing additional information on the component. If the value of the property
   * is a number than it points into `SERIALIZED STATE` described later.
   *
   * - Properties starting with `q:` are reserved for Qwik.
   *
   *   - `q:renderFn` - QRL pointing to the render function of the component.
   *   - `q:props` - Serialized props of the component.
   *   - `q:seq` - Sequence number of the component: This is used to recover hook values.
   * - Properties starting with `:` are local values which don't get serialized and get reset on each
   *   component invocation
   *
   *   - `:seqIdx` - Sequence index of hook currently being processed. See `q:seq` for related
   *       information.
   * - Reminder of properties are used for projection:
   *
   *   - `` - Default projection portal
   *   - `<name>` - Named projection portal
   *   - `:` - Special key pointing to the parent component where the projection was declared.
   *
   * ## `SERIALIZED STATE`
   *
   * Serialized state is an array of values which are serialized and placed in the container. The
   * output color codes special reference values such as QRLs, Signals, Tasks, circular references
   * etc...
   *
   * ## VNode references
   *
   * Often times it is necessary to refer to a specific VNode. This is done by using this encoding
   * mechanism:
   *
   * - `<number>` - `3` - Third depth first element in the output HTML.
   * - `<number><character>` - `3A` - First find `3` than find the first virtual child of `3`. (First
   *   because `A` is the first letter of the alphabet.)
   * - `<number><character><character>` - `3AB`
   *
   *   - First find `3`
   *   - Than find the first virtual child of `3`. (First because `A` is the first letter of the
   *       alphabet.)
   *   - Than find the second virtual child of `3A`. (Second because `B` is the second letter of the
   *       alphabet.)
   *
   * Example:
   *
   * ```
   * <html q:id="0">
   *   </head>
   *   <body q:vnodeData="..." q:id="1">
   *     <Component q:id="1A">
   *       <Fragment q:id="1AA">
   *         <button q:id="2"> "123" <- q:id="2A" </button>
   *       </Fragment>
   *     </Component>
   *     <Component q:id="1B">
   *       <Fragment q:id="1BA"/>
   *       <Fragment q:id="1BB"/>
   *     </Component>
   *   </body>
   * </html>
   * ```
   */
  it('basic counter', async () => {
    /// Declare a component which renders a counter.
    const Counter = component$((props: { initialCount: number }) => {
      const count = useSignal(props.initialCount);
      log('Counter', count.value);
      return (
        <button
          onClick$={() => {
            log('Counter:click');
            count.value++;
          }}
        >
          {count.value}
        </button>
      );
    });
    // Render the output of the component.
    const { vNode, document } = await render(<Counter initialCount={123} />, { debug: DEBUG });
    // Perform an action
    await trigger(document.body, 'button', 'click');
    // Assert correct output
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <SignalTarget ssr-required>124</SignalTarget>
        </button>
      </Component>
    );
  });

  /**
   * This example demonstrates how the projection portals work and serialize.
   *
   * See the SSR output and look for where different parts of the projection are serialized into to
   * get an understanding of how the projection works.
   */
  it('projection serialization example', async () => {
    const Child = componentQrl(
      inlinedQrl(() => {
        return (
          <div>
            <Slot q:slot="my-slot">
              <i>child-default-value</i>
            </Slot>
          </div>
        );
      }, 's_Child')
    );
    const Parent = componentQrl(
      inlinedQrl(() => {
        return (
          <Child>
            <span q:slot="my-slot">
              <b>parent-projection-value</b>
            </span>
          </Child>
        );
      }, 's_Parent')
    );
    const { vNode } = await render(<Parent />, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <div>
            <Projection>
              <i>child-default-value</i>
            </Projection>
          </div>
        </Component>
      </Component>
    );
    if (render === ssrRenderToDom) {
      // We can only assert this is SSR, as CSR does just keeps unused nodes in memory. (No need to write them to DOM)
      expect(vNode!.nextSibling).toMatchVDOM(
        <q:template hidden aria-hidden="true">
          <Fragment>
            <span q:slot="my-slot">
              <b>parent-projection-value</b>
            </span>
          </Fragment>
        </q:template>
      );
    }
  });
});
