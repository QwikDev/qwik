# API DOCS for: `use-*.public.ts`

---

# `useEvent`

Retrieves the current event which triggered the action.

NOTE: The `useEvent` method can only be used in the synchronous portion of the callback (before any `await` statements.)

@public

# `useHostElement`

Retrieves the Host Element of the current component.

NOTE: `useHostElement` method can only be used in the synchronous portion of the callback (before any `await` statements.)

@public

# `useLexicalScope`

Used by the Qwik Optimizer to restore the lexical scoped variables.

This method should not be present in the application source code.

NOTE: `useLexicalScope` method can only be used in the synchronous portion of the callback (before any `await` statements.)

@public

# `useStore`

Creates a object that Qwik can track across serializations.

Use `useStore` to create state for your application. The return object is a proxy which has a unique ID. The ID of the object is used in the `QRL`s to refer to the store.

## Example

Example showing how `useStore` is used in Counter example to keep track of count.

<docs code="./use-store.examples.tsx#useStore"/>

@public

# `useTransient`

@public
