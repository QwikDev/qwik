import { h, qDehydrate, qRender } from '@builder.io/qwik';
import { ToDoApp } from './components';
import type { Todos } from './state';
/* eslint no-console: ["off"] */

export async function serveRender() {
  // Normally `todos` would be retrieved from database.
  // For simplicity we just create a set of todos to get the app started.
  const todos: Todos = {
    filter: 'all',
    items: [
      { completed: false, title: 'Read Qwik docs' },
      { completed: false, title: 'Build HelloWorld' },
      { completed: false, title: 'Profit' },
    ],
  };

  // Perform the initial application rendering
  await qRender(document.body, <ToDoApp todos={todos} />);
  // Once the application is rendered, dehydrated it to prepare it for sending to the client.
  qDehydrate(document);
  console.clear();
}
