import { component$, useStyles$ } from '@builder.io/qwik';

import type { DocumentHead } from '@builder.io/qwik-city';
import styles from './media.css?inline';

/*************************************************************/
/* This file is used to generate the ecosystem and media pages.
/* Please find the appropriate section in the MEDIA variable
/* to add your content.
/* Thanks!!!
/*************************************************************/

export const MEDIA = mediaObj({
  /*****************************************/
  /* Courses
  /*****************************************/
  courses: [
    youtube('The Net Ninja', 'W0xjcx4mrkE', {
      playlist: 'PL4cUxeGkcC9gOUlY-uCHurFIpqogsdOnw',
      promoted: true,
    }),
    {
      href: 'https://qwikschool.com/',
      imgSrc:
        'https://user-images.githubusercontent.com/1430726/234708569-7a51fe77-3a65-4a28-9617-73ad159aa551.png',
      title: 'QwikSchool.com',
      language: 'en',
      promoted: true,
    },
    youtube('Qwik JS - Crash Introduction to Building a Super Fast Application', 'zLHYDY9dAbs', {
      playlist: 'PLkswEDcfBXYcl1gW7L5zyCVF9LpGhlOqu',
      promoted: true,
    }),
    {
      href: 'https://frontendmasters.com/courses/qwik/',
      imgSrc: 'https://static.frontendmasters.com/assets/courses/2023-02-28-qwik/posterframe.webp',
      title: 'FrontendMasters: Qwik for Instant-Loading Websites & Apps',
      language: 'en',
      promoted: true,
    },
    youtube('🇪🇸 Qwik en 2 horas', 'FF3D4tppyag', { language: 'es', promoted: true }),
    {
      href: 'https://cursos.devtalles.com/courses/qwik-introduccion',
      imgSrc: 'https://fernando-herrera.com/assets/img/cursos/qwik-gratis.png',
      title: '🇪🇸 Fernando Herrera + DevTalles',
      language: 'es',
      promoted: true,
    },
    youtube('🇪🇸 manuelsanchezweb: Qwik para principiantes', 'X4puVLRTr4k', { language: 'es' }),
    {
      href: 'https://www.udemy.com/course/curso-intermedio-qwik-espanol/?referralCode=3D453D600C0CB529D84B',
      imgSrc: 'https://www.manuelsanchezweb.com/img/qwik-intermedio.png',
      title: '🇪🇸 manuelsanchezweb: Qwik intermedio-avanzado con proyectos',
      language: 'es',
    },
    youtube('🇷🇺 Qwik 1.0 - новый подход frontend разработки?', 'FF4D4tppyag', {
      language: 'ru',
      promoted: true,
    }),
    youtube('QwikJS course in Arabic', 'irQDABJZw5c', {
      playlist: 'PLJaZ4a7YGFlJIxcL0br5FPsh5f9qFKKdd',
      language: 'ar',
    }),
  ],

  /*****************************************/
  /* Videos
  /*****************************************/
  videos: [
    youtube('Unveiling Qwik 1.0: What You Need to Know!', 'NjKOAbWqOM4', { promoted: true }),
    youtube("Qwik… the world's first O(1) JavaScript framework?", 'x2eF3YLiNhY', {
      promoted: true,
    }),
    youtube('Qwik JS and the future of frameworks', 'z14c3u9q8rI', { promoted: true }),
    youtube('Qwik: Under-The-Hood of a Resumable JavaScript Framework', 'BxGbnLb5i9Q', {
      promoted: true,
    }),
    youtube('Qwik-ifying React SPA to create the fastest possible website', 'dbxP9FX5j2o', {
      promoted: true,
    }),
    youtube('Exploring Qwik, the Resumable Framework', 'gT5NWKZZPQM', { promoted: true }),
    youtube('Building Qwik w/ Misko Hevery', 'lY6e7Hw4uVo'),
    youtube('Qwik, an SSR resumable framework', 'tdEelSqDj0E'),
    youtube('Why the world needs Qwik with Miško Hevery', 'IRw9efkn9UA'),
    youtube('Exploring Qwik City w/ Adam Bradley & Manu Martínez-Almeida', 'XoeJisRJjlo'),
    youtube('Building resumable websites using Qwik with Manu Almeida', 'umASDvjaKTY'),
    youtube('Breaking Down the Web: SSR with Miško Hevery (Qwik!)', 'fYATmnlxX4A'),
    youtube('🇪🇸 Qwik - nuevo framework para Js', 'GzUMPnsDopM', { language: 'es' }),
    youtube('🇪🇸 Qwik Framework, Un nuevo Framework Super Rápido (Lazy Loading)', 'kT-Y17mEUZs', {
      language: 'es',
    }),
    youtube('🇪🇸 Construindo Apps instantâneos com Qwik', 'yrROy1vLwkE', { language: 'es' }),
    youtube('🇪🇸 Après Angular : place à Qwik!', 'Ts2IWXMYiXk', { language: 'es' }),
    youtube('🇪🇸 Hablemos de Qwik', 'XMLMS2NVC1g', { language: 'es' }),
    youtube('🇪🇸 Qwik el framework más rápido para aplicaciones web', 'On5P_xw8zSw', {
      language: 'es',
    }),
    youtube('🇪🇸 Introducción a QwikJS', 'fX7bM4iuuUQ', { language: 'es' }),
    youtube('🇪🇸 ¿Qué onda Qwik?', 'H7TL4SqcC3E', { language: 'es' }),
    youtube('Introduction to Qwik for JS Developers ft. Miško Hevery | JS Drops', 'DxJgXw91cCQ'),
    youtube('Building Performant Applications at Scale with Qwik-City', '_R0-0IWdshE'),
    youtube('Qwik: The Lightest, Fastest Way to Build Web Apps', 'l2mBk9meSvc'),
    youtube('Resumable React - Leveraging the React ecosystem with Qwik', 'IGIPBAWRw_M'),
    youtube('How to build a Qwik app with Yoav Ganbar', 'qqbi9WBe-ts'),
    youtube('Qwik Crash Course', 'W0xjcx4mrkE'),
    youtube(
      `LEARN QWIK - The World's Fastest JavaScript Framework | E-comm Store Project | Qwik + TailwindCSS`,
      '6w1987dVHVY'
    ),
    youtube(
      `Interview and Q&A with JSNation Speaker: Miško Hevery | Intro and Overview of Qwik`,
      'mLbReseU_I0'
    ),
    youtube('Resumability | Explained Briefly', 'vQ365FjT-yI'),
  ],

  /*****************************************/
  /* Podcasts
  /*****************************************/
  podcasts: [
    youtube('Qwik City for Resumable, Dynamic Apps', 'cJJdrYnsl6U', { promoted: true }),
    youtube('Qwik + React State (and a new mic!)', 'fa6-Mn0Eybg', { promoted: true }),
    youtube(
      'Miško Hevery: Qwik, PartyTown, and Lessons from Angular [Swyx Mixtape]',
      'T3K_DrgLPXM',
      { promoted: true }
    ),
    youtube('Introducing Qwik w/ Misko Hevery & Shai Reznik', 'iJZaT-AvJ-o', { promoted: true }),
    youtube('Resumable Apps in Qwik', 'LbMRs7l4czI', { promoted: true }),
    youtube('Qwik: A no-hydration instant-on personalized web applications', '0tCuUQe_ZA0', {
      promoted: true,
    }),
    youtube('QWIK - Set of great demos by Misko Hevery', '7MgNMIPISY4'),
    youtube('Qwik the HTML First Framework', 'GdIZh42etYk'),
    youtube('Build Resumable Apps with Qwik', '_PDpoJUacuc'),
    youtube('Introduction to Qwik – Misko Hevery', 'gYbHdss_y04'),
    youtube(
      'Build Performant, Resumable Sites with Qwik and Partytown (with Miško Hevery) | Some Antics',
      'aGuJPcIdX0A'
    ),
    youtube('Qwik with Miško Hevery (JS Party Live!)', 'rS8hXFHWKJQ'),
    youtube(
      'JSMP 4: Misko Hevery on Qwik - No hydration, auto lazy-loading, edge cacheable, and fun',
      'wMnqgjHkLiY'
    ),
    {
      href: 'https://podrocket.logrocket.com/qwik',
      imgSrc:
        'https://assets.fireside.fm/file/fireside-images/podcasts/images/3/3911462c-bca2-48c2-9103-610ba304c673/episodes/e/e4fc6b6c-9e69-426d-ad23-2e7c79931d11/header.jpg?v=1',
      title: 'Qwik with Yoav Ganbar',
    },
    {
      href: 'https://open.spotify.com/episode/5AnveNaA0SG9b85VChMAjD',
      imgSrc: 'https://i.scdn.co/image/ab6765630000ba8a18aa5c33cbb1658d26724fcf',
      title: 'FedBites: Qwik Special with Miško Hevery & Adam Bradley',
    },
    {
      href: 'https://open.spotify.com/episode/2dl2QegrUBnepz0RHZ17rG?si=EfvbNWURT1-9u1Z34BVd1g',
      imgSrc: 'https://devtalles.com/files/qwik/podcast-banner.jpg',
      title: 'DevTalles 113: qwik v1.0',
    },
  ],

  /*****************************************/
  /* Presentations
  /*****************************************/
  presentations: [
    youtube('Qwik framework overview', 'Jf_E1_19aB4', { startTime: 629, promoted: true }),
    youtube(
      'Mindblowing Google PageSpeed Scores with Qwik | Misko Hevery | Reliable Web Summit 2021',
      'sCPLWf2cEY0',
      { promoted: true }
    ),
    youtube(
      'WWC22 - Qwik + Partytown: How to remove 99% of JavaScript from main thread',
      '0dC11DMR3fU',
      { startTime: 154, promoted: true }
    ),
    youtube(
      'Qwik: A holly grail of progressive hydration for ultimate speed by Miško Hevery',
      'JxYbg7eZNLY',
      { promoted: true }
    ),
    youtube('Qwik: A no hydration instant', 'Zddw6qy5pf0', { promoted: true }),
    youtube(
      'Qwik City: Reimangined meta-framework for the edge, Adam Bradley, ViteConf 2022',
      'dSLWJBGWigs',
      { promoted: true }
    ),
    youtube('Qwik Workshop Part 1 - Live Coding', 'GHbNaDSWUX8'),
    youtube('Qwik: Beta and Beyond', 'Tfd62DiRTKc'),
    youtube('Qwik Core Developers Training', 'Mi7udzhcCDQ'),
  ],

  /*****************************************/
  /* Blogs
  /*****************************************/
  blogs: [
    {
      href: 'https://www.builder.io/blog/resumability-from-ground-up',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2Fa6d8c3bacc3c4cf88446e41a71cda21c?format=webp&width=1200',
      title: 'Understanding Resumability from the Ground Up',
    },
    {
      href: 'https://www.builder.io/blog/speculative-module-fetching',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F72106cceede74975947a7686d083a38a?format=webp&width=1200',
      title: 'Speculative Module Fetching: a Modern Approach to Faster App Interactivity',
    },
    {
      href: 'https://www.builder.io/blog/wtf-is-code-extraction',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2Ff13459284f13474a828d6030d442c477?format=webp&width=1200',
      title: 'WTF Is Code Extraction',
    },
    {
      href: 'https://www.builder.io/blog/module-extraction-the-silent-web-revolution',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F0a8170ff2659474883ee032a0129cddd?format=webp&width=1200',
      title: 'Code Extraction: The Silent Web Revolution',
    },
    {
      href: 'https://www.builder.io/blog/usesignal-is-the-future-of-web-frameworks',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F0c790086a43f446a88bc03569a01bf73?format=webp&width=1200',
      title: 'useSignal() is the Future of Web Frameworks',
    },
    {
      href: 'https://www.builder.io/blog/qwik-city-server-functions',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F48d8fd6d22ae4c3b9c1ec4817ce4046d?format=webp&width=1200',
      title: 'Introducing Qwik City Server Functions',
    },
    {
      href: 'https://www.builder.io/blog/resumable-react-how-to-use-react-inside-qwik',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F9071a7def0b240e5b5ca6aab756e81b8?format=webp&width=1200',
      title: 'Resumable React: How to Use React Inside Qwik',
    },
    {
      href: 'https://www.builder.io/blog/resumability-vs-hydration',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2Ffc214101f7ed4e2fa61fd7d93ac880b1?format=webp&width=300',
      title: 'Resumability vs Hydration',
    },
    {
      href: 'https://www.builder.io/blog/the-qase-for-qwik-love-at-first-tti',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F69e3a278f34d4bfc9deb783dc705cd9a?format=webp&width=2000',
      title: 'The Qase for Qwik: Love At First TTI',
    },
    {
      href: 'https://www.builder.io/blog/movies-app-in-7-frameworks-which-is-fastest-and-why',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2Fcb655f8d61654e96a8c551404a834004?format=webp&width=2000',
      title: 'Movies app in 7 frameworks - which is fastest and why?',
    },
    {
      href: 'https://www.builder.io/blog/hydration-is-pure-overhead',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2Fa6d8c3bacc3c4cf88446e41a71cda21c?format=webp&width=2000',
      title: 'Hydration is Pure Overhead',
    },
    {
      href: 'https://www.builder.io/blog/why-progressive-hydration-is-harder-than-you-think',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F23067e673a904628bf62edb3a8ebfbd5?format=webp&width=2000',
      title: 'Why Progressive Hydration is Harder than You Think',
    },
    {
      href: 'https://www.builder.io/blog/why-is-builderio-creating-qwik-and-partytown',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F67a0b5b521fb4a5d9422d5555695c3e7?format=webp&width=2000',
      title: 'Why is Builder.io creating Qwik and Partytown?',
    },
    {
      href: 'https://www.builder.io/blog/dont-blame-the-developer-for-what-the-frameworks-did',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F0b20ce9152c143b798540cc2f61e89d1?format=webp&width=2000',
      title: "Don't blame the developer for what the frameworks did!",
    },
    {
      href: 'https://www.builder.io/blog/our-current-frameworks-are-on-we-need-o1',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F91dd9092a56a4cbf991e1b7d4e75569e?format=webp&width=2000',
      title: 'Our current frameworks are O(n); we need O(1)',
    },
    {
      href: 'https://www.builder.io/blog/streaming-is-it-worth-it',
      imgSrc:
        'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2Fbd10ac7b629341ee9526d03d000a06a8?format=webp&width=2000',
      title: 'Streaming: is it worth it?',
    },
    {
      href: 'https://dev.to/builderio/a-first-look-at-qwik-the-html-first-framework-af',
      imgSrc:
        'https://res.cloudinary.com/practicaldev/image/fetch/s--I8Btkl4y--/c_imagga_scale,f_auto,fl_progressive,h_500,q_auto,w_1000/https://dev-to-uploads.s3.amazonaws.com/uploads/articles/gl136wplgijcmgz4wly0.png',
      title: 'A first look at Qwik - the HTML first framework',
    },
    {
      href: 'https://dev.to/mhevery/death-by-closure-and-how-qwik-solves-it-44jj',
      imgSrc:
        'https://res.cloudinary.com/practicaldev/image/fetch/s--3-Um0T29--/c_imagga_scale,f_auto,fl_progressive,h_420,q_auto,w_1000/https://dev-to-uploads.s3.amazonaws.com/uploads/articles/tpbp3xiujhqbe9ycpti0.png',
      title: 'Death by Closure (and how Qwik solves it)',
    },
    {
      href: 'https://dev.to/builderio/html-first-javascript-last-the-secret-to-web-speed-4ic9',
      imgSrc:
        'https://res.cloudinary.com/practicaldev/image/fetch/s--DDi82wMF--/c_imagga_scale,f_auto,fl_progressive,h_420,q_auto,w_1000/https://dev-to-uploads.s3.amazonaws.com/uploads/articles/igcz0gwpcadh1mlrwj07.png',
      title: 'HTML-first, JavaScript last: the secret to web speed!',
    },
    {
      href: 'https://dev.to/mhevery/qwik-the-answer-to-optimal-fine-grained-lazy-loading-2hdp',
      imgSrc:
        'https://res.cloudinary.com/practicaldev/image/fetch/s--BSSeczM_--/c_imagga_scale,f_auto,fl_progressive,h_420,q_auto,w_1000/https://dev-to-uploads.s3.amazonaws.com/uploads/articles/tdhlus87hpih96oa0rbb.png',
      title: 'Qwik: the answer to optimal fine-grained lazy loading',
    },
    {
      href: 'https://dev.to/builderio/how-to-score-100-on-google-pagespeed-insights-on-mobile-2e0i',
      imgSrc:
        'https://res.cloudinary.com/practicaldev/image/fetch/s--pAtgTncG--/c_imagga_scale,f_auto,fl_progressive,h_420,q_auto,w_1000/https://dev-to-uploads.s3.amazonaws.com/uploads/articles/hbv99ammwti7euofkdxn.png',
      title: 'How to score 100 on Google PageSpeed Insights on Mobile',
    },
    {
      href: 'https://dev.to/builderio/your-bundler-is-doing-it-wrong-ic0',
      imgSrc:
        'https://res.cloudinary.com/practicaldev/image/fetch/s--MSdEMfio--/c_imagga_scale,f_auto,fl_progressive,h_420,q_auto,w_1000/https://dev-to-uploads.s3.amazonaws.com/uploads/articles/u9weo7picbo9wg5nt61e.png',
      title: 'Your bundler is doing it wrong',
    },
    {
      href: 'https://dev.to/builderio/how-we-cut-99-of-our-javascript-with-qwik-partytown-3i3k',
      imgSrc:
        'https://res.cloudinary.com/practicaldev/image/fetch/s--bvLSSb4K--/c_imagga_scale,f_auto,fl_progressive,h_420,q_auto,w_1000/https://dev-to-uploads.s3.amazonaws.com/uploads/articles/9ea4nlhnx1iq4rx814gj.jpg',
      title: 'How we cut 99% of our JavaScript with Qwik + Partytown',
    },
    {
      href: 'https://dev.to/builderio/introducing-qwik-starters-get-up-and-running-with-qwik-now-3ap2',
      imgSrc: '',
      title: 'Introducing Qwik starters - get up and running with Qwik now',
    },
  ],

  /*****************************************/
  /* Case Studies
  /*****************************************/

  ['case studies']: [
    {
      href: 'https://tzdesign.de/en/blog/how-10-engineers-deliver-exactly-what-the-browser-wants-with-qwik',
      imgSrc: '',
      title:
        'How 10 Engineers Deliver Exactly What the Browser Wants with Qwik - by Tobias Zimmermann',
    },
    {
      href: 'https://www.theseus.fi/bitstream/handle/10024/795367/Cao_Xuan-An.pdf',
      imgSrc: '',
      title:
        'HEADLESS CMS AND QWIK FRAMEWORK; their practicalities in the future of application development - by Xuan-An Cao',
    },
    {
      href: 'https://www.dropbox.com/s/fsznus0ynnbui1z/sci_2023_lonka_touko.pdf',
      imgSrc: '',
      title:
        'Improving the Initial Rendering Performance of React Applications Through Contemporary Rendering Approaches - by Touko Lonka',
    },
  ],

  /*****************************************/
  /* Resources
  /*****************************************/
  resources: [
    {
      href: 'https://docs.google.com/presentation/d/1q0eILmAAdFyE0tHkvd_fSuFtcHsHzUn0nZnz5FDgU4k/edit#slide=id.gff298a2a9a_1_2',
      title: 'Qwik City - Google Presentation Template',
    },
    {
      href: 'https://docs.google.com/presentation/d/1Jj1iw0lmaecxtUpqyNdF1aBzbCVnSlbPGLbOpN2xydc/edit#slide=id.g13225ffe116_6_234',
      title: 'Qwik - Google Presentation Template',
    },
    {
      href: 'https://docs.google.com/presentation/d/1cGbC-FFMrLCQ62YDGG17jf3Eh0hqwMBlyDQZGeoFNyw/edit#slide=id.g1620a79b097_0_300',
      title: 'Qwik the O(1) framework',
    },
    { href: '/logos/qwik-logo.svg', title: 'Qwik Logo [svg]' },
    { href: '/logos/qwik.svg', title: 'Qwik Logo and Text [svg]' },
    { href: '/logos/qwik.png', title: 'Qwik Logo and Text [png]' },
  ],
});

