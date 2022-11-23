import type { App } from 'vue';

export default (app: App) => {
  app.provide('injected', 'Lorem ipsum');
};
