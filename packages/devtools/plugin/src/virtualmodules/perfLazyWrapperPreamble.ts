import perfRuntime from './perfRuntime';

/**
 * Preamble injected into Qwik-generated lazy render function modules (`_component_...`).
 *
 * It defines `__qwik_wrap__` that wraps each exported render function and records perf entries.
 */
const perfLazyWrapperPreamble = `${perfRuntime}

// [qwik-component-proxy] Render function wrapper
// Matches core's isPromise, so suspensions are recognized alike.
const __qwik_is_thenable__ = (value) =>
  !!value && typeof value === 'object' && typeof value.then === 'function';

const __qwik_wrap__ = (fn, name, viteId) => {
  if (typeof fn !== 'function') return fn;
  let renderCount = 0;

  function wrapped(...args) {
    const phase = __qwik_perf_is_server__() ? 'ssr' : 'csr';
    const start = performance.now();

    // Counted on completion; perf errors must never break the render.
    const commit = () => {
      try {
        renderCount += 1;
        const duration = performance.now() - start;
        __qwik_perf_commit__({
          component: name,
          phase,
          duration,
          start,
          end: start + duration,
          viteId,
          renderCount,
        });
      } catch {
        // perf recording is best effort
      }
    };

    // Errors and suspensions (thrown promises) pass through untimed.
    const result = fn.apply(this, args);
    // Async renders run past the first await; time until they resolve.
    if (__qwik_is_thenable__(result)) {
      result.then(commit, () => {});
    } else {
      commit();
    }
    return result;
  }

  // Preserve Qwik-compiler metadata attached to the original function.
  const skip = {
    length: true,
    name: true,
    arguments: true,
    caller: true,
    prototype: true,
  };

  const descriptors = Object.getOwnPropertyDescriptors(fn);
  for (const key of Object.keys(descriptors)) {
    if (skip[key]) continue;
    Object.defineProperty(wrapped, key, descriptors[key]);
  }

  for (const sym of Object.getOwnPropertySymbols(fn)) {
    const desc = Object.getOwnPropertyDescriptor(fn, sym);
    if (desc) Object.defineProperty(wrapped, sym, desc);
  }

  return wrapped;
};
`;

export default perfLazyWrapperPreamble;
