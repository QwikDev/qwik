import type { ReplResult, ReplStore } from './types';

export const updateReplOutput = async (store: ReplStore, result: ReplResult) => {
  store.diagnostics = result.diagnostics;

  if (store.diagnostics.length === 0) {
    store.html = result.html;
    store.transformedModules = result.transformedModules;
    store.clientBundles = result.clientBundles;
    store.ssrModules = result.ssrModules;
    store.events = result.events;

    if (store.selectedOutputPanel === 'diagnostics' && store.monacoDiagnostics.length === 0) {
      store.selectedOutputPanel = 'app';
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
