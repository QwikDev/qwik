Defines `QComponent` type definition.

`QComponent` is a type returned by the `qComponent` method and is used to verify type-safety throughout the component definition.

`QComponent` contains type information about:

- `PROPS` public interfaces for props (to be used in `<MyComponent propA ...>`)
- `STATE` private state. This will be serialized into HTML on dehydration, therefore it must be JSON serializable. (`OnRender` typically uses both `PROPS` and `STATE`.)

### Example

A simple example with no `STATE` only `PROPS`

<docs code="./q-component.docs.tsx#component"/>

The above allows one to use `Counter` like so:

<docs code="./q-component.docs.tsx#component-usage"/>

## Referring to types

Normally `QComponent` is used in the application for type-safety as is. At times it is required to refer to the types of `PROPS` and, `STATE`directly. In such a case, one can use `PropsOf` and `StateOf`.

See: `PropsOf`, `StateOf`.

@public
