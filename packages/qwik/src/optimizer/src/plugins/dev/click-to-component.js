if (typeof document !== 'undefined') {
  const register = () => {
    const inspectAttribute = 'data-qwik-inspector';
    const hotKeys = globalThis.__HOTKEYS__;
    const srcDir = globalThis.__SRC_DIR__;
    let popup = document.querySelector('#qwik-inspector-info-popup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'qwik-inspector-info-popup';
      popup['aria-hidden'] = 'true';
      document.body.appendChild(popup);
    }
    popup.textContent = `Click-to-Source: ${hotKeys.join(' + ')}`;
    // eslint-disable-next-line no-console
    console.debug(
      '%c🔍 Qwik Click-To-Source',
      'background: #564CE0; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;',
      `Hold-press the '${hotKeys.join(' + ')}' key${
        (hotKeys.length > 1 && 's') || ''
      } and click a component to jump directly to the source code in your IDE!`
    );
    window.__qwik_inspector_state = {
      pressedKeys: new Set(),
    };
    const origin = 'http://local.local';
    const body = document.body;
    const overlay = document.createElement('div');
    overlay.id = 'qwik-inspector-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    body.appendChild(overlay);

    function findContainer(el) {
      if (el && el instanceof Element) {
        return el.closest(`[${inspectAttribute}]`);
      }
      return null;
    }

    document.addEventListener(
      'keydown',
      (event) => {
        window.__qwik_inspector_state.pressedKeys.add(event.code);
        updateOverlay();
      },
      { capture: true }
    );

    document.addEventListener(
      'keyup',
      (event) => {
        window.__qwik_inspector_state.pressedKeys.delete(event.code);
        updateOverlay();
      },
      { capture: true }
    );

    window.addEventListener(
      'blur',
      () => {
        window.__qwik_inspector_state.pressedKeys.clear();
        updateOverlay();
      },
      { capture: true }
    );

    document.addEventListener(
      'mouseover',
      (event) => {
        const target = findContainer(event.target);
        if (target) {
          window.__qwik_inspector_state.hoveredElement = target;
        } else {
          window.__qwik_inspector_state.hoveredElement = undefined;
        }
        updateOverlay();
      },
      { capture: true }
    );

    document.addEventListener(
      'click',
      (event) => {
        if (isActive()) {
          window.__qwik_inspector_state.pressedKeys.clear();
          const target = findContainer(event.target);
          if (target) {
            event.preventDefault();
            event.stopPropagation();
            const inspectUrl = target.getAttribute(inspectAttribute);
            if (inspectUrl !== 'false') {
              body.style.setProperty('cursor', 'progress');
              const match = inspectUrl.match(/^(.*?)(:\d+(:\d+)?)?$/);
              if (match) {
                const [, filePath, location] = match;
                fetch(`${filePath}?editor${location}`).then(() => {
                  body.style.removeProperty('cursor');
                });
              }
            }
          }
        }
      },
      { capture: true }
    );

    document.addEventListener(
      'contextmenu',
      (event) => {
        if (isActive()) {
          window.__qwik_inspector_state.pressedKeys.clear();
          const target = findContainer(event.target);
          if (target) {
            event.preventDefault();
          }
        }
      },
      { capture: true }
    );

    function updateOverlay() {
      const hoverElement = window.__qwik_inspector_state.hoveredElement;
      if (hoverElement && isActive()) {
        const rect = hoverElement.getBoundingClientRect();
        overlay.style.setProperty('height', rect.height + 'px');
        overlay.style.setProperty('width', rect.width + 'px');
        overlay.style.setProperty('top', rect.top + 'px');
        overlay.style.setProperty('left', rect.left + 'px');
        overlay.style.setProperty('visibility', 'visible');
        body.style.setProperty('cursor', 'pointer');
      } else {
        overlay.style.setProperty('height', '0px');
        overlay.style.setProperty('width', '0px');
        overlay.style.setProperty('visibility', 'hidden');
        body.style.removeProperty('cursor');
      }
    }

    function checkKeysArePressed() {
      const activeKeys = Array.from(window.__qwik_inspector_state.pressedKeys).map((key) =>
        key ? key.replace(/(Left|Right)$/g, '') : undefined
      );
      return hotKeys.every((key) => activeKeys.includes(key));
    }

    function isActive() {
      return checkKeysArePressed();
    }
    window.addEventListener('resize', updateOverlay);
    document.addEventListener('scroll', updateOverlay);
  };

  document.addEventListener('DOMContentLoaded', register);
}
