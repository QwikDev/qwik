import { Counter } from './child';

export function App() {
  return (
    <main>
      <h1>Cross-module</h1>
      <Counter label="hits" />
    </main>
  );
}
