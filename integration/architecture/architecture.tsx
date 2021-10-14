import {
  Fragment,
  h,
  Host,
  qComponent,
  qHook,
  QObject,
  Slot,
  PropsOf,
  qProps,
  useEvent,
} from '@builder.io/qwik';
/* eslint no-console: ["off"] */

export interface Cmp {
  class?: string;
  isLazy?: boolean;
  isHydrated?: boolean;
  children?: QObject<Cmp>[];
  related?: QObject<Cmp>;
}

type ArchMode = 'monolith' | 'island' | 'uIslet';

export const ArchApp = qComponent<{ monolith: Cmp; islands: Cmp; uIslets: Cmp }>({
  onRender: qHook(({ monolith, islands, uIslets }) => (
    <>
      <h1>Monolith</h1>
      <b>Examples:</b> Angular, React, Solid, Svelte, Vue, WebComponents
      <MonolithScrubber cmp={monolith} />
      <Browser class="monolith">
        <Component cmp={monolith} arch="monolith" class={getCmpClass(monolith, 'app')} />
      </Browser>
      <h1>Island</h1>
      <b>Examples:</b> Astro
      <Browser class="island">
        <Component cmp={islands} arch="island" class={getCmpClass(islands, 'app')} />
      </Browser>
      <b>Issue:</b> Bootstrapping independent applications
      <ul>
        <li>No standard way of doing inter-island communication.</li>
        <li>Creating islands is a heavy weight operation.</li>
      </ul>
      <h1>
        µIslet &nbsp;
        <img
          width={100}
          src="https://camo.githubusercontent.com/3518364b161ab1351455c0f3774d01973e25602a4b63a3e9129c21deddb2f223/68747470733a2f2f63646e2e6275696c6465722e696f2f6170692f76312f696d6167652f617373657473253246594a494762346930316a7677305352644c3542742532463636376162366332323833643463346438373866623930383361616363313066"
        />
      </h1>
      <Browser class="uIselt">
        <Component cmp={uIslets} arch="uIslet" class={getCmpClass(uIslets, 'app')} />
      </Browser>
    </>
  )),
});

export const Browser = qComponent({
  tagName: 'browser',
  onRender: qHook(() => (
    <div class="browser">
      <div class="browser-url">
        <span>⇦ ⇨ ⟳</span>
        <input value="http://localhost/" />
      </div>
      <div class="browser-body">
        <Slot />
      </div>
    </div>
  )),
});

export const Component = qComponent<{ cmp: Cmp; arch: ArchMode }>({
  tagName: 'component',
  onRender: qHook(({ cmp, arch }) => (
    <Host class={getCmpClass(cmp)} on:click={Component_click}>
      {cmp.children && cmp.children.map((cmp) => <Component cmp={cmp} arch={arch} />)}
      {cmp.children ? null : '...'}
    </Host>
  )),
});

export const Component_click = qHook(async () => {
  // TODO(misko): Workaround for the fact that the click listener is sitting on `<Host>` and hence
  // has parent visibility. Correct solution is to have HOST mode when writing to qProps which would
  // take these issues into account.
  const element = useEvent().target as Element;
  const event = useEvent();
  const props = qProps<PropsOf<typeof Component>>(element);
  switch (props.arch) {
    case 'island':
      if (props.cmp.isLazy) {
        hydrateComponents(props.cmp, 200, 2);
      }
      break;
    case 'uIslet':
      if (event.target == element) {
        props.cmp.isHydrated = true;
        if (props.cmp.related) {
          await delay(200);
          props.cmp.related.isHydrated = true;
        }
      }
      break;
  }
});

function getCmpClass(cmp: Cmp, ...additionalClasses: string[]) {
  const classes: string[] = [];
  classes.push(...additionalClasses);
  cmp.class && classes.push(cmp.class);
  cmp.isHydrated && classes.push('hydrated');
  return classes.join(' ');
}

export const MonolithScrubber = qComponent<{ cmp: Cmp }, { step: number }>({
  onMount: qHook(() => ({ step: 1 })),
  onRender: qHook((props, { step }) => (
    <>
      <ol>
        <li class={step >= 1 ? 'active' : ''}>
          SSR HTML sent from the server and rendered by browser.
        </li>
        <li class={step >= 2 ? 'active' : ''}>Browser downloads application Javascript.</li>
        <li class={step >= 3 ? 'active' : ''}>
          Browser executes application Javascript and starts the reconciliation process.
        </li>
        <li class={step >= 4 ? 'active' : ''}>
          Framework requests the lazy loaded components because they are visible.
        </li>
        <li class={step >= 5 ? 'active' : ''}>
          Framework completes the rehydration of the application.
        </li>
      </ol>
      <button
        on:click={qHook<typeof MonolithScrubber>((props, state) => {
          monolithUpdate(props.cmp, ++state.step);
        })}
      >
        &gt;&gt;&gt;
      </button>
    </>
  )),
});

function monolithUpdate(cmp: Cmp, step: number) {
  switch (step) {
    case 3:
      hydrateComponents(cmp, 300, 1);
      break;
    case 5:
      hydrateComponents(cmp, 300, 2);
      break;
  }
}

async function hydrateComponents(cmp: Cmp | undefined, delay_ms: number, lazyDepth: number) {
  if (!cmp) return;
  if (cmp.isLazy) {
    lazyDepth--;
    if (lazyDepth == 0) return;
  }
  if (!cmp.isHydrated) {
    cmp.isHydrated = true;
    await delay(delay_ms);
  }
  cmp.children && cmp.children.forEach((c) => hydrateComponents(c, delay_ms, lazyDepth));
}

function delay(delay_ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, delay_ms));
}
