# Mental Model

## Overview

Qoot is a different kind of framework. Qoot stores all of the application information in the DOM/HTML rather than in Javascript heap. The result is that the applications written in Qoot can be serialized and resumed where they left off. Qoot's design decisions are governed by:

- **Serializability:** Ability of the application to be serialized into HTML at any time and resumed later. (This supports resumability and server-side-rendering.)
- **Resumability:** Ability of the application to continue where it left off when it was serialized. (This is needed to have fast application startup times independent of application size.)
- **Out-of-order component rehydration:** Ability to rehydrate components on an as-needed basis regardless of where they are in the DOM hierarchy. (This is needed to only rehydrate the components that the user is interacting with (or components that need to be updated) rather than all of the components on the page.)
- **Fine-grained lazy-loading:** Ability to only download the piece of code that is needed to achieve the current task. (Minimize the amount of code that needs to be downloaded into the browser, ensuring fast startup and responsiveness even on slow connections.)
- **Startup Performance:** Have a constant startup time regardless of the size of the application. (No matter the application's size, the startup time should be constant to ensure a consistent user experience.)

Because of the above goals, some design decisions may feel foreign compared to current generation heap-centric frameworks. However, the design decisions are necessary to achieve the above objectives, ultimately leading to blazingly fast application startup on desktop and mobile devices.

## Component & Services

Qoot applications consist of `Component`s and `Service`s.

- **Component:** Qoot applications UIs are built from a collection of Qoot `Component`s. `Component`s can communicate with each other only through `Props`, `Service`s, and by listening or emitting/broadcasting `Event`s. (see [reactivity](./REACTIVITY.md)) No other form of communication is allowed as it would go against the goals outlined above.
- **Service:** `Service`s represent application data or shared behavior between `Component`s and application backend. `Service`s do not have UI representation and need to be injected into a component to be have their data rendered. Alternatively, `Service`s can perform server communication.

A Qoot application is a graph of `Component`s and `Service`s that define data flow. Qoot framework will hydrate `Component`s/`Service`s on an as-needed basis to achieve the desired outcome. The Qoot framework must understand the data flow between `Component`s and `Service`s to know which `Component` or `Service` needs to be rehydrated and when. (Most other frameworks do not have this understanding and need to re-render the whole application on any data update resulting in too much code that must be downloaded.)

### Example

```
TodoComponent   <---------- TodoDataService
     |                           |
     +-> ItemComponent  <-----   +--> ItemDataService

```

Above is a `Component`/`Service` dependency graph of a hypothetical application. The relationships between `Component`s and `Service`s are expressed in the DOM/HTML. Depending on which object updates, Qoot understands which other `Component`s need to be rehydrated and updated as well. (Without this understanding, Qoot will have to re-render the whole application indescrimenetly.)

## Serializability of Component & Services.

`Component`s and `Service`s must be serializable so that they can be sent over HTML and resumed later. This serializability requirement is necessary to have resumable applications.

A `Component`s or `Service`s consist of:

- **`Props`:** are key value strings. `{[key:string]:string}`.
  - **`Component`:** These are just the DOM attributes of the `Component`'s host element. If the attributes change than the `Component` gets notified. These `Props` are serialized into the [host element](./HOST_ELEMENT.md).
  - **`Service`:** A `Props` in `Service`s are usually serialized into a `Key` which uniquely identifies a service instance. The `Key` is constant for the duration of the service. (For example `issue:org123:proj456:789` uniquely identifies an `Issue 789` in `org123/proj456`.)
- **`State`:** A `Component` or `Service` have a `State` which is a `JSON` serializable object. If Application is serialized than then the `State` is preserved in the DOM/HTML so that it can be quickly rehydrated on the client.
- **Transient State:** is the actual instance of the `Component` or `Service`. The instance can have a reference to any other object. However, the transient instance will not be serialized and therefore anything stored on the transient instance will have to be recomputed on rehydration.

Example:

```typescript
// Serialized into a service Key.
interface UserProps {
  id: string;
}

// Serialized into HTML/DOM as JSON.
interface User {
  fullName: string;
  age: number;
}

// Transient instance. Will be recreated on re-hydration.
class UserService extends Service<UserProps, User> {
  static $type = 'User';
  static $qrl = QRL`location_of_service_for_lazy_loading`;
  static $keyProps = ['id'];

  cookie: Cookie; // Transient property must be recomputed on rehydration
}
```

Explanation:

```typescript
// Example for retrieving a `Service`.
const userService: UserService = UserService.$hydrate(someElement, 'user:some_user_id');

/**
 * A transient `Service` instance.
 *
 * If the application gets serialized a new instance of `UserService` will be  returned.
 */
userService;

/**
 * A transient `Service` property.
 *
 * It will not be serialized and rehydrated. Service will have to recompute it.
 */
userService.cookie;

/**
 * An immutable constant `Props` of a `Service`.
 *
 * `Props` which are parsed from `Key`.
 */
expect(userService.$props).toEqual({ id: 'some_user_id' });

/**
 * A serializable state of a `Service`.
 *
 * A service state is either rehydrated from DOM/HTML or `Service` can communicate with the
 * server to look up the associated state for the `Service` `Key`.
 */
expect(userService.$state).toEqual({
  fullName: 'Joe Someone',
  age: 20,
});
```

`Component`s are similar to `Service`s except they are associated with a specific UI host-element, and `Component`'s `Props` can change over time.

## DOM Centric

A Qoot application is DOM-centric. All of the information about the application `Component`s, `Service`s, `Event`s, and service bindings are stored in the DOM as custom attributes. There is no runtime Qoot framework heap state (with the exception of caches for performance). The result is that Qoot application can easily be rehydrated because Qoot framework has no runtime information which needs to be recreated on the client.

Here are some common ways Qoot framework keeps state in DOM/HTML.

- `<some-component decl:template="qrl_to_template">`: The `::` attribute identifies a component boundary. It also points to the location where the template can be found in case of rehydration. `Component`s can be rehydrated and rendered independently of each other.
- `<div ::user="qrl_to_service">`: The `::user` attribute declares a `UserService` provider which points to the location where the `Service` can be lazy loaded from.
- `<div :user:some_user_id='{"fullName": "Joe Someone", "age": 20}'>`: A serialized form of a `UserService` with `Props: {id: 'some_user_id'}` and `State: {fullName: "Joe Someone", age: 20}`.
- `<some-component bind:user:some_user_id="$user">`: A service binding to a `Component`. This tells Qoot that if the `State` of `UserService ` with `Key`: `user:some_user_id` changes, the component `<some-component>` will need to be re-rendered.
- `<some-component on:click="qrl_to_handler">`: The `on:click` attribute notifies Qoot framework that the component is interested in the `click` events. The attribute points to the location where the click handler can be lazy-loaded from.

The benefit of the DOM centric approach is that all of the application state is already serialized in DOM/HTML. The Qoot framework itself has no additional information which it needs to store about the application.

Another important benefit is that Qoot can use `querySelectorAll` to easily determine if there are any bindings for a `Service` or if there are any listeners for a specific `Event` without having to consult any internal data structures. The DOM is Qoot's framework state.
