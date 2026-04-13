# @qwik.dev/optimizer

## 2.1.0-beta.2

### Minor Changes

- ✨ Qwik now supports `passive:eventname` markers for JSX event handlers. Use them with matching `on*$/document:on*$/window:on*$` listeners when you want passive browser listeners for events like `touchstart`, `touchmove`, or `scroll`. (by [@Varixo](https://github.com/Varixo) in [#8523](https://github.com/QwikDev/qwik/pull/8523))

- ✨ The optimizer now supports inline `@qwik-disable-next-line` hints, allowing you to suppress specific diagnostics for the next line when needed, such as `preventdefault-passive-check`. (by [@Varixo](https://github.com/Varixo) in [#8523](https://github.com/QwikDev/qwik/pull/8523))

## 2.0.1-beta.1

### Patch Changes

- 🐞🩹 module-level variables could be moved into extracted qrl chunks even when the main module still needed them (by [@Varixo](https://github.com/Varixo) in [#8500](https://github.com/QwikDev/qwik/pull/8500))

## 2.0.1-beta.0

### Patch Changes

- ✨ the Qwik optimizer is now in a separate package, which reduces download size for the qwik package (by [@wmertens](https://github.com/wmertens) in [#8483](https://github.com/QwikDev/qwik/pull/8483))
