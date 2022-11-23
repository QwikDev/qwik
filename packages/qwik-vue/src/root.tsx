import 'vant/lib/index.css';

import { component$, useSignal, useStore, useStyles$ } from '@builder.io/qwik';
import { VueComponent, VantButton } from './examples/app';

export const Wrapper = component$(() => {
  const label = useSignal('Label');
  const slotIndex = useSignal(0);

  return (
    <div class="container">
      <p>
        Example with Vue component hydrated when visible.
        <br />
        The two buttons bellows will update props and slot of the Vue component separately.
        <br />
        A conditionnal slot content will appear when slot index will be over 2.
        <br />
        The first Button is a VueButton from Vant library, the second one is a Qwik button.
        <br />
        By hovering the Vue Component, you will see a console.log fires, it triggered by
        <br />
        <strong>host:onMouseOver$</strong> event attached to the wrapper.
      </p>
      <VantButton client:hover onClick$={() => (label.value = 'Label From QwikVue')}>
        Vant Library button: Update {label.value}
      </VantButton>
      <br />
      <br />
      <button class="qwik-button" onClick$={() => slotIndex.value++}>
        Qwik button: Update Slot index ({slotIndex.value})
      </button>
      <VueComponent
        client:visible
        label={label.value}
        host:onMouseOver$={() => {
          // eslint-disable-next-line no-console
          console.info('Host mouseover');
        }}
      >
        <p>Slot Index: {slotIndex.value}</p>
        {slotIndex.value > 2 && <p>Conditionnal Slot content</p>}
      </VueComponent>
    </div>
  );
});

export const SecondWrapper = component$(() => {
  const labels = ['Label', 'Another label', 'Label updated'];
  const store = useStore({ label: 0, componentMounted: false, counter: 0 });

  return (
    <div class="container">
      <p>
        Example with client only Vue component. Vue component is not rendered on the server.
        <br />
        The Slot and props of the Vue component will be updated by clicking on the button bellow.
        <br />
        The Vue component will also update the Qwik state by catching emits of the Vue Component.
      </p>
      <div>
        <strong>Emits :</strong>
        <ul>
          <li>
            <strong>onClick :</strong> will update the Qwik state counter, this value will be passed
            as props and as Slot to the Vue Component
          </li>
          <li>
            <strong>onMounted :</strong> will update the componentMounted state
          </li>
        </ul>
      </div>
      <VantButton
        client:hover
        onClick$={() => (store.label === labels.length - 1 ? (store.label = 0) : store.label++)}
      >
        Vant Library button: Update Label
      </VantButton>
      <div>{store.componentMounted ? 'Vue component mounted' : 'Vue component not mounted'}</div>
      <VueComponent
        client:only
        label={labels[store.label] + ' ' + store.counter}
        onClick$={(count: number) => (store.counter = count)}
        onMounted$={() => (store.componentMounted = true)}
      >
        <p>Slot content: ({labels[store.label]})</p>
        <p>Vue counter is: ({store.counter})</p>
      </VueComponent>
    </div>
  );
});

export const Root = component$(() => {
  useStyles$(`
  * {
    box-sizing: border-box;
    font-family: Arial;
    color: #31465B;
  }
  ul {
    padding-bottom: 20px;
  }
  box {
    display: block;
    width: 100%;
    height: 200px;
    margin-bottom: 20px;
    background: linear-gradient(315deg,#42d392 25%,#647eff);
  }
  .qwik-button {
    background: #3eb27f;
    color: white;
    padding: 12px;
    outline: none;
    border: none;
    cursor: pointer;
    border-radius: 4px;
  }
  .container {
    padding: 20px;
    border: 4px solid #3eb27f;
    margin-bottom: 20px; 
  }
  .main-container {
    padding: 20px;
  }
`);

  return (
    <>
      <head>
        <title>Qwik Vue</title>
      </head>
      <body class="main-container">
        <box />
        <box />
        <box />
        <box />
        <Wrapper />
        <SecondWrapper />
      </body>
    </>
  );
});
