# `render` sub-system

Rendering sub-system of `Qwik`. Currently, only `JSX` implementation is present, but the system is designed to support other rendering systems provided that they abide by these rules:

- Must be able to render by reusing existing DOM nodes (rather than replace existing DOM nodes).
- Must have a mechanism for rendering `Qwik` special attributes.
