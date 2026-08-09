import { useSignal } from '@qwik.dev/core';

export function App() {
  const heading = useSignal('h2');
  function Title(props: { tag?: string }) {
    // no type checker: only the value decides, so the tag picks element or component at runtime
    const Tag = props.tag ?? 'h1';
    const Rule = 'hr';
    return (
      <Tag class="title">
        Hello
        <Rule />
      </Tag>
    );
  }
  return <Title tag={heading.value} />;
}