export interface MediaEntry {
  title: string;
  href: string;
  language?: string;
  imgSrc?: string;
  promoted?: boolean;
}

export const ThumbnailLink = component$((props: { entry: MediaEntry; imgLoading?: 'eager' }) => {
  return (
    <li>
      <a href={props.entry.href} target="_blank" rel="noreferrer">
        <img
          src={props.entry.imgSrc ? props.entry.imgSrc : '/ecosystem/qwik-blog-fallback.png'}
          loading={props.imgLoading === 'eager' ? undefined : 'lazy'}
          decoding={props.imgLoading === 'eager' ? undefined : 'async'}
          aria-hidden="true"
        />
        <p class="text-center">{props.entry.title}</p>
      </a>
    </li>
  );
});

export const BulletLink = component$((props: { entry: MediaEntry }) => {
  return (
    <li>
      <a href={props.entry.href} target="_blank" rel="noreferrer">
        {props.entry.title}
      </a>
    </li>
  );
});

export const Section = component$(
  (props: {
    id: keyof typeof MEDIA;
    listStyle: 'thumbnails' | 'bullets';
    imgLoading?: 'eager';
  }) => {
    const entriesInOtherLanguages: MediaEntry[] = [];
    return (
      <section id={props.id} class="scroll-m-16 md:scroll-m-20">
        <h2>
          <a class="capitalize" href={`#${props.id}`}>
            {props.id}
          </a>
        </h2>

        <ul class={props.listStyle}>
          {MEDIA[props.id].map((entry) => {
            if (entry.language && entry.language !== 'en') {
              entriesInOtherLanguages.push(entry);
              return null;
            }
            if (props.listStyle === 'thumbnails') {
              return <ThumbnailLink entry={entry} imgLoading={props.imgLoading} />;
            }
            return <BulletLink entry={entry} />;
          })}
        </ul>

        {(entriesInOtherLanguages.length && (
          <>
            <h3>Other languages</h3>
            <ul class={props.listStyle}>
              {entriesInOtherLanguages.map((entry) =>
                props.listStyle === 'thumbnails' ? (
                  <ThumbnailLink entry={entry} imgLoading={props.imgLoading} />
                ) : (
                  <BulletLink entry={entry} />
                )
              )}
            </ul>
          </>
        )) ||
          null}
      </section>
    );
  }
);

