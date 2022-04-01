import { usePage } from '@builder.io/qwest';
import { component$, Host, $, useHostElement, useScopedStyles$ } from '@builder.io/qwik';
import { ChatIcon } from '../svgs/chat-icon';
import { EditIcon } from '../svgs/edit-icon';
import { GithubLogo } from '../svgs/github-logo';
import { TwitterLogo } from '../svgs/twitter-logo';
import styles from './on-this-page.css?inline';

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
          onDocumentScrollQrl={onScroll}
          class="on-this-page fixed text-sm z-20 bottom-0 right-[max(0px,calc(50%-45rem))] overflow-y-auto hidden xl:block xl:w-[18rem] xl:top-[5rem]"
        >
          {headings.length > 0 ? (
            <>
              <h6>On This Page</h6>
              <ul>
                {headings.map((h) => (
                  <li>
                    <a
                      href={`#${h.id}`}
                      class={{
                        block: true,
                        indent: h.level > 2,
                      }}
                      onClickQrl={onClick}
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <h6>More</h6>
          <ul>
            <li>
              <a href={editUrl.href} target="_blank" rel="nofollow noopener">
                <EditIcon width={22} height={22} />
                <span>Edit this page</span>
              </a>
            </li>
            <li>
              <a href="https://discord.gg/Fd9Cwb3Z8D" target="_blank" rel="nofollow noopener">
                <ChatIcon width={20} height={20} />
                <span>Join our community</span>
              </a>
            </li>
            <li>
              <a href="https://github.com/BuilderIO/qwik" target="_blank" rel="nofollow noopener">
                <GithubLogo width={20} height={20} />
                <span>Github</span>
              </a>
            </li>
            <li>
              <a href="https://twitter.com/QwikDev" target="_blank" rel="nofollow noopener">
                <TwitterLogo width={20} height={20} />
                <span>@QwikDev</span>
              </a>
            </li>
          </ul>
        </Host>
      );
    });
  },
  { tagName: 'aside' }
);
