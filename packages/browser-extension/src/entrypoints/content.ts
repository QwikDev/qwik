import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { QWIK_ATTR, QWIK_CONTAINER_SELECTOR, V2_BINDING_ATTR } from '../shared/constants.js';
import type { ExtensionMessage, QwikContainerInfo } from '../shared/types.js';
import { isExtensionMessage } from '../shared/types.js';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    let inspectOverlay: HTMLDivElement | null = null;
    let inspectActive = false;

    /** Qwik detection */
    function detectQwik(): QwikContainerInfo {
      const containers = document.querySelectorAll(QWIK_CONTAINER_SELECTOR);
      if (containers.length === 0) {
        return {
          detected: false,
          version: null,
          renderMode: null,
          containerState: null,
          base: null,
          manifestHash: null,
          containerCount: 0,
          runtime: null,
        };
      }

      const el = containers[0];
      return {
        detected: true,
        version: el.getAttribute(QWIK_ATTR.VERSION),
        renderMode: el.getAttribute(QWIK_ATTR.RENDER),
        containerState: el.getAttribute(QWIK_ATTR.CONTAINER),
        base: el.getAttribute(QWIK_ATTR.BASE),
        manifestHash: el.getAttribute(QWIK_ATTR.MANIFEST_HASH),
        containerCount: containers.length,
        runtime: el.getAttribute(QWIK_ATTR.RUNTIME),
      };
    }

    /** Element picker */
    function createOverlay(): HTMLDivElement {
      const overlay = document.createElement('div');
      overlay.id = '__qwik_devtools_overlay';
      overlay.style.cssText = `
        position: fixed;
        pointer-events: none;
        border: 2px solid #8b5cf6;
        background: rgba(139, 92, 246, 0.1);
        z-index: 2147483647;
        transition: all 0.1s ease;
        display: none;
        border-radius: 3px;
      `;

      const label = document.createElement('div');
      label.style.cssText = `
        position: absolute;
        top: -22px;
        left: -2px;
        background: #8b5cf6;
        color: white;
        font-size: 11px;
        font-family: -apple-system, sans-serif;
        padding: 2px 6px;
        border-radius: 3px 3px 0 0;
        white-space: nowrap;
        pointer-events: none;
      `;
      label.id = '__qwik_devtools_label';
      overlay.appendChild(label);

      document.body.appendChild(overlay);
      return overlay;
    }

    /**
     * Walk up the DOM to find the nearest Qwik-managed ancestor. Handles both v1 (`q:id`) and v2
     * (`:=` binding attribute).
     */
    function findQwikAncestor(el: Element): Element | null {
      let current: Element | null = el;
      while (current) {
        if (current.hasAttribute(QWIK_ATTR.ID)) {
          return current;
        }
        if (current.hasAttribute(V2_BINDING_ATTR)) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    }

    function getElementIdentifier(el: Element): string | null {
      return el.getAttribute(QWIK_ATTR.ID) ?? el.getAttribute(V2_BINDING_ATTR);
    }

    /**
     * Extract the Qwik component name from `data-qwik-inspector` attribute. Format:
     * "/src/components/Button/Button.tsx:49:10"
     */
    function getComponentName(el: Element): string | null {
      const inspector =
        el.getAttribute('data-qwik-inspector') ??
        el.closest('[data-qwik-inspector]')?.getAttribute('data-qwik-inspector');
      if (!inspector) {
        return null;
      }
      const parts = inspector.split('/');
      const fileName = (parts[parts.length - 1] || '').split(':')[0];
      return fileName.replace(/\.(tsx|ts|jsx|js)$/, '') || null;
    }

    function handleInspectMove(e: MouseEvent) {
      if (!inspectActive || !inspectOverlay) {
        return;
      }
      const target = e.target as Element;
      const qwikEl = findQwikAncestor(target);

      if (qwikEl) {
        const rect = qwikEl.getBoundingClientRect();
        inspectOverlay.style.display = 'block';
        inspectOverlay.style.top = `${rect.top}px`;
        inspectOverlay.style.left = `${rect.left}px`;
        inspectOverlay.style.width = `${rect.width}px`;
        inspectOverlay.style.height = `${rect.height}px`;

        const label = inspectOverlay.querySelector(
          '#__qwik_devtools_label'
        ) as HTMLDivElement | null;
        if (label) {
          const compName = getComponentName(qwikEl) || getComponentName(target);
          if (compName) {
            label.textContent = `<${compName} />`;
          } else {
            const tag = qwikEl.tagName.toLowerCase();
            const id = getElementIdentifier(qwikEl);
            label.textContent = `<${tag}> #${id ?? '?'}`;
          }
        }
      } else {
        inspectOverlay.style.display = 'none';
      }
    }

    // Inject main-world inspect hook (blocks clicks in the same world as qwikloader)
    const inspectScript = document.createElement('script');
    inspectScript.src = chrome.runtime.getURL('/inspect-hook.js');
    (document.documentElement || document.head).appendChild(inspectScript);
    inspectScript.addEventListener('load', () => inspectScript.remove());

    // Inject devtools hook if Qwik is detected (plain script, no ES imports needed)
    if (detectQwik().detected) {
      const hookScript = document.createElement('script');
      hookScript.src = chrome.runtime.getURL('/devtools-hook.js');
      (document.documentElement || document.head).appendChild(hookScript);
      hookScript.addEventListener('load', () => hookScript.remove());
    }
    // VNode bridge is injected by the panel via evalInPage (needs dynamic import)

    function startInspect() {
      inspectActive = true;
      if (!inspectOverlay) {
        inspectOverlay = createOverlay();
      }
      document.removeEventListener('mousemove', handleInspectMove, true);
      document.addEventListener('mousemove', handleInspectMove, true);
      document.body.style.cursor = 'crosshair';
      // Tell main-world hook to start intercepting clicks
      window.postMessage({ type: '__QWIK_DT_INSPECT_START' }, '*');
    }

    function stopInspect() {
      inspectActive = false;
      if (inspectOverlay) {
        inspectOverlay.style.display = 'none';
      }
      document.removeEventListener('mousemove', handleInspectMove, true);
      document.body.style.cursor = '';
      window.postMessage({ type: '__QWIK_DT_INSPECT_STOP' }, '*');
    }

    /** SPA navigation detection */
    let lastUrl = location.href;
    let spaNavTimeout: ReturnType<typeof setTimeout> | null = null;
    let spaObserver: MutationObserver | null = null;

    const notifyPageChanged = () => {
      try {
        browser.runtime.sendMessage({ type: 'PAGE_CHANGED' });
      } catch {
        // extension context invalidated
      }
    };

    const cleanupSpaDetection = () => {
      if (spaNavTimeout) {
        clearTimeout(spaNavTimeout);
        spaNavTimeout = null;
      }
      if (spaObserver) {
        spaObserver.disconnect();
        spaObserver = null;
      }
    };

    const checkUrlChange = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        cleanupSpaDetection();

        const container = document.querySelector(QWIK_CONTAINER_SELECTOR) ?? document.body;

        spaObserver = new MutationObserver(() => {
          if (spaNavTimeout) {
            clearTimeout(spaNavTimeout);
          }
          spaNavTimeout = setTimeout(() => {
            cleanupSpaDetection();
            notifyPageChanged();
          }, 200);
        });

        spaObserver.observe(container, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: [QWIK_ATTR.ID, QWIK_ATTR.KEY, QWIK_ATTR.CONTAINER, V2_BINDING_ATTR],
        });

        // Fallback: notify after 1s even if no mutations
        spaNavTimeout = setTimeout(() => {
          cleanupSpaDetection();
          notifyPageChanged();
        }, 1000);
      }
    };

    // Inject main-world script to intercept pushState/replaceState
    const navScript = document.createElement('script');
    navScript.src = chrome.runtime.getURL('/nav-hook.js');
    (document.documentElement || document.head).appendChild(navScript);
    navScript.addEventListener('load', () => navScript.remove());

    const handleNavMessage = (e: MessageEvent) => {
      if (e.data?.type === '__QWIK_DT_NAV') {
        checkUrlChange();
      }
    };

    // Forward devtools messages from page main world to background/panel
    const handleDevtoolsMessage = (e: MessageEvent) => {
      if (e.source !== window || !e.data) {
        return;
      }

      // Forward component tree updates and render events
      if (
        e.data.source === 'qwik-devtools' &&
        (e.data.type === 'COMPONENT_TREE_UPDATE' || e.data.type === 'RENDER_EVENT')
      ) {
        try {
          browser.runtime.sendMessage({
            type: e.data.type,
            payload: e.data.tree || e.data.event,
          });
        } catch {
          // extension context invalidated
        }
      }

      // Forward element pick from main-world inspect hook
      if (e.data.type === '__QWIK_DT_ELEMENT_PICKED') {
        stopInspect();
        try {
          browser.runtime.sendMessage({
            type: 'ELEMENT_PICKED',
            payload: {
              qId: e.data.qId,
              colonId: e.data.colonId,
              treeNodeId: e.data.treeNodeId,
            },
          });
        } catch {
          // extension context invalidated
        }
      }
    };

    // Abort previous listeners if the content script reinitializes
    (
      (window as unknown as Record<string, unknown>).__qwik_dt_abort as AbortController | undefined
    )?.abort();
    const navAbort = new AbortController();
    (window as unknown as Record<string, unknown>).__qwik_dt_abort = navAbort;

    window.addEventListener('message', handleNavMessage, {
      signal: navAbort.signal,
    });
    window.addEventListener('message', handleDevtoolsMessage, {
      signal: navAbort.signal,
    });
    window.addEventListener('popstate', checkUrlChange, {
      signal: navAbort.signal,
    });

    browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
      if (!isExtensionMessage(msg)) {
        return;
      }
      let response: ExtensionMessage;

      switch (msg.type) {
        case 'DETECT_QWIK':
          response = { type: 'QWIK_DETECTION_RESULT', payload: detectQwik() };
          break;
        case 'START_INSPECT':
          startInspect();
          response = { type: 'OK' };
          break;
        case 'STOP_INSPECT':
          stopInspect();
          response = { type: 'OK' };
          break;
        default:
          response = { type: 'OK' };
      }

      try {
        sendResponse(response);
      } catch (err) {
        console.warn('[Qwik DevTools]', err);
      }
      // Keep channel open for Chrome's sendResponse callback
      return true;
    });
  },
});
