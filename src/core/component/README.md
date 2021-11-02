# Qwik Components

[![hackmd-github-sync-badge](https://hackmd.io/j2qKEw3zTM26a7iq5vkdZQ/badge)](https://hackmd.io/j2qKEw3zTM26a7iq5vkdZQ)

A collection of Qwik Components in a tree structure make up a Qwik application.
The unique feature of Qwik Components is that they can be:

1. Server-side pre-rendered:
1. The state of the Qwik Component serializes into the DOM attributes:
1. Qwik Components can rehydrate on the client out of order:
1. Qwik Components lazy load their behavioral handlers:
1. Qwik Components declare listeners (both event and broadcasts) declaratively:

## SSR

Qwik's goal is to have extremely fast startup times. Qwik achieves this by minimizing the amount of code the client needs to load and execute. This is done through:

1. Server-side rendering: The server can pre-render the application. Most of the application UI never changes and so there is no need to bring the code to the client.
1. Fine-grained lazy loading: Only download code which needs to be executed now. If the application contains a button that is rarely clicked, then the code for the handler should not be downloaded unless the user interacts with the button.

### Resumable vs Replayable Applications

Most frameworks create replayable applications. By replayable, we mean that once the server renders the page, the client must re-run the whole application to get the client memory-heap into a state to be ready to interact with the users. Examples are: setting up listeners, subscribers, closures, and entity objects. The more complicated the page, the more complex the amount of code the client has to replay in order to get the client memory-heap into the right state.

In contrast, Qwik aims to be resumable. A resumable application can always be serialized and send across the wire. On the client-side, there is no need to replay any of the SSR code on the client. The application has all of the relevant information serialized in HTML in a form such that the client can resume where it left off. For example, once the chrome of the application is rendered there is no need ever to execute that code if the chrome is static.

## Out of order re-hydration

Another important goal is to be able to rehydrate and re-render components out of order. Assume you have:

```html
<AppChrome>
  <MainPage user="{person}">
    <Counter value="{value}" />
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

Qwik solves this by having a declarative way of setting up listeners. The listeners only specify where the code lives (import url.) Unless the event fires, the listener never loads the code. The result is that Qwik only loads code when it is strictly necessary and thus delays most of the work until later. This leads to fast startup time because only very little code needs to be downloaded, and even less needs to be executed.
