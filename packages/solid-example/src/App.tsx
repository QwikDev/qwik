/** @jsxImportSource solid-js */

import { Component, createSignal } from 'solid-js';

// import styles from './App.module.css';

const App: Component = () => {
  const [count, setCount] = createSignal(1)

  console.log("Rendering solid component")

  return (
    <div>
      <header>
        <h1>Hello from Solid</h1>
        <p>Count: {count()}</p>
        <div>
          <button onClick={() => setCount(c => c + 1)}>+</button>
        </div>
      </header>
    </div>
  );
};

export default App;
