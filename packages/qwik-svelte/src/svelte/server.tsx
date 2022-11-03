import { QRL, Signal, Slot, SSRRaw, SSRStream } from "@builder.io/qwik";
import { getHostProps, getSvelteProps } from "./props";

export async function renderFromServer(
  Host: any,
  svelteCmp$: QRL<any>,
  props: Record<string, any>,
  ref: Signal<Element | undefined>,
  slotRef: Signal<Element | undefined>
) {
  const Cmp = await svelteCmp$.resolve();

  const newProps = getSvelteProps(props);

  let { html, css } = Cmp.render(
    { newProps },
    {
      $$slots: {
        default: () => "<!--SLOT-->",
      },
    }
  );

  let { html: fallbackHtml } = Cmp.render(newProps, {
    $$slots: {},
  });

  // Possibly a hacky way of adding styles when rendering the SSR component
  // There is hopefully a better way to do this
  // as this will result in a lot of duplicate style declarations
  // when reusing components

  let styles = css.code.length
    ? `<style>
  ${css.code.length ? css.code : ""}</style> `
    : "";

  const index = html.indexOf("<!--SLOT-->");

  if (index > 0) {
    const part1 = html.slice(0, index);
    const part2 = html.slice(index + "<!--SLOT-->".length);

    // get fallback content
    const fallbackContent = fallbackHtml.slice(
      part1.length,
      fallbackHtml.indexOf(part2)
    );

    // if there is fallback content, add some styles to show it
    // if no content is passed in Qwik
    if (fallbackContent?.length) {
      styles += `<style>
        .qslotc:empty {
          display: none;
        }

        .qslotc-fallback {
          display: none;
        }

        .qslotc:empty + .qslotc-fallback {
          display: block;
        }
      </style>`;
    }

    return (
      <Host ref={ref} {...getHostProps(props)}>
        <SSRStream>
          {async function* () {
            yield <SSRRaw data={styles} />;
            yield <SSRRaw data={part1} />;
            yield (
              <q-slotc class="qslotc" ref={slotRef}>
                <Slot />
              </q-slotc>
            );
            yield !!fallbackContent?.length && (
              <div class="qslotc-fallback">{fallbackContent}</div>
            );
            yield <SSRRaw data={part2} />;
          }}
        </SSRStream>
      </Host>
    );
  }

  return (
    <>
      <Host ref={ref}>
        <SSRRaw data={styles}></SSRRaw>
        <SSRRaw data={html}></SSRRaw>
      </Host>
      <q-slot ref={slotRef}>
        <Slot />
      </q-slot>
    </>
  );
}
