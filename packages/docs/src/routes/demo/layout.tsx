import { component$, Slot } from '@builder.io/qwik';
import { useStyles$ } from '@builder.io/qwik';
import STYLES from './demo-reset.css?inline';

export default component$(() => {
  useStyles$(STYLES);
  return (
    <demo>
      <Slot />
      <ul id="console" />
      <script dangerouslySetInnerHTML={`(${logQSymbols.toString()})()`} />
    </demo>
  );
});

function logQSymbols() {
  if (location.search.indexOf('console') == -1) {
    return;
  }
  const consoleUl = document.getElementById('console')!;
  consoleUl.className = 'console';
  consoleUl.innerHTML = '<h1>Console</h1>';
  // eslint-disable-next-line no-constant-binary-expression
  false &&
    document.addEventListener('qsymbol', (e) => {
      const detail = (e as any as { detail: { symbol: string } }).detail;
      const symbol = detail.symbol;
      if (symbol.startsWith('RouterOutlet')) {
        return;
      }
      console.info('QSymbol', symbol);
    });
  for (const name of ['debug', 'error', 'info', 'log', 'warn'] as const) {
    const delegate = console[name];
    console[name] = function (...args: any[]) {
      const li = document.createElement('li');
      li.className = name;
      consoleUl.appendChild(li);
      for (let i = 0; i < args.length; i++) {
        let arg = args[i];
        let style = '';
        if (typeof arg === 'string' && arg.indexOf('%c') == 0) {
          arg = arg.substring(2);
          style = args[++i];
        }
        const span = document.createElement('span');
        span.textContent = arg;
        span.className = name;
        span.setAttribute('style', style);
        li.appendChild(span);
        consoleUl.scroll(0, Number.MAX_SAFE_INTEGER);
      }
      return delegate.apply(console, args);
    };
  }
}
