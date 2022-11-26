/** @jsxImportSource solid-js */

import { Component, createSignal, JSX } from 'solid-js';
export * from "./Slot.tsx"

// import styles from './App.module.css';

const App: Component = (props: {children?: JSX.Element}) => {
  const [count, setCount] = createSignal(0);

  return (
    <div>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Solid count: {count()}
        {props.children}
      </button>
    </div>
  );
};

export default App;
