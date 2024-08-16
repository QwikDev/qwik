import { component$, $, useSignal } from '@builder.io/qwik';
import QwikLogo from '/public/logos/qwik.png?jsx';
import QwikLogouwu from '/public/logos/qwik-uwu.webp?jsx';
import QwikSocial from '/public/logos/social-card.png?jsx';
import QwikSocial2 from '/public/logos/social-card.jpg?jsx';
import { Header } from '~/components/header/header';
import { Footer } from '~/components/footer/footer';

const DownloadButton = component$((props: { href: string | undefined }) => {
  return (
    <a
      class="
          flex justify-between items-center py-0 px-2 my-0 mx-4 h-8 font-medium text-center  border-2 border-solid cursor-pointer select-none border-sky-500     text-sky-500 w-fit self-center rounded-md "
      href={props.href ?? '/logos/qwik.png'}
      download
    >
      <p class="hover:underline"> Download</p>{' '}
    </a>
  );
});

export default component$(() => {
  const activeColor = useSignal<string>('');

  const color = {
    qwikBlue: '#009dfd',
    qwikDarkBlue: '#006ce9',
    qwikLightBlue: '#daf0ff',
    qwikPurple: '#ac7ef4',
    qwikDarkPurple: '#6000ff',
    qwikDarkPurpleBg: '#151934',
  } as const;

  const copyToClipboard = $(async (text: string) => {
    try {
      if (!navigator.clipboard) {
        activeColor.value = text;
        return;
      }
      await navigator.clipboard.writeText(text);
      activeColor.value = text;
      const rs = setTimeout(() => {
        const old = activeColor.value;
        if (old === text) {
          activeColor.value = '';
        }
      }, 1500);
      return () => clearTimeout(rs);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  });

  return (
    <main>
      <Header />
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 p-2 px-10 md:px-32">
        <div class="flex flex-col justify-center">
          <p class="text-2xl font-bold text-center">Qwik Logo (png)</p>
          <QwikLogo alt="Qwik Logo in PNG format" />
          <DownloadButton href="/logos/qwik.png" />
        </div>
        <div class="flex flex-col justify-center">
          <p class="text-2xl font-bold text-center">Qwik Logo (svg)</p>
          <img src="/logos/qwik.svg" alt="Qwik Logo in SVG format" />
          <DownloadButton href="/logos/qwik.svg" />
        </div>
        <div class="flex flex-col justify-center">
          <p class="text-2xl font-bold text-center">Qwik Logo (uwu)</p>
          <QwikLogouwu class="h-[150px]" alt="Qwik Logo in UWU format" />
          <DownloadButton href="/logos/qwik-uwu.webp" />
        </div>
        <div class="flex flex-col justify-center gap-2">
          <h1 class="text-2xl font-bold text-center">Qwik social card Light</h1>
          <QwikSocial alt="Qwik Social Card in Light theme" />
          <DownloadButton href="/logos/social-card.png" />
        </div>
        <div class="flex flex-col justify-center gap-2">
          <h1 class="text-2xl font-bold text-center">Qwik social card Dark</h1>
          <QwikSocial2 alt="Qwik Social Card in Dark theme" />
          <DownloadButton href="/logos/social-card.jpg" />
        </div>
        <div class="grid grid-rows-7 text-center">
          <h1 class="text-2xl font-bold text-center">Qwik Colors</h1>
          <button
            onClick$={() => copyToClipboard(color.qwikBlue)}
            style="
          background-color:var(--qwik-blue);"
            class=" cursor-pointer hover:cursor-pointer flex justify-center items-center"
          >
            {activeColor.value === color.qwikBlue ? (
              <p class="text-white">Copied ✓</p>
            ) : (
              <p>Qwik Blue #009dfd</p>
            )}
          </button>
          <button
            onClick$={() => copyToClipboard(color.qwikDarkBlue)}
            style="background-color:var(--qwik-dark-blue);"
            class="flex justify-center items-center cursor-pointer"
          >
            {activeColor.value === color.qwikDarkBlue ? (
              <p>Copied ✓</p>
            ) : (
              <p>Qwik Dark Blue #006ce9</p>
            )}
          </button>
          <button
            style="background-color:var(--qwik-light-blue); color:black;"
            class="flex justify-center items-center cursor-pointer"
            onClick$={() => copyToClipboard(color.qwikLightBlue)}
          >
            {activeColor.value === color.qwikLightBlue ? (
              <p>Copied ✓</p>
            ) : (
              <p>Qwik Light Blue #daf0ff</p>
            )}
          </button>
          <button
            onClick$={() => copyToClipboard(color.qwikPurple)}
            style="background-color:var(--qwik-purple);"
            class="flex justify-center items-center cursor-pointer"
          >
            {activeColor.value === color.qwikPurple ? <p>Copied ✓</p> : <p>Qwik Purple #ac7ef4</p>}
          </button>
          <button
            style="background-color:var(--qwik-dark-purple);"
            class="flex justify-center items-center cursor-pointer"
            onClick$={() => copyToClipboard(color.qwikDarkPurple)}
          >
            {activeColor.value === color.qwikDarkPurple ? (
              <p>Copied ✓</p>
            ) : (
              <p>Qwik Dark Purple #6000ff</p>
            )}
          </button>
          <button
            style="background-color:var(--qwik-dark-purple-bg);"
            class="flex justify-center items-center cursor-pointer"
            onClick$={() => copyToClipboard(color.qwikDarkPurpleBg)}
          >
            {activeColor.value === color.qwikDarkPurpleBg ? (
              <p>Copied ✓</p>
            ) : (
              <p>Qwik Dark Purple Bg #151934</p>
            )}
          </button>
        </div>
      </div>
      <Footer />
    </main>
  );
});