export default component$(() => {
  useStyles$(styles);
  return (
    <article class="media">
      <h1>Qwik Courses, Presentations, Talks, Videos and Podcasts</h1>

      <Section id="courses" listStyle="thumbnails" imgLoading="eager" />

      <Section id="videos" listStyle="thumbnails" imgLoading="eager" />

      <Section id="podcasts" listStyle="thumbnails" />

      <Section id="presentations" listStyle="thumbnails" />

      <Section id="blogs" listStyle="thumbnails" />

      <Section id="case studies" listStyle="bullets" />

      <Section id="resources" listStyle="bullets" />

      <section>
        <h2>Add Media</h2>
        <p>This page missing any great resources or in need of an update?</p>
        <p>
          <a
            href="https://github.com/BuilderIO/qwik/edit/main/packages/docs/src/routes/(ecosystem)/media/index.tsx"
            target="_blank"
            class="edit-page"
          >
            Edit this page!
          </a>
        </p>
      </section>
    </article>
  );
});

/**
 * A helper for defining YouTube Media Entries
 */
export function youtube(
  title: string,
  id: string,
  {
    startTime,
    playlist,
    language = 'en',
    promoted = false,
  }: { startTime?: number; playlist?: string; language?: string; promoted?: boolean } = {}
): MediaEntry {
  const url = new URL('https://www.youtube.com/watch');
  url.searchParams.append('v', id);
  // if there's a start_time and it's not 0
  if (startTime) {
    url.searchParams.append('t', startTime.toString());
  }
  if (playlist) {
    url.searchParams.append('list', playlist);
  }
  return {
    href: url.href,
    imgSrc: `https://i3.ytimg.com/vi/${id}/hqdefault.jpg`,
    title,
    language,
    promoted,
  };
}

export const head: DocumentHead = {
  title: 'Qwik Presentations, Talks, Videos and Podcasts',
};

// Media Listing

// Helper function to allow autocompletions for Media Entries and Record keys
export function mediaObj<T extends string>(obj: Record<T, MediaEntry[]>) {
  return obj;
}
