import { component$, Host, $ } from '@builder.io/qwik';
import type { PageIndex } from '@builder.io/qwest';

interface SidebarProps {
  navIndex: PageIndex;
}

export const SideBar = component$(
  ({ navIndex }: SidebarProps) => {
    return $(() => (
      <Host class="min-w-[240px] flex-none pr-10 pt-1 pb-12">
        <nav>
          {navIndex.items?.map((item) => (
            <>
              <h5 class="md:mb-2 font-semibold text-slate-200 bg-slate-700 px-3 py-1 rounded-md whitespace-nowrap">
                {item.text}
              </h5>
              <ul class="md:mb-8 border-slate-100 ">
                {item.items?.map((item) => (
                  <li class="whitespace-nowrap">
                    <a
                      class="py-1 pl-3 block rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                      href={item.href || '#'}
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ))}
        </nav>
      </Host>
    ));
  },
  { tagName: 'aside' }
);
