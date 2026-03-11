import { Component, createElement, createRef } from 'react';
import { implicit$FirstArg, type QRL } from '@qwik.dev/core';
import {
  _addProjection,
  _setProjectionTarget,
  _updateProjectionProps,
  _removeProjection,
} from '@qwik.dev/core/internal';
import {
  QwikProjectionCtx,
  getReactProps,
  getSSRProjectionRegistry,
  type QwikProjectionState,
} from './slot';

let slotCounter = 0;

/**
 * Creates a React component that renders a Qwik component inside a qwikify$ React tree.
 *
 * This is the QRL form. Use `reactify$` for the convenience form with automatic `$()` wrapping.
 *
 * The returned React component must be rendered inside a `qwikify$()` React tree. It creates a div
 * that Qwik renders into, while React ignores its contents.
 *
 * During SSR, a marker is emitted so that server-render.tsx can render the Qwik component inline
 * inside `q:container-island` comments. On the client, Qwik resumes the SSR content naturally
 * (events, signals, state are all serialized). For pure CSR, `_addProjection` renders from
 * scratch.
 *
 * @param qwikCompQrl - A QRL wrapping a Qwik component (created with `component$`)
 * @returns A React component that renders the Qwik component
 */
export function reactifyQrl(qwikCompQrl: QRL<any>): any {
  class QwikInReact extends Component<Record<string, any>> {
    static contextType = QwikProjectionCtx;
    declare context: QwikProjectionState | null;

    private slotName = `_rq:${slotCounter++}`;
    private vnode: any = null;
    private divRef = createRef<HTMLDivElement>();
    private mounted = false;
    private pendingProps: Record<string, any> | null = null;

    componentDidMount(): void {
      this.mounted = true;
      const projectionState = this.context;
      if (!projectionState) {
        if (typeof console !== 'undefined') {
          console.warn('reactify$: component must be rendered inside a qwikify$() React tree.');
        }
        return;
      }

      const div = this.divRef.current;
      if (!div) {
        return;
      }

      // If the div has SSR content (from q:container-island), Qwik has already
      // processed and can resume it. Don't re-render — just like q-slotc does for slots.
      // Check for an element child (not just the QWIK-PROJ comment marker from render()).
      if (div.firstElementChild) {
        return;
      }

      // Pure CSR: empty div, render the Qwik component from scratch via _addProjection.
      qwikCompQrl.resolve().then((QwikComp: any) => {
        if (!this.mounted) {
          return;
        }

        // Set display name now that we have the resolved component
        const name = QwikComp.displayName || QwikComp.name || 'QwikComponent';
        (QwikInReact as any).displayName = `reactify$(${name})`;

        const { parentVNode, container } = projectionState;
        // Use pendingProps if React updated props before the QRL resolved
        const reactProps = getReactProps(this.pendingProps || this.props);
        this.vnode = _addProjection(container, parentVNode, qwikCompQrl, reactProps, this.slotName);
        // Clear the marker comment right before _setProjectionTarget so the div is empty
        // when Qwik's cursor walker processes it on the next microtask.
        div.replaceChildren();
        _setProjectionTarget(this.vnode, div);
      });
    }

    componentWillUnmount(): void {
      this.mounted = false;
      if (this.vnode && this.context) {
        _removeProjection(
          this.context.container,
          this.context.parentVNode,
          this.vnode,
          this.slotName
        );
        this.vnode = null;
      }
    }

    shouldComponentUpdate(nextProps: Record<string, any>): boolean {
      // Forward new props to Qwik, but prevent React from re-rendering.
      // React's render() uses dangerouslySetInnerHTML which would clear Qwik's content.
      if (this.vnode && this.context) {
        const reactProps = getReactProps(nextProps);
        _updateProjectionProps(this.context.container, this.vnode, reactProps);
      } else {
        // QRL hasn't resolved yet; stash props so componentDidMount uses them
        this.pendingProps = nextProps;
      }
      return false;
    }

    render() {
      // During SSR (inside React's renderToString), register the component in the
      // projection registry and output a marker that server-render.tsx will replace
      // with the actual Qwik component rendered inside q:container-island comments.
      const registry = getSSRProjectionRegistry();
      if (registry) {
        const reactProps = getReactProps(this.props);
        registry.entries.set(this.slotName, { qrl: qwikCompQrl, props: reactProps });
        return createElement('div', {
          'data-qwik-projection': this.slotName,
          suppressHydrationWarning: true,
          dangerouslySetInnerHTML: { __html: `<!--QWIK-PROJ:${this.slotName}-->` },
        });
      }
      // CSR path: render a div that Qwik will render into.
      // Use the same marker as SSR so suppressHydrationWarning preserves SSR content
      // during hydration (like q-slotc does for slots). For pure CSR, the div starts
      // empty and _addProjection renders the component in componentDidMount.
      return createElement('div', {
        ref: this.divRef,
        suppressHydrationWarning: true,
        dangerouslySetInnerHTML: { __html: `<!--QWIK-PROJ:${this.slotName}-->` },
        'data-qwik-projection': this.slotName,
      });
    }
  }

  (QwikInReact as any).displayName = `reactify$(...)`;

  return QwikInReact;
}

/**
 * Creates a React component that renders a Qwik component inside a qwikify$ React tree.
 *
 * The returned React component must be rendered inside a `qwikify$()` React tree. It creates a div
 * that Qwik renders into, while React ignores its contents.
 *
 * During SSR, the Qwik component is rendered as HTML inside `q:container-island` comments. On the
 * client, the component re-renders via the external projection API.
 *
 * @example
 *
 * ```tsx
 * import { component$ } from '@qwik.dev/core';
 * import { qwikify$, reactify$ } from '@qwik.dev/react';
 *
 * const QwikCounter = component$(() => {
 *   const count = useSignal(0);
 *   return <button onClick$={() => count.value++}>{count.value}</button>;
 * });
 *
 * const ReactCounter = reactify$(QwikCounter);
 *
 * const ReactApp = ({ children }) => (
 *   <div>
 *     <h1>React App</h1>
 *     <ReactCounter />
 *     {children}
 *   </div>
 * );
 *
 * export const QwikifiedApp = qwikify$(ReactApp);
 * ```
 *
 * @param qwikComp - A Qwik component (created with `component$`)
 * @returns A React component that renders the Qwik component
 */
export const reactify$ = /*#__PURE__*/ implicit$FirstArg(reactifyQrl);
