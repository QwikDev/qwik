import { component$, $, useSignal } from '@builder.io/qwik';
import QwikLogo from '/public/logos/qwik.png?jsx';
import QwikLogouwu from '/public/logos/qwik-uwu.webp?jsx';
import QwikSocial from '/public/logos/social-card.png?jsx';
import QwikSocial2 from '/public/logos/social-card.jpg?jsx';
import { Header } from '~/components/header/header';
import { Footer } from '~/components/footer/footer';
import { Slot } from '@builder.io/qwik';
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
      <div class="flex flex-col justify-between h-72 border border-gray-200 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300">
        <p class="text-2xl font-bold text-center py-4 ">{props.title}</p>
        <div class="flex-grow flex items-center justify-center overflow-hidden px-2">
          <Slot name="logo" />
        </div>
        <div class="flex justify-center mt-auto py-4">
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
          class="flex justify-center text-white items-center cursor-pointer h-12  "
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
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5 p-2 px-10 py-10 md:px-32">
        {logos.map((item) => (
          <Logo key={item.title} title={item.title} alt={item.alt} downloadHref={item.downloadHref}>
            {item.Logo === 'img' ? (
              <img q:slot="logo" src={item.src} alt={item.alt} class="bg-cover" />
            ) : (
              <item.Logo q:slot="logo" alt={item.alt} class={item.className} />
            )}
          </Logo>
        ))}
        <div class="flex flex-col justify-between h-72 border border-gray-200 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300">
          <div class="flex-grow grid grid-rows-6 text-center overflow-hidden px-2 py-2">
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
      <div class="flex justify-center mt-1">
        <a
          onClick$={downloadAllAssets}
          class="flex justify-between items-center py-2 px-4 font-medium text-center border-2 border-solid cursor-pointer select-none border-sky-500 text-sky-500 rounded-md hover:bg-sky-500 hover:text-white transition-colors duration-300"
          download
        >
          Download All Logos
        </a>
      </div>
      <Footer />
    </main>
  );
});
