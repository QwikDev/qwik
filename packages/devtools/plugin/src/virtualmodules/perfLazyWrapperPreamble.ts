import perfRuntime from './perfRuntime';

/**
 * Preamble injected into Qwik-generated lazy render function modules (`_component_...`).
 *
 * It defines `__qwik_wrap__` that wraps each exported render function and records perf entries.
 */
const perfLazyWrapperPreamble = `${perfRuntime}

// [qwik-component-proxy] Render function wrapper
const __qwik_wrap__ = (fn, name, viteId) => {
  if (typeof fn !== 'function') return fn;
  let renderCount = 0;

  function wrapped(...args) {
    renderCount += 1;
    const phase = __qwik_perf_is_server__() ? 'ssr' : 'csr';
    const start = performance.now();

    const result = fn.apply(this, args);
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
    return result;
  }

  // Preserve Qwik-compiler metadata attached to the original function.
  // (No try/catch per request; avoid touching special function props.)
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
