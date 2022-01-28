[![hackmd-github-sync-badge](https://hackmd.io/pg3OWJJhRaigUsHkQYtfRQ/badge)](https://hackmd.io/pg3OWJJhRaigUsHkQYtfRQ)

## Props

Props is a mechanism by which components communicate with each other.

Imagine a situation where the parent `<MyApp>` component needs to pass information to a child's <Greeter>` component. (Here is a code example)

```typescript
import { component, qHook } from '@builder.io/qwik';

export const MyApp = component({
  onRender: qHook(() => (
    <div>
      <Greeter name="World" />
    </div>
  )),
});

export const Greeter = component<{ salutation?: string; name?: string }>({
  onRender: qHook((props) => (
    <span>
      {props.salutation || 'Hello'} <b>{props.name || 'World'}</b>
    </span>
  )),
});
```

In the above example, `<Greeter>` component declares its props to be `{ salutation?: string; name?: string }`. You can think of the props as the inputs of the component.

## Inputs must be serializable

An essential property of Qwik is that components can be rehydrated out-of-order. There are several implications:

1. All of the component's props (think inputs) must be serializable into the DOM.
2. Framework needs to track which component knows about which objects.

To perform the above responsibilities, Qwik provides `qProp` primitive.

## `qProp`

`qProp`'s job is to provide props to the component and hide all of the complexity of object serialization/deserialization and object reference tracking. The best way to think about `qProp` is as a wrapper around DOM element.

```typescript
const div = document.createElement('div');
// <div/>
const qDiv = getProps(div);

qDiv.name = 'World';
// <div name="World">

qDiv.planet = { name: 'Earth', age: '4p6bn' };
// <div name="World" planet="*abc123" q:obj="abc123">
// New object with id 'abc123' has been created

const span = document.createElement('span');
const qSpan = getProps(span);
qSpan.foo = qDiv.planet;
// <div name="World" planet="*abc123" q:obj="abc123">
// <span planet="*abc123" q:obj="abc123">
// Notice that the same object ID is used for both.
```

Usually, the framework invokes `qProp` on the developer's behalf, and there is no need to invoke the API directly in the application code. It is useful to invoke the API in tests as well as when debugging the application in DevTools to understand what is going on.
