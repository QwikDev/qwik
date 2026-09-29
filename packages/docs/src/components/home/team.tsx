import { component$ } from '@qwik.dev/core';
import { lucide, streamlinepixel as pixel } from '@qds.dev/ui';
import { Link } from '~/components/action/action';

const coreTeam = [
  { login: 'mhevery', name: 'Miško Hevery' },
  { login: 'shairez', name: 'Shai Reznik' },
  { login: 'wmertens', name: 'Wout Mertens' },
  { login: 'Varixo', name: 'Michał Popek' },
  { login: 'maiieul', name: 'Maïeul Chevalier' },
  { login: 'thejackshelton', name: 'Jack Shelton' },
  { login: 'gioboa', name: 'Giorgio Boa' },
  { login: 'PatrickJS', name: 'PatrickJS' },
];

const specialMentions = [
  { login: 'manucorporat', name: 'Manu Mtz.-Almeida' },
  { login: 'adamdbradley', name: 'Adam Bradley' },
  { login: 'steve8708', name: 'Steve Sewell' },
];

const contributors = [
  'dmitry-stepanenko',
  'scottweaver',
  'JerryWu1234',
  'saisrikardumpeti',
  'zanettin',
  'Shane-Donlon',
  'nnelgxorz',
  'sajebehari',
  'cunzaizhuyi',
  'Jemsco',
  'wtlin1228',
  'sreeisalso',
  'hamatoyogi',
  'forresst',
  'Aejkatappaja',
  'ulic75',
  'leifermendez',
  'GrandSchtroumpf',
  'Craiqser',
  'mrhoodz',
];

const githubAvatarUrl = (login: string, size: number) =>
  `https://avatars.githubusercontent.com/${login}?s=${size}`;

export const Team = component$(() => {
  return (
    <section
      aria-labelledby="team-heading"
      class="relative overflow-x-clip flex flex-col gap-10 w-full max-w-[1280px] mx-auto 2xl:pt-40 md:pt-24 pt-16 pb-20 2xl:px-20 px-4"
    >
      <div class="flex flex-col gap-10 max-w-fit">
        <div class="relative w-fit">
          <h2 id="team-heading" class="relative z-2 font-heading 2xl:text-h3 text-[28px]">
            <span class="bg-secondary-background-base mb-2 block w-fit shadow-primary-accent">
              Built by
            </span>
            <span class="bg-secondary-background-base shadow-primary-accent">
              performance nerds
            </span>
          </h2>
          <pixel.interfaceessentialstopwatch class="absolute -top-16 right-0 md:top-1/2 md:right-auto md:left-full md:ml-8 md:-translate-y-1/2 z-1 size-20 rotate-12 text-border-base drop-shadow-[6px_6px_0_var(--color-shadow-emphasis)]" />
        </div>
        <p class="max-w-[50ch]">
          <span class="shadow-sm-base 2xl:text-body-md text-body-sm">
            Qwik is open source. A core team maintains it, with help from hundreds of contributors.
          </span>
        </p>
      </div>

      <div class="relative flex flex-col gap-4">
        <div class="absolute -z-2 -inset-x-1/4 -inset-y-1/2 bg-hero-gradient-blue opacity-50" />
        <h3 class="text-foreground-soft text-sm">Core team</h3>
        <ul class="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {coreTeam.map(({ login, name }) => (
            <li key={login}>
              <a
                href={`https://github.com/${login}`}
                target="_blank"
                rel="noreferrer"
                class="flex flex-col items-center gap-3 h-full rounded-2xl border-[1.6px] border-base bg-background-base shadow-base p-4 2xl:p-6 text-center motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:-translate-[2px]"
              >
                <img
                  src={githubAvatarUrl(login, 192)}
                  width={96}
                  height={96}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  class="size-20 2xl:size-24 rounded-full border-[1.6px] border-emphasis bg-background-accent"
                />
                <span class="font-heading 2xl:text-body-md text-body-sm">{name}</span>
                <span class="text-body-xs text-foreground-soft">@{login}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div class="flex flex-col gap-4">
        <h3 class="text-foreground-soft text-sm">Special mentions</h3>
        <ul class="grid lg:grid-cols-3 gap-6">
          {specialMentions.map(({ login, name }) => (
            <li key={login}>
              <a
                href={`https://github.com/${login}`}
                target="_blank"
                rel="noreferrer"
                class="flex items-center gap-4 h-full rounded-2xl border-[1.6px] border-base bg-background-base shadow-sm-base p-3 motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:-translate-[2px]"
              >
                <img
                  src={githubAvatarUrl(login, 112)}
                  width={56}
                  height={56}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  class="size-14 rounded-full border-[1.6px] border-emphasis bg-background-accent"
                />
                <span class="flex flex-col gap-1">
                  <span class="font-heading text-body-sm">{name}</span>
                  <span class="text-body-xs text-foreground-soft">@{login}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div class="flex flex-col gap-4">
        <h3 class="text-foreground-soft text-sm">Contributors</h3>
        <div class="flex flex-wrap items-center gap-6">
          <ul class="isolate flex flex-wrap pl-3">
            {contributors.map((login) => (
              <li key={login} class="-ml-3">
                <a
                  href={`https://github.com/${login}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={login}
                  class="group relative block rounded-full hover:z-10 focus-visible:z-10"
                >
                  <img
                    src={githubAvatarUrl(login, 80)}
                    width={40}
                    height={40}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    class="size-10 rounded-full border-2 border-background-base bg-background-accent grayscale group-hover:grayscale-0 group-focus-visible:grayscale-0 motion-safe:transition-[filter]"
                  />
                  <span
                    aria-hidden="true"
                    class="pointer-events-none absolute bottom-full left-0 mb-2 whitespace-nowrap rounded-[4px] border-[1.6px] border-base bg-background-base px-2 py-1 text-body-xs opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    {login}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <Link
            href="https://github.com/QwikDev/qwik/graphs/contributors"
            target="_blank"
            rel="noreferrer"
            variant="outline"
            class="w-fit"
          >
            <span>+400 contributors</span>
            <lucide.arrowright />
          </Link>
        </div>
      </div>
    </section>
  );
});
