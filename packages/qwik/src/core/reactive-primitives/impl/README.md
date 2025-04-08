# Signals

Signals come in two types:

1. `Signal` - A storage of data
2. `ComputedSignal` - A signal which is computed from other signals.

## Why is `ComputedSignal` different?

- It needs to store a function which needs to re-run.
- It is `Readonly` because it is computed.
