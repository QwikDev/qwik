# Qwik Components

A collection of Qwik Components in a tree structure make up a Qwik application.
The unique feature of Qwik Components is that they can be:

1. Server-side pre-rendered:
1. The state of the Qwik Component serializes into the DOM attributes:
1. Qwik Components can rehydrate on the client out of order:
1. Qwik Components lazy load their behavioral handlers:
1. Qwik Components declare listeners (both event and broadcasts) declaratively

## SSR

Qwik's goal is to have extremely fast startup times. Qwik achieves this by minimizing the amount of code the client needs to load and execute. This is done through:

1. Server-side rendering: The server can pre-render the application. Most of the application UI never changes and so there is no need to bring the code to the client.
1. Fine-grained lazy loading: Only download code which needs to be executed now. If the application contains a button that is rarely clicked, then the code for the handler should not be downloaded unless the user interacts with the button.

### Resumable vs Replayable Applications

Most frameworks create replayable applications. By replayable, we mean that once the server renders the page, the client must re-run the whole application to get the client memory-heap into a state to be ready to interact with the users. Examples are: setting up listeners, subscribers, closures, and entity objects. The more complicated the page, the more complex the amount of code the client has to replay in order to get the client memory-heap into the right state.

In contrast, Qwik aims to be resumable. A resumable application can always be serialized and send across the wire. On the client-side, there is no need to replay any of the SSR code on the client. The application has all of the relevant information serialized in HTML in a form such that the client can resume where it left off. For example, once the chrome of the application is rendered there is no need ever to execute that code if the chrome is static.

## Out of order re-hydration

Another important goal is to be able to rehydrate and re-render components out of order. Assume you have:

```
<AppChrome>
  <MainPage user={person}>
    <Counter value={value}/>
  </MainPage>
</AppChrome>
```

In the above example, assume the user interacts with the `<Counter>` If the state of `<Counter>` does not affect the components above it, then only `<Counter>` should be re-rendered. In the case of a leaf such as `<Counter>`, this would be relatively straight-forward because in our example, `<Counter>` is a leaf. But what if user interaction causes the `person` to change, which causes `<MainPage>` to be re-rendered. In such a case, the rendering system needs to understand that once `<MainPage>` is re-render, it should not be decent and render `<Counter>`. Descending into `<Counter>` would be inefficient because it would require downloading and executing un-needed code. However, even if the renderer can stop the rendering at the `<Counter>` boundary, the `<Counter>` code will still be pulled in because `<MainPage>` refers to `<Counter>` as a symbolic reference. It is important to be able to break the symbolic reference to download the minimal amount of code.

In-order-hydration would be if one would start at a component and render everything below it. An out-of-order-re-hydration means that re-rendering can start at any component, and it only affects that component. In our example, it is necessary to break the symbolic reference between components so that each component can be loaded and rendered independently from any other (parent or child.)

## State

A component store state. There are three different kinds of states which Qwik recognizes:

1. **Private State**: A private state of the component is a state which only matters to the component. For example, in case of a collapsible UI element, whether or not the element is collapsed is private state of the component. (A component can choose to expose its private state, but that is beyond the scope of this discussion.)
1. **Shared State**: A shared state is information that can be part of more than one component. Typically this is information that needs to be persisted on the server. Because it is shared between components it can't be serialized within each components because doing so would lead to duplication. An example would be a to-do item in a task tracking application.
1. **Transient State**: Any other state which is useful for component but which will not be serialized. (Component will have to re-computer that state if needed.) For examples entities are transient. They can be lazily created, and they can't be serialized. (A configuration for the entity may be serializable.)

## Listeners

In traditional applications, listeners are problematic because they cause a lot of code to be downloaded even if the user never interacts with that listener. For example, a shopping checkout code may be very complex, but clicking on the purchase button is rare. A replayable application must set up a listener on the purchase button. The listener, in turn, needs a reference to the purchase entity. All of these objects need to be created and wired into the listener on application startup. This causes a lot of code to be downloaded which may never be executed.

Qwik solves this by having a declarative way of setting up listeners. The listeners only specify where the code lives (import.) Unless the event fires, the listener never loads the code. The result is that Qwik only loads code when it is strictly necessary and thus delays most of the work until later. This leads to fast startup time because only very little code needs to be downloaded, and even less needs to be executed.

# Declaring Components

Declaring component requires breaking up the component into a public declaration and private implementation details. (`Greeter` component will be used as an example.)

## Public declarations:

Create a public file: `<COMPONENT>.ts` (`greeter.ts`): A facade to be included by parent components to refer to this component without pulling in all of the implementation details of the component. The file will contain declaration for **Props**, and **Facade**:

- **Props**: Declares the components public properties / inputs.
  ```typescript
  export interface <COMPONENT>Props {
    <propertyName>: string; // all inputs must be primitives
                            // (serialization requirement)
  }
  ```
  Example:
  ```typescript
  export interface GreeterProps {
    salutation: string;
    name: string;
  }
  ```
- **Facade**: A light-weight type-safe facade that encapsulates the lazy loading nature of the component.

  ```typescript
  export const <COMPONENT> = jsxDeclareComponent<<COMPONENT>Props>(
    // Name of the DOM host element which will be created for this component.
    '<COMPONENT>',
    /// non-symbolic pointer to the implementation used for lazy loading.
    /// (As a convention, the template file ends with `_template`.)
    QRL`./<COMPONENT>_template`);
  ```

  Example:

  ```typescript
  export const Greeter = jsxDeclareComponent<GreeterProps>(QRL`./Greet_template`, 'greeter');
  ```

Putting it all together:

