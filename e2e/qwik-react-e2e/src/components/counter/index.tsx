/** @jsxImportSource react */
import { useEffect, useState } from 'react';
import { qwikify$ } from '@qwik.dev/react';

interface IProps {
  onMount(): void;
  onUnmount(): void;
}

function Counter({ onMount, onUnmount }: IProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    onMount();
    return () => onUnmount();
  }, []);

  return (
    <div data-testid="test-component">
      <span data-testid="count">count {count}</span>
      <button data-testid="inc-btn" onClick={() => setCount((v) => v + 1)}>
        inc
      </button>
    </div>
  );
}

export const QCounter = qwikify$(Counter, { eagerness: 'hover' });
