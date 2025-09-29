if (typeof document !== 'undefined') {
  const register = () => {
    function getPositionClasses(target) {
      const { x } = target.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      let horizontal = 'right';
      let vertical = 'bottom';
      if (x > windowWidth - 260) {
        horizontal = 'left';
      }
      return `${vertical} ${horizontal}`;
    }
    class ImageWarning extends HTMLElement {
      #actionFn = null;
      constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(
          (document.createElement('template').innerHTML = globalThis.__TEMPLATE__)
        );
        const dialog = this.shadowRoot.querySelector('dialog');

        this.shadowRoot.addEventListener('click', async (ev) => {
          const target = ev.target;
          if (target.nodeName === 'BUTTON') {
            if (target.id === 'action-btn') {
              if (this.#actionFn) {
                this.#actionFn();
                dialog.close();
              }
            } else if (target.id === 'icon') {
              if (dialog.open) {
                dialog.close();
              } else {
                dialog.className = getPositionClasses(target);
                dialog.show();
              }
            } else if (target.id === 'loc' && target.dataset.url) {
              globalThis.qwikOpenInEditor(target.dataset.url);
            }
          }
        });
      }

      set loc(value) {
        const anchor = this.shadowRoot.querySelector('#loc');
        anchor.textContent = value;
        if (globalThis.qwikOpenInEditor) {
          anchor.dataset.url = value;
        }
      }

      set header(value) {
        this.shadowRoot.querySelector('#title').textContent = value;
      }

      set message(value) {
        this.shadowRoot.querySelector('#message').innerHTML = value;
      }

      set actionFn(value) {
        this.#actionFn = value;
      }
      set actionName(value) {
        if (value) {
          this.shadowRoot.querySelector('.action-container').innerHTML =
            `<button id="action-btn" type="button">${value}</button>`;
        }
      }
    }
    customElements.define('image-warning', ImageWarning);

    const visibleNodes = new Map();
    let imageContainer = document.querySelector('#qwik-image-warning-container');
    if (!imageContainer) {
      imageContainer = document.createElement('div');
      imageContainer.id = 'qwik-image-warning-container';
      document.body.appendChild(imageContainer);
    }
    let skip = false;

    async function _getInfo(originalSrc) {
      // Put all supported protocols here, see also packages/qwik/src/optimizer/src/plugins/image-size-server.ts
      if (!/^(https?|file|capacitor):/.test(originalSrc)) {
        return undefined;
      }
      const url = new URL('/__image_info', location.href);
      url.searchParams.set('url', originalSrc);
      return fetch(url)
        .then((res) => res.json())
        .catch(() => null);
    }

    const map = new Map();
    function getInfo(originalSrc) {
      let p = map.get(originalSrc);
      if (typeof p === 'undefined') {
        p = _getInfo(originalSrc);
        map.set(originalSrc, p);
      }
      return p;
    }
    function isDefinedUnit(value) {
      return value.endsWith('px');
    }
    async function doImg(node) {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const rect = node.getBoundingClientRect();
      const originalSrc = node.currentSrc;
      const info = await getInfo(originalSrc);
      let overlay = visibleNodes.get(node);
      const wideScreen = window.innerWidth > 500;
      if (info && wideScreen) {
        let layoutInvalidation = false;
        const loc = node.getAttribute('data-qwik-inspector');
        const browserArea = rect.width * rect.height;
        if (!node.hasAttribute('width') || !node.hasAttribute('height')) {
          skip = true;
          const computedStyles = getComputedStyle(node);
          const hasAspect = computedStyles.getPropertyValue('aspect-ratio').toString() !== 'auto';
          const hasWidth = isDefinedUnit(computedStyles.getPropertyValue('width').toString());
          const hasHeight = isDefinedUnit(computedStyles.getPropertyValue('height').toString());
          const isAbsolute = computedStyles.getPropertyValue('position').toString() === 'absolute';
          layoutInvalidation =
            browserArea > 1000 && !isAbsolute && !hasAspect && (!hasWidth || !hasHeight);
        }
        const realArea = info.width && info.height;
        const threshholdArea = realArea * 0.5;
        const tooBig = browserArea < threshholdArea && info.type !== 'svg';
        skip = false;
        if (layoutInvalidation || tooBig) {
          if (!overlay) {
            overlay = document.createElement('image-warning');
            imageContainer.appendChild(overlay);
            visibleNodes.set(node, overlay);
          }
          overlay.style.top = rect.top + scrollY + 'px';
          overlay.style.left = rect.left + scrollX + 'px';
          overlay.style.width = rect.width + 'px';
          overlay.style.height = rect.height + 'px';
          overlay.info = info;
          overlay.loc = loc;
          if (layoutInvalidation) {
            const clipBoard = `width="${info.width}" height="${info.height}"`;
            overlay.header = 'Perf: layout shift';
            overlay.message = `Image's size is unknown until it's loaded, <a href="https://web.dev/cls/" target="_blank" rel="noopener noreferrer">causing layout shift</a>.</p><p>To solve this problem set the width/height in the img tag:</p><pre>&lt;img <span>${clipBoard}</span></pre>`;
            const uniqueLoc =
              document.querySelectorAll('[data-qwik-inspector="' + loc + '"]').length === 1;
            if (loc) {
              if (uniqueLoc) {
                overlay.actionName = 'Auto fix';
                overlay.actionFn = async () => {
                  const url = new URL('/__image_fix', location.href);
                  url.searchParams.set('loc', loc);
                  url.searchParams.set('width', info.width);
                  url.searchParams.set('height', info.height);
                  if (!node.srcset) {
                    url.searchParams.set('src', node.currentSrc);
                    url.searchParams.set('currentHref', location.href);
                  }
                  await fetch(url, {
                    method: 'POST',
                  });
                };
              } else {
                overlay.actionName = 'Open in editor';
                overlay.actionFn = async () => {
                  await navigator.clipboard.writeText(clipBoard);
                  globalThis.qwikOpenInEditor(loc);
                };
              }
            }
          } else if (tooBig) {
            overlay.header = 'Perf: properly size image';
            overlay.message = `The image is too big, <a href="https://developer.chrome.com/en/docs/lighthouse/performance/uses-responsive-images/" target="_blank" rel="noopener noreferrer">hurting performance</a>, it should be resized to the size it's displayed at. The image dimensions are ${info.width} x ${info.height} but it's displayed at ${rect.width}x${rect.height}.</p>`;
          }
          return;
        }
      }

      if (overlay) {
        overlay.remove();
        visibleNodes.delete(node);
      }
    }

    async function updateImg(node) {
      const overlay = visibleNodes.get(node);
      if (!node.isConnected) {
        if (overlay) {
          overlay.remove();
          visibleNodes.delete(node);
        }
      } else if (node.complete) {
        doImg(node);
      }
    }

    const resizeObserver = new ResizeObserver((entries) => {
      if (!skip) {
        for (const entry of entries) {
          updateImg(entry.target);
        }
      }
    });

    const observer = new MutationObserver((entry) => {
      for (const mutation of entry) {
        for (const node of mutation.addedNodes) {
          if (node.nodeName === 'IMG') {
            resizeObserver.observe(node);
          } else if (node.nodeType === 1) {
            node.querySelectorAll('img').forEach((img) => {
              resizeObserver.observe(img);
            });
          }
        }
        for (const node of mutation.removedNodes) {
          if (node.nodeName === 'IMG') {
            updateImg(node);
            resizeObserver.unobserve(node);
          } else if (node.nodeType === 1) {
            node.querySelectorAll('img').forEach((img) => {
              updateImg(img);
              resizeObserver.unobserve(img);
            });
          }
        }
      }
    });
    let perfObserver;
    let DCLS = 0;
    const activate = () => {
      setTimeout(() => {
        if (perfObserver) {
          perfObserver.disconnect();
          if (DCLS > 0.005) {
            console.error('Detected Layout Shift during page load', DCLS);
          }
        }
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
        document.body.querySelectorAll('img').forEach((node) => {
          resizeObserver.observe(node);
        });
      }, 100);
    };
    if (document.readyState === 'complete') {
      activate();
    } else {
      window.addEventListener('load', activate);
    }
    const pageAccessedByReload =
      performance?.navigation.type === 1 ||
      performance
        .getEntriesByType('navigation')
        .map((nav) => nav.type)
        .includes('reload');
    if (typeof PerformanceObserver !== 'undefined' && !pageAccessedByReload) {
      perfObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.hadRecentInput) {
            return; // Ignore shifts after recent input.
          }
          if (entry.value > 0.006) {
            for (const source of entry.sources) {
              if (
                source.node &&
                source.node.nodeType === 1 &&
                source.node.nodeName !== 'IMAGE-WARNING'
              ) {
                source.node.setAttribute('data-qwik-cls', Number(entry.value).toFixed(3));
              }
            }
          }
          DCLS += entry.value;
        });
      });
      perfObserver.observe({ type: 'layout-shift', buffered: true });
    }
  };

  document.addEventListener('load', register);
}
