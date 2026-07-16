---
'@qwik.dev/core': major
---

BREAKING: If you rerender a component with `qidle` or `qinit` handlers, those will run again. Previously they would only run when they were present while the page was first loaded.
BREAKING: qwikloader no longer support v1 containers. If you want to use v1 containers, you must add the v1 qwikloader on the page as well.
BREAKING: event handlers attributes used to be converted to `on:kebab-eventname` and `on-window:kebab-eventname`, and now they are converted to `q-e:kebab-event-name` and `q-w:kebab-event-name`. This simplifies the parsing and avoids qwikloader v1 trying to handle these events. These are undocumented internal names only, so this should not affect you.
BREAKING: QRLs used to be separated by newline characters in event handler attributes, and are now separated by `|`. This should not affect you.
FIX: `preventdefault:event` and `stoppropagation:event` now expect the event name to be in kebab-case. Note that they were already enforcing lowercase names, and DOM events are almost all lowercase, so this just allows working with custom events.
FEAT: Qwikloader now supports containers added at runtime: It will run `qinit`, `qidle` and `qvisible` events as appropriate.
