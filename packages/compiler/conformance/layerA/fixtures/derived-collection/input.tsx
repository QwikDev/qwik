import { useSignal } from '@qwik.dev/core';

export function App() {
  const words = useSignal(['alpha', 'beta', 'gamma']);
  return (
    <ul>
      {words.value
        .filter((word) => word.length > 4)
        .map((word) => (
          <li key={word}>{word}</li>
        ))}
    </ul>
  );
}