File: `greeter.ts`

```typescript
export interface GreeterProps {
  salutation: string;
  name: string;
}
export const Greeter = jsxDeclareComponent<GreeterProps>(QRL`./Greet_template`, 'greeter');
```

The result of the above code is that it can be used like so in JSX:

```typescript
// Any file can import the facade
import { Greeter } from './greeter.js';

// Once imported the `Greeter` can be used in any JSX without having to think
// about the lazy loading nature of the implementation.
function myTemplate() {
  return (
    <div>
      <Greeter salutation="Hello" name="World" />
    </div>
  );
}
```

## Private Implementation:

The private implementation consists of at a minimum of 1) one file representing the private component implementation, 2) one file representing the component template, and 3) zero or more files containing event handlers. (In theory, all of these can be merged into a single file at the expense of more course lazy loading.)

- **Component**: A private implementation of the component (and its transient state). This consists of the declaration of the component state as well as the components implementation. As a convention the file is named `<COMPONENT>_component.ts` (`greet_component.ts`.)

  ```typescript
  import {<COMPONENT>} from './<COMPONENT>.js';
  import {Component} from './qwik.js';

  export <COMPONENT>State {
    // Serializable state of the component.
  }

  export class <COMPONENT>Component extends Component<G<COMPONENT>State, <COMPONENT>Props> {
    // private implementation goes here
  }
  ```

  Example:

  ```typescript
  import { GreeterProps } from './Greeter.js';
  import { Component } from './qwik.js';

  export interface GreeterState {
    name: string;
  }

  export class GreeterComponent extends Component<GreeterProps, GreeterState> {
    // See Component Lifecycle Methods for explanation
    $newState(props: GreeterProps): GreeterState {
      return { name: props.name };
    }
  }
  ```

- **Template**: A file declaring the components view template. This file is usually named `<COMPONENT>_template.tsx` (`greeter_template.tsx`) by convention. The important part is that the [`QRL`](..//import#QRL) from public facade `<COMPONENT>.ts` (`greeter.ts`) points to this file.

  ```typescript
  import { <COMPONENT>Component } from './<COMPONENT>_component.js';
  import { inject } from './qwik.js';

  // See: Component Injection for more details
  export default inject(<COMPONENT>Component, function (this:<COMPONENT>Component) {
    return <>component template here</>;
  });
  ```

  Example:

  ```typescript
  import { GreeterComponent } from './greeter_component.js';
  import { inject } from './qwik.js';

  export default inject(GreeterComponent, function (this: GreeterComponent) {
    return (
      <span on:click="./greeter_onclick">
        {this.$keyProps.greeting} {this.$state.name}!
      </span>
    );
  });
  ```

- **Handler**: Handlers are optional, but most components will have one or more. Handlers are responsible for processing events. By convention, the handlers are named `<COMPONENT>_<WHAT>_on<EVENT>.ts` (`greet_text_onClick.ts`)

  ```typescript
  import { inject } from './qwik.js';
  import { <COMPONENT>Component } from './<COMPONENT>_component.js';

  export default inject(<COMPONENT>Component, function (this: <COMPONENT>Component) {
    // handler code here.
  });
  ```

  Typically when only one handler is placed per file, it is exported as `default`. It is possible to put multiple handlers into a single file (at the expense of fine-grained lazy lading) and have them named. See [`QRL`](..//import#QRL) for details.

  Example:

  ```typescript
  import { inject, markDirty, provideQrlExp } from './qwik.js';
  import { GreeterComponent } from './greeter_component.js';

  export default inject(GreeterComponent, function (this: GreeterComponent, name: string) {
    alert(this.$keyProps.salutation + ' ' + this.$keyProps.name + '!');
  });
  ```

When a component is implemented, the resulting files are:

```
greeter.ts                  // Public facade
greeter_component.ts        // Transient component instance
greeter_template.ts         // Template on how to render the component.
greeter_text_onClick.ts     // Event handler.
```

NOTE: In this example, we went to the extreme and broke up the component into as many files as possible to get the finest lazy loading possible. It is possible to merge all of the `greeter_*.ts` files into fewer files at the expense of courser lazy loading. We leave that up to the discretion of the developer.

# Component Lifecycle methods

Components can have lifecycle hooks that get called at a specific point of execution.

### `$newState(props: P): void`

Invoked when the component is instantiated, and no serialized state is found in DOM. When components are serialized their state is written into DOM like so:

```html
<greeter name="World" :="./greeter_template" :.='{"name":"World"}'> </greeter>
```

Notice the presence of JSON in `:.` attribute, which contains the component state serialized as JSON.

When the component is rehydrated the transient component instance needs to get a private state from `:.`. If this is the first-time render, there is no state to dehydrate from, in such a case, the component calls `$newState()` to create a brand new state.

```typescript
export class GreeterComponent extends Component<GreeterProps, GreeterState> {
  $newState(props: GreeterProps): GreeterState {
    return { name: props.name };
  }
}
```

# Component Injection

For general discussion of injection, see [Injection](../injection).

Injecting entities into components is done through the constructor. The injection system needs a list of tokens that need to be injected into the constructor. The injection list is stored on the static `$inject` property. To ensure that the injection list matches the constructor arguments, `provideComponent()` is used to verify that the injection list and the component constructor matches.

```typescript
export class GreeterComponent extends Component<GreeterProps, GreeterState> {
  // Declare constructor dependencies in static `$inject` property
  // `provideComponent` verifies that the items injected match constructor arguments.
  static $inject = provideComponent(SomeEntity, GreeterComponent);
  constructor(private entity: SomeEntity) {}
}
```
