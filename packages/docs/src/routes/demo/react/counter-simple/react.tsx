/** @jsxImportSource react */
import { qwikify$ } from '@builder.io/qwik-react';
import { useState } from 'react';

// Create React component standard way
function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button className="react" onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  );
}

// Convert React component to Qwik component
export const QCounter = qwikify$(Counter);
