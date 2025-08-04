import { component$ } from '@qwik.dev/core';
import { useDocumentHead } from '.';
import type { DocumentHeadValue } from './types';

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
  let head = useDocumentHead();
  if (props) {
    head = { ...head, ...props };
  }

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
        // Support for the old `props` property
        const props = s.props || s;
        return (
          <style
            {...props}
            dangerouslySetInnerHTML={s.style || props.dangerouslySetInnerHTML}
            key={s.key}
          />
        );
      })}
      {head.scripts.map((s) => {
        // Support for the old `props` property
        const props = s.props || s;
        return (
          <script
            {...props}
            dangerouslySetInnerHTML={s.script || props.dangerouslySetInnerHTML}
            key={s.key}
          />
        );
      })}
    </>
  );
});
