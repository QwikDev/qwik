export const bestPractices = `# Qwik coding practices

- Use @qwik.dev/core APIs and @qwik.dev/router when Router is installed. This guide is bundled with the MCP package; check its version against the project.
- Use component$ for components and $ boundaries for code that should load on demand. Captures crossing a $ boundary must be serializable.
- Prefer component$ over inline components (plain functions). Use an inline component when its caller needs to inspect the rendered children, such as a route filling named layout slots.
- Avoid reading signals, stores, or reactive props directly in a component body: that subscribes the whole component and causes rerenders. Read them in JSX or inside useComputed$ to keep updates narrow.
- Capture only the serializable values a $ boundary needs. Prefer a small field over capturing its entire object when possible.
- Use useTask$ for tracked work that can run during server rendering. Use useVisibleTask$ only when browser-only work is necessary.
- Use Qwik Router's routeLoader$ for route data and routeAction$ for submissions. Keep secrets and server-only logic on the server.
- Qwik resumes from serialized state. Avoid eager client work that reruns the component tree on startup.

Use search_docs and get_doc for complete, versioned guidance and API details.
`;
