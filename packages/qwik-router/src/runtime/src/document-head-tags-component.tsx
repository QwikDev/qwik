import { component$, untrack } from '@qwik.dev/core';
import { useDocumentHead } from '.';
import type { DocumentHeadValue } from './types';

const trackWholeStore = <T extends object>(store: T): T => {
  Object.keys(store);
  return untrack(() => ({ ...store }));
};

/**
 * This renders all the tags collected from `head`.
 *
 * You can partially override the head, for example if you want to change the title:
 *
 * ```tsx
 * import { DocumentHeadTags, useDocumentHead } from '@qwik.dev/router';
 *
 * export default component$(() => {
 *   const head = useDocumentHead();
 *   return <DocumentHeadTags title={`${head.title} - My App`} />;
 * });
 * ```
 *
 * You don't have to use this component, you can also do it yourself for full control. Just copy the
 * code from this component and modify it to your needs.
 *
 * Note that this component normally only runs once, during SSR. You can use Signals in your
 * `src/root.tsx` to make runtime changes to `<head>` if needed.
 *
 * @public
 */
export const DocumentHeadTags = component$((props: DocumentHeadValue) => {
  const documentHead = trackWholeStore(useDocumentHead());
  const head = {
    title: props.title ?? documentHead.title,
    meta: props.meta ?? documentHead.meta,
    links: props.links ?? documentHead.links,
    styles: props.styles ?? documentHead.styles,
    scripts: props.scripts ?? documentHead.scripts,
  };

  return (
    <>
      {head.title && <title>{head.title}</title>}
      {head.meta.map((m) => (
        <meta {...m} />
      ))}
      {head.links.map((l) => (
        <link {...l} />
      ))}
      {head.styles.map((s) => {
        // `style` and `key` are not attributes. `props` is the old way to set the attributes.
        const { style, key, props: oldProps, ...rest } = s;
        const props = oldProps || rest;
        return (
          <style
            {...props}
            dangerouslySetInnerHTML={style || props.dangerouslySetInnerHTML}
            key={key}
          />
        );
      })}
      {head.scripts.map((s) => {
        // `script` and `key` are not attributes. `props` is the old way to set the attributes.
        const { script, key, props: oldProps, ...rest } = s;
        const props = oldProps || rest;
        return (
          <script
            {...props}
            dangerouslySetInnerHTML={script || props.dangerouslySetInnerHTML}
            key={key}
          />
        );
      })}
    </>
  );
});
