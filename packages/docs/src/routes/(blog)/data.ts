import fontlessImage from './blog/(articles)/fontless/fontless-hero.webp';
import preloaderImage from './blog/(articles)/qwik-1-14-preloader/qwik-preloader-hero.webp';

export const authors: Record<string, { socialLink: string }> = {
  'The Qwik Team': { socialLink: 'https://bsky.app/profile/qwik.dev' },
  'Jack Shelton': { socialLink: 'https://x.com/TheJackShelton' },
  'Vishwas Gopinath': { socialLink: 'https://x.com/CodevolutionWeb' },
  'Manu Mtz.-Almeida': { socialLink: 'https://x.com/manucorporat' },
  'Steve Sewell': { socialLink: 'https://x.com/steve8708' },
  'Yoav Ganbar': { socialLink: 'https://x.com/HamatoYogi' },
  'Miško Hevery': { socialLink: 'https://x.com/mhevery' },
  'Maïeul Chevalier': { socialLink: 'https://x.com/maiieul' },
  'Shai Reznik': { socialLink: 'https://x.com/shai_reznik' },
  'Wout Mertens': { socialLink: 'https://x.com/woutmertens' },
  'Giorgio Boa': { socialLink: 'https://github.com/gioboa' },
};

type BlogArticle = {
  title: string;
  image: string;
  path: string;
  tags: string[];
  featuredTitlePosition?: 'top' | 'bottom' | 'none';
  readingTime: number;
};

export const blogArticles: BlogArticle[] = [
  {
    title: 'Effortlessly optimize web fonts with fontless.',
    image: fontlessImage,
    path: '/blog/fontless/',
    tags: ['Fontaine', 'Qwik'],
    featuredTitlePosition: 'top',
    readingTime: 2,
  },
  {
    title: 'Introducing the Qwik Preloader',
    image: preloaderImage,
    path: '/blog/qwik-1-14-preloader/',
    tags: ['Qwik'],
    readingTime: 10,
  },
  {
    title: 'Moving Forward Together',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F78b0d6ebdc154e2db77876ec00aef6f7',
    path: '/blog/qwik-next-leap/',
    tags: ['Web Development'],
    readingTime: 3,
  },
  {
    title: 'Towards Qwik 2.0: Lighter, Faster, Better',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F9dd98bcf8fee4b42a718449c5151d53d',
    path: '/blog/qwik-2-coming-soon/',
    tags: ['Qwik'],
    readingTime: 9,
  },
  {
    title: 'Astro + Qwik: Houston, we have Resumability!',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F2418eac0b25046b197bf7b8bf5dfd637',
    path: '/blog/astro-qwik/',
    tags: ['Qwik'],
    readingTime: 4,
  },
  {
    title: 'Qwik Router: A Visual Guide',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F4f52dab5f87142a38002269540e69cef',
    path: '/blog/qwik-city-routing/',
    tags: ['Web Development'],
    readingTime: 11,
  },
  {
    title: 'Qwik 1.2: Performance in Autopilot',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F447d6d0349d4442496c3d7e246ce3d24',
    path: '/blog/qwik-1-2-performance-autopilot/',
    tags: ['Web Development'],
    readingTime: 10,
  },
  {
    title: "Boost Your Site Perf with Qwik's useVisibleTask$ Hook",
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F5d90a118ceac4678a9e0576e61a955a9',
    path: '/blog/qwik-tasks/',
    tags: ['Web Development'],
    readingTime: 4,
  },
  {
    title: 'Qwik Reaches v1.0',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2Fca46e4da83b7429ea159e2a42a197288',
    path: '/blog/qwik-v1/',
    tags: ['Qwik'],
    readingTime: 5,
  },
  {
    title: 'Type Safe Forms in Qwik with Modular Forms',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F7abec2f848764aa99fead32861505344',
    path: '/blog/type-safe-forms-in-qwik/',
    tags: ['Web Development'],
    readingTime: 8,
  },
  {
    title: 'Qwik Reaches RC Milestone',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F043bec968cb7465fac152147b9e5bd57',
    path: '/blog/qwik-rc-milestone/',
    tags: ['Qwik'],
    readingTime: 2,
  },
  {
    title: 'Building Framer Motion Animations with Qwik',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2Fbf1420524b2241619cc68efbba7b7c13',
    path: '/blog/framer-motion-qwik/',
    tags: ['Web Development'],
    readingTime: 7,
  },
  {
    title: 'Code Extraction: The Silent Web Revolution',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F0a8170ff2659474883ee032a0129cddd',
    path: '/blog/module-extraction-the-silent-web-revolution/',
    tags: ['Qwik'],
    readingTime: 9,
  },
  {
    title: 'Introducing Qwik City Server Functions',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F48d8fd6d22ae4c3b9c1ec4817ce4046d',
    path: '/blog/qwik-city-server-functions/',
    tags: ['Qwik'],
    readingTime: 6,
  },
  {
    title: 'Resumable React: How to Use React Inside Qwik',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F9071a7def0b240e5b5ca6aab756e81b8',
    path: '/blog/resumable-react-how-to-use-react-inside-qwik/',
    tags: ['Web Development'],
    readingTime: 8,
  },
  {
    title: 'The Qase for Qwik: Love At First TTI',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F69e3a278f34d4bfc9deb783dc705cd9a',
    path: '/blog/the-qase-for-qwik-love-at-first-tti/',
    tags: ['Qwik'],
    readingTime: 18,
  },
  {
    title: 'Qwik and Qwik City have reached beta! 🎉',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F5f8db18f68c74f6f9919f3877b6246b4',
    path: '/blog/qwik-and-qwik-city-have-reached-beta/',
    tags: ['Web Development'],
    readingTime: 3,
  },
  {
    title: 'Introducing Qwik starters - get up and running with Qwik now',
    image:
      'https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F85209017e99f4753a56614f6712817c5',
    path: '/blog/introducing-qwik-starters/',
    tags: ['Qwik'],
    readingTime: 1,
  },
];
