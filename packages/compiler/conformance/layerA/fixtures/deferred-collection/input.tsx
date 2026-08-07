import { useSignal } from '@qwik.dev/core';

const Badge = ({ label }: { label: string }) => {
  return <span class="badge">{label}</span>;
};

export function App() {
  const items = useSignal(['alpha', 'beta']);
  const selected = useSignal('alpha');
  return (
    <div>
      <Badge label="head" />
      <ul>
        {items.value.map((item) => (
          <li key={item} class={{ on: selected.value === item }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
