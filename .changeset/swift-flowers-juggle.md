---
'@qwik.dev/core': patch
---

feat: updated scoped styles prefix to ⚡️

# Scoped styles prefix update

We've updated the `ComponentStylesPrefixContent` from the star symbol (⭐️) to the lightning bolt symbol (⚡️). This prefix is used internally to generate unique CSS class names for components, helping to prevent style collisions.

**Potential Compatibility Issue (Rare):**

While this change is expected to be seamless for the vast majority of users, there's a _very small_ possibility of a conflict if your application _directly relies_ on the star symbol (⭐️) for CSS overriding. Specifically, if you're using CSS selectors that include the _literal_ star character (⭐️) as part of a class name (e.g., `.⭐️ComponentName { ... }`), your styles require need to be changed manually to work as expected after this update.

## How to check if you're affected

**Search your codebase:** Look for any instances where the star symbol (⭐️) is used as part of a CSS class name or selector.

## How to fix it if you're affected

If you find that you are indeed relying on the star symbol (⭐️), you'll need to update your CSS selectors to use the new lightning bolt symbol (⚡️). For example, change `.⭐️ComponentName { ... }` to `.⚡️ComponentName { ... }`.

```css
/* Example of old, potentially problematic CSS */
.⭐️MyComponent {
  /* ... old styles ... */
}

/* Example of updated, correct CSS */
.⚡️MyComponent {
  /* ... updated styles ... */
}
```
