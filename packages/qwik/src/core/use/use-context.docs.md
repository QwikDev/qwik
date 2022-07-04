# `Context`

Context is a typesafe ID for your context.

Context is a way to pass stores to the child components without prop-drilling.

Use `createContext()` to create a `Context`. `Context` is just a serializable identifier for the context. It is not the context value itself. See `useContextProvider()` and `useContext()` for the values. Qwik needs a serializable ID for the context so that the it can track context providers and consumers in a way that survives resumability.

## Example

<docs code="./use-context.example.tsx#context"/>
@alpha

# `createContext`

Create a context ID to be used in your application.

Context is a way to pass stores to the child components without prop-drilling.

Use `createContext()` to create a `Context`. `Context` is just a serializable identifier for the context. It is not the context value itself. See `useContextProvider()` and `useContext()` for the values. Qwik needs a serializable ID for the context so that the it can track context providers and consumers in a way that survives resumability.

## Example

<docs code="./use-context.example.tsx#context"/>
@param name - The name of the context.
@alpha

# `useContextProvider`

Assign a value to a Context.

Use `useContextProvider()` to assign a value to a context. The assignment happens in the component's function. Once assign use `useContext()` in any child component to retrieve the value.

Context is a way to pass stores to the child components without prop-drilling.

## Example

<docs code="./use-context.example.tsx#context"/>
@param context - The context to assign a value to.
@param value - The value to assign to the context.
@alpha

# `useContext`

Retrive Context value.

Use `useContext()` to retrieve the value of context in a component. To retrieve a value a parent component needs to invoke `useContextProvider()` to assign a value.

## Example

<docs code="./use-context.example.tsx#context"/>
@param context - The context to retrieve a value from.
@alpha
