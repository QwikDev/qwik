/* eslint-disable no-console */
//
// This file stores example snippets which are found in the docs.
//
// Edit the snippet here and verify that it compiles, than paste
// it to the desired comment location
//

import { component$ } from './shared/component.public';
import { qrl } from './shared/qrl/qrl';
import { $, type QRL } from './shared/qrl/qrl.public';
import { useOn, useOnDocument, useOnWindow } from './use/use-on';
import { useStore } from './use/use-store.public';
import { useStyles$, useStylesScoped$ } from './use/use-styles';
import { useTask$ } from './use/use-task-dollar';
import { useVisibleTask$ } from './use/use-visible-task-dollar';
import { implicit$FirstArg } from './shared/qrl/implicit_dollar';

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// DOCS: component
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

//
// <docs anchor="component">
export interface CounterProps {
  initialValue?: number;
  step?: number;
}
export const Counter = component$((props: CounterProps) => {
  const state = useSignal(props.initialValue || 0);
  return (
    <div>
      <span>{state.value}</span>
      <button onClick$={() => (state.value += props.step || 1)}>+</button>
    </div>
  );
});
// </docs>
//

//
// <docs anchor="component-usage">
export const OtherComponent = component$(() => {
  return <Counter initialValue={100} />;
});
// </docs>
//

// <docs anchor="use-styles">
import styles from './code-block.css?inline';

export const CmpStyles = component$(() => {
  useStyles$(styles);

  return <div>Some text</div>;
});
// </docs>

// <docs anchor="use-styles-scoped">
import scoped from './code-block.css?inline';

export const CmpScopedStyles = component$(() => {
  useStylesScoped$(scoped);

  return <div>Some text</div>;
});
// </docs>

// <docs anchor="use-styles-inline">
export const CmpInline = component$(() => {
  useStyles$(`.my-button {
    font-size: 20px;
  }`);

  return <button class="my-button">Profit!</button>;
});
// </docs>

() => {
  // <docs anchor="use-on">
  function useClick() {
    useOn(
      'click',
      $((event) => {
        console.log('clicked host element', event);
      })
    );
  }

  const Cmp = component$(() => {
    useClick();
    return <div>Profit!</div>;
  });
  // </docs>
  return Cmp;
};

() => {
  // <docs anchor="use-on-document">
  function useScroll() {
    useOnDocument(
      'scroll',
      $((event) => {
        console.log('body scrolled', event);
      })
    );
  }

  const Cmp = component$(() => {
    useScroll();
    return <div>Profit!</div>;
  });
  // </docs>
  return Cmp;
};

() => {
  // <docs anchor="use-on-window">
  function useAnalytics() {
    useOnWindow(
      'popstate',
      $((event) => {
        console.log('navigation happened', event);
        // report to analytics
      })
    );
  }

  const Cmp = component$(() => {
    useAnalytics();
    return <div>Profit!</div>;
  });
  // </docs>
  return Cmp;
};

() => {
  // <docs anchor="use-task">
  const Cmp = component$(() => {
    const store = useStore({
      count: 0,
      doubleCount: 0,
      debounced: 0,
    });

    // Double count task
    useTask$(({ track }) => {
      const count = track(() => store.count);
      store.doubleCount = 2 * count;
    });

    // Debouncer task
    useTask$(({ track }) => {
      const doubleCount = track(() => store.doubleCount);
      const timer = setTimeout(() => {
        store.debounced = doubleCount;
      }, 2000);
      return () => {
        clearTimeout(timer);
      };
    });
    return (
      <div>
        <div>
          {store.count} / {store.doubleCount}
        </div>
        <div>{store.debounced}</div>
      </div>
    );
  });
  // </docs>
  return Cmp;
};

() => {
  // <docs anchor="use-resource">
  const Cmp = component$(() => {
    const cityS = useSignal('');

    const weatherResource = useResource$(async ({ track, cleanup }) => {
      const cityName = track(cityS);
      const abortController = new AbortController();
      cleanup(() => abortController.abort('cleanup'));
      const res = await fetch(`http://weatherdata.com?city=${cityName}`, {
        signal: abortController.signal,
      });
      const data = await res.json();
      return data as { temp: number };
    });

    return (
      <div>
        <input name="city" bind:value={cityS} />
        <Resource
          value={weatherResource}
          onResolved={(weather) => {
            return <div>Temperature: {weather.temp}</div>;
          }}
        />
      </div>
    );
  });
  // </docs>
  return Cmp;
};

() => {
  // <docs anchor="use-task-simple">
  const Cmp = component$(() => {
    const store = useStore({ count: 0, doubleCount: 0 });
    const signal = useSignal(0);
    useTask$(({ track }) => {
      // Any signals or stores accessed inside the task will be tracked
      const count = track(() => store.count);
      // For stores you can also pass the store and specify the property
      track(store, 'count');
      // You can also pass a signal to track() directly
      const signalCount = track(signal);
      store.doubleCount = count + signalCount;
    });
    return (
      <div>
        <span>
          {store.count} / {store.doubleCount}
        </span>
        <button
          onClick$={() => {
            store.count++;
            signal.value++;
          }}
        >
          +
        </button>
      </div>
    );
  });
  // </docs>

  return Cmp;
};

