import { Component, createElement, createRef } from 'react';
import { implicit$FirstArg, type QRL } from '@qwik.dev/core';
import {
  _addProjection,
  _slotReady,
  _updateProjectionProps,
  _removeProjection,
  _SERIALIZABLE_STATE,
} from '@qwik.dev/core/internal';
import { QwikProjectionCtx, getReactProps, type QwikProjectionState } from './slot';

let slotCounter = 0;

/**
 * Creates a React component that renders a Qwik component inside a qwikify$ React tree.
 *
 * This is the QRL form. Use `reactify$` for the convenience form with automatic `$()` wrapping.
 *
 * The returned React component must be rendered inside a `qwikify$()` React tree. It creates a div
 * that Qwik renders into, while React ignores its contents.
 *
 * CSR only. SSR support will be added in a follow-up.
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

      qwikCompQrl.resolve().then((QwikComp: any) => {
        if (!this.mounted) {
          return;
        }

        const serializableState = QwikComp[_SERIALIZABLE_STATE];
        if (!serializableState || !serializableState[0]) {
          if (typeof console !== 'undefined') {
            console.warn(
              'reactify$: argument must be a Qwik component created with component$(). ' +
                'Received: ' +
                typeof QwikComp
            );
          }
          return;
        }
        const componentQRL = serializableState[0];

        // Set display name now that we have the resolved component
        const name = QwikComp.displayName || QwikComp.name || 'QwikComponent';
        (QwikInReact as any).displayName = `reactify$(${name})`;

        const { parentVNode, container } = projectionState;
        // Use pendingProps if React updated props before the QRL resolved
        const reactProps = getReactProps(this.pendingProps || this.props);
        this.vnode = _addProjection(
          container,
          parentVNode,
          componentQRL,
          reactProps,
          this.slotName
        );

        if (this.divRef.current) {
          _slotReady(this.vnode, this.divRef.current);
        }
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
      return createElement('div', {
        ref: this.divRef,
        suppressHydrationWarning: true,
        dangerouslySetInnerHTML: { __html: '' },
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
 * CSR only. SSR support will be added in a follow-up.
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
