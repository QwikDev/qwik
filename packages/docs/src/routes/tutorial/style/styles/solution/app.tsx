import { component$, useStyles$, useStore } from '@builder.io/qwik';

export default component$(() => {
  useStyles$(AppCSS);
  const store = useStore({ open: false, siblings: [0] }, { deep: true });

  return (
    <div class="parent">
      <button onClick$={() => (store.open = !store.open)}>toggle</button>
      <button onClick$={() => store.siblings.push(0)}>addSibling</button>
      {store.open ? <Child key="child" /> : null}
      {store.siblings.map(() => (
        <Sibling />
      ))}
    </div>
  );
});

export const Child = component$(() => {
  useStyles$(ChildCSS);
  return (
    <div class="child">
      <div>Child</div>
    </div>
  );
});

export const Sibling = component$(() => {
  useStyles$(SiblingCSS);

  return (
    <div class="sibling">
      <div>Sibling</div>
    </div>
  );
});

//TODO: These should be import as: import AppCSS from './app.css';
// however the playground does not yet support such imports.
export const AppCSS = `
.parent {
  border: 1px solid black;
  padding: 1em;
}
`;
export const ChildCSS = `
.child {
  margin-top: 1em;
  border: 1px solid red;
  padding: 1em;
  display: block;
}
`;
export const SiblingCSS = `.sibling {
  margin-top: 1em;
  border: 1px solid green;
  padding: 1em;
  display: block;
}
`;
