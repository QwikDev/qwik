import { component$, Slot, useStyles$ } from '@builder.io/qwik';

export const Card = component$(() => {
  useStyles$(CSS);
  return (
    <article class="card">
      <header class="title">
        <Slot name="title"></Slot>
      </header>
      <section class="body">
        <Slot name="body"></Slot>
      </section>
    </article>
  );
});

export default component$(() => {
  return (
    <>
      <Card>
        <span q:slot="title">Qwik</span>
        <span q:slot="body">Qwik is a resumable framework for building instant web apps.</span>
      </Card>
      <Card>
        <span q:slot="title">Partytown</span>
      </Card>
      <Card>
        <span q:slot="body">
          Builder.io allows you to visually build on your tech stack Empower your entire team to
          visually create and optimize high-speed experiences on your sites and apps. Provide
          whole-team autonomy with a platform that is developer approved.
        </span>
      </Card>
    </>
  );
});

export const CSS = `
.card {
  border-radius: 5px;
  vertical-align: top;
  display: inline-block;
  border: 1px solid grey;
  width: 200px;
  margin: .5em;
}

.title {
  background-color: lightgray;
  padding: 0.5em;
  border-bottom: 1px solid black;
}

/* Fallback for slot named "title" */
.title:empty::before {
  content: 'Fallback title';
  color: red;
}

.body {
  padding: 0.5em;
}

/* Fallback for slot named "body" */
.body:empty::before {
  content: 'Fallback body';
  color: orange;
}
`;
