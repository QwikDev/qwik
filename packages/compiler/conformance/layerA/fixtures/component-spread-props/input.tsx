export function Badge({ kind, label }: { kind: string; label: string }) {
  return <b class={kind}>{label}</b>;
}

export function App() {
  const shared = { kind: 'box', label: 'hi' };
  return (
    <div>
      <Badge {...shared} />
    </div>
  );
}
