import type { ReplResult, ReplStore } from './types';

export const updateReplOutput = async (store: ReplStore, result: ReplResult) => {
  if (result.diagnostics.length === 0) {
    store.html = result.html;
    store.clientModules = result.clientModules;
    store.ssrModules = result.ssrModules;

    if (store.selectedOutputPanel === 'diagnostics' && store.monacoDiagnostics.length === 0) {
      store.selectedOutputPanel = 'app';
    }
  }

  store.diagnostics = result.diagnostics;
  store.events = result.events;

  if (!result.clientModules.some((m) => m.path === store.selectedClientModule)) {
    if (result.clientModules.length > 0) {
      store.selectedClientModule = result.clientModules[0].path;
    } else {
      store.selectedClientModule = '';
    }
  }

  if (!result.ssrModules.some((m) => m.path === store.selectedSsrModule)) {
    if (result.ssrModules.length > 0) {
      store.selectedSsrModule = result.ssrModules[0].path;
    } else {
      store.selectedSsrModule = '';
    }
  }
};

const reapplyScripts = (elm: HTMLElement) => {
  // adding a <script> with just innerHTML will not execute it
  // this manually finds scripts and re-applys them so they run
  if (elm && elm.tagName) {
    if (elm.tagName === 'SCRIPT') {
      try {
        const script = document.createElement('script');
        const attrs = elm.attributes;
        const parentNode = elm.parentNode!;
        for (let a = 0; a < attrs.length; a++) {
          const attr = attrs[a];
          script.setAttribute(attr.nodeName, attr.nodeValue!);
        }
        script.innerHTML = elm.innerHTML;
        parentNode.insertBefore(script, elm);
        parentNode.removeChild(elm);
      } catch (e) {
        console.error(e);
      }
    } else {
      for (let i = 0; i < elm.children.length; i++) {
        reapplyScripts(elm.children[i] as HTMLElement);
      }
    }
  }
};
