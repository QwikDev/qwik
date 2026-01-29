import { $, component$, Slot, useSignal } from '@qwik.dev/core';
import { Footer } from '~/components/footer/footer';
import { Header } from '~/components/header/header';
import QwikLogouwu from '/public/logos/qwik-uwu.webp?jsx';
import QwikLogo from '/public/logos/qwik.png?jsx';
import QwikSocial2 from '/public/logos/social-card.jpg?jsx';
import QwikSocial from '/public/logos/social-card.png?jsx';
const DownloadButton = component$((props: { href: string | undefined }) => {
  return (
    <a
      class="mx-4 my-0 flex h-8 w-fit cursor-pointer items-center justify-between self-center rounded-md border-2 border-solid border-sky-500 px-2 py-0 text-center font-medium text-sky-500 select-none"
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

  const logos = [
    {
      title: 'Qwik Logo (png)',
      alt: 'Qwik Logo in PNG format',
      downloadHref: '/logos/qwik.png',
      Logo: QwikLogo,
    },
    {
      title: 'Qwik Logo (svg)',
      alt: 'Qwik Logo in SVG format',
      downloadHref: '/logos/qwik.svg',
      Logo: 'img',
      src: '/logos/qwik.svg',
    },
    {
      title: 'Qwik Logo (uwu)',
      alt: 'Qwik Logo in UWU format',
      downloadHref: '/logos/qwik-uwu.webp',
      Logo: QwikLogouwu,
      className: 'h-auto w-auto object-contain',
    },
    {
      title: 'Qwik social card Light',
      alt: 'Qwik Social Card in Light theme',
      downloadHref: '/logos/social-card.png',
      Logo: QwikSocial,
    },
    {
      title: 'Qwik social card Dark',
      alt: 'Qwik Social Card in Dark theme',
      downloadHref: '/logos/social-card.jpg',
      Logo: QwikSocial2,
    },
  ];
  const downloadAllAssets = $(() => {
    const links = [
      '/logos/qwik.png',
      '/logos/qwik.svg',
      '/logos/qwik-uwu.webp',
      '/logos/social-card.png',
      '/logos/social-card.jpg',
    ];

    links.forEach((link) => {
      const anchor = document.createElement('a');
      anchor.href = link;
      anchor.download = link.split('/').pop() as string;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    });
  });

  const Logo = component$((props: { title: string; alt: string; downloadHref: string }) => {
    return (
      <div class="flex h-72 flex-col justify-between rounded-lg border border-gray-200 shadow-md transition-shadow duration-300 hover:shadow-lg">
        <p class="py-4 text-center text-2xl font-bold">{props.title}</p>
        <div class="flex flex-grow items-center justify-center overflow-hidden px-2">
          <Slot name="logo" />
        </div>
        <div class="mt-auto flex justify-center py-4">
          <DownloadButton href={props.downloadHref} />
        </div>
      </div>
    );
  });

  const ColorButton = component$(
    (props: { color: string; name: string; hexCode: string; text: string | undefined }) => {
      return (
        <button
          onClick$={() => copyToClipboard(props.hexCode)}
          style={`background-color:${props.color};`}
          class="flex h-12 cursor-pointer items-center justify-center text-white"
        >
          {activeColor.value === props.hexCode ? (
            <p class={props.color === 'var(--qwik-light-blue)' ? 'text-black' : 'text-white'}>
              Copied ✓
            </p>
          ) : (
            <p class={props.color === 'var(--qwik-light-blue)' ? 'text-black' : ''}>
              {props.name} {props.hexCode}
            </p>
          )}
        </button>
      );
    }
  );

  const qwikColors = [
    { color: 'var(--qwik-blue)', name: 'Qwik Blue', hexCode: color.qwikBlue },
    { color: 'var(--qwik-dark-blue)', name: 'Qwik Dark Blue', hexCode: color.qwikDarkBlue },
    { color: 'var(--qwik-light-blue)', name: 'Qwik Light Blue', hexCode: color.qwikLightBlue },
    { color: 'var(--qwik-purple)', name: 'Qwik Purple', hexCode: color.qwikPurple },
    { color: 'var(--qwik-dark-purple)', name: 'Qwik Dark Purple', hexCode: color.qwikDarkPurple },
    {
      color: 'var(--qwik-dark-purple-bg)',
      name: 'Qwik Dark Purple Bg',
      text: 'var(--qwik-light-blue)',
      hexCode: color.qwikDarkPurpleBg,
    },
  ];

  return (
    <main>
      <Header />
      <div class="grid grid-cols-1 gap-5 p-2 px-10 py-10 md:grid-cols-3 md:px-32">
        {logos.map((item) => (
          <Logo key={item.title} title={item.title} alt={item.alt} downloadHref={item.downloadHref}>
            {item.Logo === 'img' ? (
              <img q:slot="logo" src={item.src} alt={item.alt} class="bg-cover" />
            ) : (
              <item.Logo q:slot="logo" alt={item.alt} class={item.className} />
            )}
          </Logo>
        ))}
        <div class="flex h-72 flex-col justify-between rounded-lg border border-gray-200 shadow-md transition-shadow duration-300 hover:shadow-lg">
          <div class="grid flex-grow grid-rows-6 overflow-hidden px-2 py-2 text-center">
            {qwikColors.map((colorItem) => (
              <ColorButton
                key={colorItem.name}
                color={colorItem.color}
                name={colorItem.name}
                text={colorItem.text}
                hexCode={colorItem.hexCode}
              />
            ))}
          </div>
        </div>
      </div>
      <div class="mt-1 flex justify-center">
        <a
          onClick$={downloadAllAssets}
          class="flex cursor-pointer items-center justify-between rounded-md border-2 border-solid border-sky-500 px-4 py-2 text-center font-medium text-sky-500 transition-colors duration-300 select-none hover:bg-sky-500 hover:text-white"
          download
        >
          Download All Logos
        </a>
      </div>
      <Footer />
    </main>
  );
});