() => {
  // <docs anchor="use-store">
  const Stores = component$(() => {
    const counter = useCounter(1);

    // Reactivity happens even for nested objects and arrays
    const userData = useStore({
      name: 'Manu',
      address: {
        address: '',
        city: '',
      },
      orgs: [],
    });

    // useStore() can also accept a function to calculate the initial value
    const state = useStore(() => {
      return {
        value: expensiveInitialValue(),
      };
    });

    return (
      <div>
        <div>Counter: {counter.value}</div>
        <Child userData={userData} state={state} />
      </div>
    );
  });

  function useCounter(step: number) {
    // Multiple stores can be created in custom hooks for convenience and composability
    const counterStore = useStore({
      value: 0,
    });
    useVisibleTask$(() => {
      // Only runs in the client
      const timer = setInterval(() => {
        counterStore.value += step;
      }, 500);
      return () => {
        clearInterval(timer);
      };
    });
    return counterStore;
  }
  // </docs>

  function expensiveInitialValue() {
    return 42;
  }

  function Child(_props: any) {
    return <div />;
  }
  return Stores;
};

() => {
  // <docs anchor="use-signal">
  const Signals = component$(() => {
    const counter = useSignal(1);
    const text = useSignal('changeme');
    const toggle = useSignal(false);

    // useSignal() can also accept a function to calculate the initial value
    const state = useSignal(() => {
      return expensiveInitialValue();
    });

    return (
      <div>
        <button onClick$={() => counter.value++}>Counter: {counter.value}</button>
        {
          // pass signal values as the value, the optimizer will make it pass the signal
        }
        <Child state={state.value} />
        {
          // signals can be bound to inputs. A property named `bind:x` implies that the property is a signal
        }
        <input type="text" bind:value={text} />
        <input type="checkbox" bind:checked={toggle} />
      </div>
    );
  });
  // </docs>

  function expensiveInitialValue() {
    return 42;
  }

  function Child(_props: any) {
    return <div />;
  }
  return Signals;
};

//
// <docs anchor="context">
// Declare the Context type.
interface TodosStore {
  items: string[];
}
// Create a Context ID (no data is saved here.)
// You will use this ID to both create and retrieve the Context.
export const TodosContext = createContextId<TodosStore>('Todos');

// Example of providing context to child components.
export const App = component$(() => {
  useContextProvider(
    TodosContext,
    useStore<TodosStore>({
      items: ['Learn Qwik', 'Build Qwik app', 'Profit'],
    })
  );

  return <Items />;
});

// Example of retrieving the context provided by a parent component.
export const Items = component$(() => {
  const todos = useContext(TodosContext);
  return (
    <ul>
      {todos.items.map((item) => (
        <li>{item}</li>
      ))}
    </ul>
  );
});

// </docs>
//

// <docs anchor="qrl-usage-$">
useOnDocument(
  'mousemove',
  $((event) => console.log('mousemove', event))
);
// </docs>

// <docs anchor="qrl-usage-$-optimized">
// FILE: <current file>
useOnDocument('mousemove', qrl('./chunk-abc.js', 'onMousemove'));

// FILE: chunk-abc.js
export const onMousemove = () => console.log('mousemove');
// </docs>

// <docs anchor="qrl-usage-type">
// Example of declaring a custom functions which takes callback as QRL.
export function useMyFunction(callback: QRL<() => void>) {
  doExtraStuff();
  // The callback passed to `onDocument` requires `QRL`.
  useOnDocument('mousemove', callback);
}
// </docs>

function doExtraStuff() {
  throw new Error('Function not implemented.');
}

(async function () {
  // <docs anchor="qrl-usage-import">
  // Assume you have QRL reference to a greet function
  const lazyGreet: QRL<() => void> = $(() => console.log('Hello World!'));

  // Use `qrlImport` to load / resolve the reference.
  const greet: () => void = await lazyGreet.resolve();

  //  Invoke it
  greet();
  // </docs>
})();

// <docs anchor="qrl-capturing-rules">

import { createContextId, useContext, useContextProvider } from './use/use-context';
import { Resource } from './use/use-resource';
import { useResource$ } from './use/use-resource-dollar';
import { useSignal } from './use/use-signal';

export const greet = () => console.log('greet');
function topLevelFn() {}

function myCode() {
  const store = useStore({});
  function localFn() {}
  // Valid Examples
  $(greet); // greet is importable
  $(() => greet()); // greet is importable;
  $(() => console.log(store)); // store is serializable.

  // Compile time errors
  $(topLevelFn); // ERROR: `topLevelFn` not importable
  $(() => topLevelFn()); // ERROR: `topLevelFn` not importable

  // Runtime errors
  $(localFn); // ERROR: `localFn` fails serialization
  $(() => localFn()); // ERROR: `localFn` fails serialization
}

// </docs>

console.log(myCode);

// <docs anchor="implicit$FirstArg">
export function myApi(callback: QRL<() => void>): void {
  // ...
}

export const myApi$ = implicit$FirstArg(myApi);
// type of myApi$: (callback: () => void): void

// can be used as:
myApi$(() => console.log('callback'));

// will be transpiled to:
// FILE: <current file>
myApi(qrl('./chunk-abc.js', 'callback'));

// FILE: chunk-abc.js
export const callback = () => console.log('callback');
// </docs>
