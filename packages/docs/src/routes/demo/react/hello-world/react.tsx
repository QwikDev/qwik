/** @jsxImportSource react */
import { qwikify$ } from '@builder.io/qwik-react';

// Create React component standard way
function Greetings() {
  return <div>Hello from React</div>;
}

// Convert React component to Qwik component
export const QGreetings = qwikify$(Greetings);
