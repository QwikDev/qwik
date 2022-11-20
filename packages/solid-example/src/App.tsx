/** @jsxImportSource solid-js */

import { Component, createSignal } from 'solid-js';

// import styles from './App.module.css';

const App: Component = () => {
  const [count, setCount] = createSignal(0);

  return (
    <div>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        {count()}
      </button>
    </div>
  );
};

export default App;
