import { Badge } from './child';

export function App() {
  // the same runtime branch, resolving the other way: a local value that is a component
  const Tag = Badge;
  return <Tag label="new" />;
}
