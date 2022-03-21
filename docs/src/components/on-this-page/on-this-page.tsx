import { usePage } from '@builder.io/qwest';
import { component$, Host, $, useHostElement, useScopedStyles$ } from '@builder.io/qwik';
import styles from './on-this-page.css';

export const OnThisPage = component$(
  () => {
    useScopedStyles$(styles);

    return $(async () => {
      const hostElm = useHostElement();
      const page = (await usePage(hostElm))!;

      const headings = page.headings.filter((h) => h.level === 2 || h.level === 3);

      const editUrl = new URL(
        page.source.path,
        'https://github.com/BuilderIO/qwik/edit/main/docs/pages/'
      );

      const onScroll = $(() => {
        // const ev = useEvent();
        // console.log('scroll', ev);
      });

      const onClick = $(() => {
        // const ev = useEvent();
        // console.log('onClick', ev);
      });

      return (
        <Host
          onDocument:scroll={onScroll}
          class="on-this-page fixed text-sm z-20 bottom-0 pb-8 right-[max(0px,calc(50%-45rem))] overflow-y-auto hidden xl:block xl:w-[18rem] xl:top-[5rem]"
        >
          {headings.length > 0 ? (
            <>
              <div class="font-semibold pb-4 uppercase">On This Page</div>
              <ul class="pb-6">
                {headings.map((h) => (
                  <li
                    class={{
                      'pb-2': h.level === 2,
                      'pb-3': h.level > 2,
                      'pl-4': h.level > 2,
                      'border-l-2': true,
                    }}
                  >
                    <a href={`#${h.id}`} class="pl-4 block" on:click={onClick}>
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <a class="edit-page" href={editUrl.href} target="_blank" rel="nofollow noopener">
            Edit this page
          </a>
        </Host>
      );
    });
  },
  { tagName: 'aside' }
);
