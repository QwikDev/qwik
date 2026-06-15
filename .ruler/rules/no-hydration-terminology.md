# No Hydration Terminology Rule

Never describe Qwik or any part of how Qwik works as hydration. Qwik does not hydrate. Qwik is
resumable: the server serializes application state and listeners into the HTML, and the client
resumes execution exactly where the server left off, without re-running component code or
rebuilding the framework state.

## Why This Rule Exists

Generated documentation has repeatedly described Qwik using hydration terminology. This is
factually wrong and undermines Qwik's core value proposition. Hydration means re-executing
component code on the client to reconstruct framework state that the server already had.
Qwik's entire design exists to avoid that work.

## When Writing Documentation

- Do not call any Qwik mechanism "hydration", "hydrating", "rehydration", "partial hydration",
  "progressive hydration", "selective hydration", or "island hydration".
- Do not describe Qwik components, containers, or apps as "hydrated" or "needing to hydrate".
- Use the correct terms instead: "resumability", "resume", "resuming", "serialization",
  "deserialization", and "lazy execution".
- Describe client startup as Qwik resuming from serialized state, not as Qwik booting, mounting,
  or hydrating the app.

## Allowed Mentions

The word "hydration" may appear only when explicitly contrasting Qwik with hydration-based
frameworks, and the sentence must make clear that hydration is what other frameworks do and what
Qwik avoids. For example: "Unlike frameworks that hydrate on the client, Qwik resumes from
serialized state." Never use hydration vocabulary, even casually or by analogy, to explain what
Qwik itself does.
