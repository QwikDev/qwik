import {
  destroy_component,
  detach,
  insert,
  is_function,
  mount_component,
  noop,
  SvelteComponent,
} from "svelte/internal";

export type Slots = { [key: string]: any };

function createSlotFn([ele, props = {}]) {
  if (is_function(ele) && ele.prototype instanceof SvelteComponent) {
    let component: any;

    return function () {
      return {
        c: noop,
        m(target: any, anchor: any) {
          component = new ele({ target, props });
          mount_component(component, target, anchor, null);
        },
        d(detaching: any) {
          destroy_component(component, detaching);
        },
        l: noop,
      };
    };
  } else {
    return function () {
      return {
        c: noop,
        m: function mount(target: any, anchor: any) {
          insert(target, ele, anchor);
        },
        d: function destroy(detaching: any) {
          if (detaching) {
            detach(ele);
          }
        },
        l: noop,
      };
    };
  }
}

export const createSlots = (slots: Slots) => {
  const svelteSlots: Slots = {};

  for (const slotName in slots) {
    svelteSlots[slotName] = [createSlotFn(slots[slotName])];
  }

  return svelteSlots;
};

export const getSlotContentWithoutComments = (slot: Element) => {
  return slot.innerHTML.replace(/<!--(?:.|\n)*?-->/gm, "");
};
