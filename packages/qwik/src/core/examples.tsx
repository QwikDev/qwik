/* eslint-disable no-console */
//
// This file stores example snippets which are found in the docs.
//
// Edit the snippet here and verify that it compiles, than paste
// it to the desired comment location
//

import { component$ } from './component/component.public';
import { qrl } from './import/qrl';
import { $, QRL } from './import/qrl.public';
import { Host } from './render/jsx/host.public';
import { useHostElement } from './use/use-host-element.public';
import {
  useCleanup$,
  useOn,
  useOnDocument,
  useOnWindow,
  useResume$,
  useVisible$,
} from './use/use-on';
import { useRef, useStore } from './use/use-store.public';
import { useStyles$ } from './use/use-styles';
import { useClientEffect$, useMount$, useServerMount$, useWatch$ } from './use/use-watch';
import { implicit$FirstArg } from './util/implicit_dollar';

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
  const state = useStore({ count: props.initialValue || 0 });
  return (
    <div>
      <span>{state.count}</span>
      <button onClick$={() => (state.count += props.step || 1)}>+</button>
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

() => {
  //
  // <docs anchor="use-cleanup">
  const Cmp = component$(() => {
    useCleanup$(() => {
      // Executed after SSR (pause) or when the component gets removed from the DOM.
      // Can be used to release resouces, abort network requets, stop timers...
      console.log('component is destroyed');
    });
    return <div>Hello world</div>;
  });
  // </docs>
  //
  return Cmp;
};

() => {
  //
  // <docs anchor="use-resume">
  const Cmp = component$(() => {
    useResume$(() => {
      // Eagerly invoked when the application resumes on the client
      console.log('called once in client');
    });
    return <div>Hello world</div>;
  });
  // </docs>
  //
  return Cmp;
};

() => {
  //
  // <docs anchor="use-visible">
  const Cmp = component$(() => {
    const store = useStore({
      isVisible: false,
    });
    useVisible$(() => {
      // Invoked once when the component is visible in the browser's viewport
      console.log('called once in client when visible');
      store.isVisible = true;
    });
    return <div>{store.isVisible}</div>;
  });
  // </docs>
  //
  return Cmp;
};

// <docs anchor="use-styles">
import styles from './code-block.css?inline';

export const CmpStyles = component$(() => {
  useStyles$(styles);

  return <Host>Some text</Host>;
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
    return <Host>Profit!</Host>;
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
    return <Host>Profit!</Host>;
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
    return <Host>Profit!</Host>;
  });
  // </docs>
  return Cmp;
};

() => {
  // <docs anchor="use-watch">
  const Cmp = component$(() => {
    const store = useStore({
      count: 0,
      doubleCount: 0,
      debounced: 0,
    });

    // Double count watch
    useWatch$((track) => {
      const count = track(store, 'count');
      store.doubleCount = 2 * count;
    });

    // Debouncer watch
    useWatch$((track) => {
      const doubleCount = track(store, 'doubleCount');
      const timer = setTimeout(() => {
        store.debounced = doubleCount;
      }, 2000);
      return () => {
        clearTimeout(timer);
      };
    });
    return (
      <Host>
        <div>
          {store.count} / {store.doubleCount}
        </div>
        <div>{store.debounced}</div>
      </Host>
    );
  });
  // </docs>
  return Cmp;
};

() => {
  // <docs anchor="use-watch-simple">
  const Cmp = component$(() => {
    const store = useStore({ count: 0, doubleCount: 0 });
    useWatch$((track) => {
      const count = track(store, 'count');
      store.doubleCount = 2 * count;
    });
    return (
      <div>
        <span>
          {store.count} / {store.doubleCount}
        </span>
        <button onClick$={() => store.count++}>+</button>
      </div>
    );
  });
  // </docs>

  return Cmp;
};

() => {
  let db: any;
  // <docs anchor="use-server-mount">
  const Cmp = component$(() => {
    const store = useStore({
      users: [],
    });

    useServerMount$(async () => {
      // This code will ONLY run once in the server, when the component is mounted
      store.users = await db.requestUsers();
    });

    return (
      <Host>
        {store.users.map((user) => (
          <User user={user} />
        ))}
      </Host>
    );
  });

  interface User {
    name: string;
  }
  function User(props: { user: User }) {
    return <div>Name: {props.user.name}</div>;
  }
  // </docs>
  return Cmp;
};

() => {
  // <docs anchor="use-mount">
  const Cmp = component$(() => {
    const store = useStore({
      temp: 0,
    });

    useMount$(async () => {
      // This code will run once whenever a component is mounted in the server, or in the client
      const res = await fetch('weather-api.example');
      const json = (await res.json()) as any;
      store.temp = json.temp;
    });

    return (
      <Host>
        <p>The temperature is: ${store.temp}</p>
      </Host>
    );
  });
  // </docs>
  return Cmp;
};

() => {
  // <docs anchor="use-client-effect">
  const Timer = component$(() => {
    const store = useStore({
      count: 0,
    });

    useClientEffect$(() => {
      // Only runs in the client
      const timer = setInterval(() => {
        store.count++;
      }, 500);
      return () => {
        clearInterval(timer);
      };
    });

    return <Host>{store.count}</Host>;
  });
  // </docs>
  return Timer;
};

() => {
  // <docs anchor="use-host-element">
  const Section = component$(
    () => {
      const hostElement = useHostElement();
      console.log(hostElement); // hostElement is a HTMLSectionElement

      return <Host>I am a section</Host>;
    },
    {
      tagName: 'section',
    }
  );
  // </docs>
  return Section;
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
      <Host>
        <div>Counter: {counter.value}</div>
        <Child userData={userData} state={state} />
      </Host>
    );
  });

  function useCounter(step: number) {
    // Multiple stores can be created in custom hooks for convenience and composability
    const counterStore = useStore({
      value: 0,
    });
    useClientEffect$(() => {
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
  // <docs anchor="use-ref">
  const Cmp = component$(() => {
    const input = useRef<HTMLInputElement>();

    useClientEffect$((track) => {
      const el = track(input, 'current')!;
      el.focus();
    });

    return (
      <Host>
        <input type="text" ref={input} />
      </Host>
    );
  });

  // </docs>

  return Cmp;
};

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
import { importedFn } from './import/example';

export const greet = () => console.log('greet');
function topLevelFn() {}

function myCode() {
  const store = useStore({});
  function localFn() {}
  // Valid Examples
  $(greet); // greet is importable
  $(importedFn); // importedFn is importable
  $(() => greet()); // greet is importable;
  $(() => importedFn()); // importedFn is importable
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
