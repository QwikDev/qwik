/** @jsxImportSource react */
import { qwikify$ } from '@builder.io/qwik-react';

// Create React component standard way
function Greetings() {
  return <p>Hello from React</p>;
}

// Convert React component to Qwik component
export const QGreetings = qwikify$(Greetings);
