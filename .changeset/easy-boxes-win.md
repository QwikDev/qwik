---
'create-qwik': patch
---

fix: create-qwik logAppCreated.ts now displays correct next steps for deno.

After using the create-qwik command, the logAppCreated.ts file was not displaying the correct next steps for deno. Prior to this fix it would display "deno start" instead of "deno task start". This would cause a failure to run, as deno requires the 'task' keyword. This fixes bug 7520
