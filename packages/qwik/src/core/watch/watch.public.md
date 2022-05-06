# API DOCS for: `on-watch.public.ts`

---

# `useWatch`

Reruns the `watchFn` when the observed inputs change.

Use `useWatch` to observe changes on a set of inputs, and then re-execute the `watchFn` when those inputs change.

The `watchFn` only executes if the observed inputs change. To observe the inputs use the `obs` function to wrap property reads. This creates subscriptions which will trigger the `watchFn` to re-run.

See: `Tracker`

@public

## Example

The `useWatch` function is used to observe the `state.count` property. Any changes to the `state.count` cause the `watchFn` to execute which in turn updates the `state.doubleCount` to the double of `state.count`.

<docs code="./watch.examples.tsx#useWatch"/>

@param watch - Function which should be re-executed when changes to the inputs are detected
@public

# `Tracker`

Used to signal to Qwik which state should be watched for changes.

The `Tracker` is passed into the `watchFn` of `useWatch`. It is intended to be used to wrap state objects in a read proxy which signals to Qwik which properties should be watched for changes. A change to any of the properties cause the `watchFn` to re-run.

## Example

The `obs` passed into the `watchFn` is used to mark `state.count` as a property of interest. Any changes to the `state.count` property will cause the `watchFn` to re-run.

<docs code="./watch.examples.tsx#useWatch"/>

See: `useWatch`

@public
