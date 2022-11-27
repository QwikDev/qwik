/** @jsxImportSource solid-js */

import { Component, createSignal, JSX } from 'solid-js';
export * from "./Slot"

// import styles from './App.module.css';

const App: Component = (props: {children?: JSX.Element, label?: string}) => {
  const [count, setCount] = createSignal(0);

  return (
    <div>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        {props.label}: {count()}
        {props.children}
      </button>
    </div>
  );
};

export default App;
