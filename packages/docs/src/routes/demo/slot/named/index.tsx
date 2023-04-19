import { Slot, component$, useStylesScoped$ } from '@builder.io/qwik';
import CSS from './index.css?inline';

const Tab = component$(() => {
  useStylesScoped$(CSS);
  return (
    <section>
      <h2>
        <Slot name="title" />
      </h2>
      <div>
        <Slot /> {/* default slot */}
        <div>
          <Slot name="footer" />
        </div>
      </div>
    </section>
  );
});

export default component$(() => {
  return (
    <Tab>
      <div q:slot="title">Qwik</div>
      <div>A resumable framework for building instant web applications</div>
      <span q:slot="footer">made with ❤️ by </span>
      <a q:slot="footer" href="https://builder.io">
        builder.io
      </a>
    </Tab>
  );
});
