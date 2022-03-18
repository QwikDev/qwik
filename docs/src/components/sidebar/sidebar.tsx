import { component$, Host, $, useHostElement } from '@builder.io/qwik';
import { usePageIndex } from '@builder.io/qwest';

export const SideBar = component$(
  () => {
    const hostElm = useHostElement();

    return $(() => {
      const navIndex = usePageIndex(hostElm);

      return (
        <Host class="fixed z-20 inset-0 pb-10 overflow-y-auto right-auto left-[max(0px,calc(50%-45rem))] top-[5.2rem] lg:w-[18rem] lg:pl-4 lg:pr-4">
          {navIndex
            ? navIndex.items?.map((item) => (
                <>
                  <h5 class="font-semibold text-slate-200 bg-slate-700 px-3 py-1 mb-1 rounded-md whitespace-nowrap">
                    {item.text}
                  </h5>

                  <ul class="border-slate-100 pb-5">
                    {item.items?.map((item) => (
                      <li class="whitespace-nowrap">
                        <a
                          class="py-1 pl-3 block rounded-md text-slate-900 hover:bg-slate-200"
                          href={item.href || '#'}
                        >
                          {item.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              ))
            : null}
        </Host>
      );
    });
  },
  { tagName: 'aside' }
);
