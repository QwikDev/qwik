---
'@qwik.dev/core': major
---

BREAKING: (slightly) custom event handlers no longer use a `-` prefix to denote case sensitive events. Instead, write the event name in kebab-case directly. For example, the custom event `CustomEvent` should now be written as `on-Custom-Event$` instead of `on-CustomEvent$`. The handler will be called for events named `CustomEvent` but also for `-custom-event`, which should not be a problem in practice.
