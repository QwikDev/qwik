import fontlessImage from './blog/(articles)/fontless/fontless-hero.webp';
import preloaderImage from './blog/(articles)/qwik-1-14-preloader/qwik-preloader-hero.webp';
import hydrationSabotagesHero from './blog/(articles)/hydration-sabotages-lazy-loading/hero.webp';
import workerJsxHero from './blog/(articles)/worker-multi-thread-jsx/hero.webp';
import reactivityHero from './blog/(articles)/reactivity-across-frameworks/hero.webp';
import resumabilityGroundUpHero from './blog/(articles)/resumability-from-ground-up/hero.webp';
import resumabilityVsHydrationHero from './blog/(articles)/resumability-vs-hydration/hero.webp';
import howPartytownWorksHero from './blog/(articles)/how-partytown-works/hero.webp';
import whyBuilderHero from './blog/(articles)/why-is-builderio-creating-qwik-and-partytown/hero.webp';
import progressiveHydrationHero from './blog/(articles)/why-progressive-hydration-is-harder-than-you-think/hero.webp';
import partytownBetaHero from './blog/(articles)/partytown-is-now-in-beta/hero.webp';
import cut99Hero from './blog/(articles)/how-we-cut-99-percent-js-with-qwik-and-partytown/hero.webp';
import deathByClosureHero from './blog/(articles)/death-by-closure/hero.webp';
import introducingQwikHero from './blog/(articles)/introducing-qwik-framework/hero.webp';
import qwikNextLeapHero from './blog/(articles)/qwik-next-leap/hero.webp';
import qwik2ComingSoonHero from './blog/(articles)/qwik-2-coming-soon/hero.webp';
import astroQwikHero from './blog/(articles)/astro-qwik/hero.webp';
import qwikCityRoutingHero from './blog/(articles)/qwik-city-routing/hero.webp';
import qwik12PerfHero from './blog/(articles)/qwik-1-2-performance-autopilot/hero.webp';
import qwikTasksHero from './blog/(articles)/qwik-tasks/hero.webp';
import qwikV1Hero from './blog/(articles)/qwik-v1/hero.webp';
import typeSafeFormsHero from './blog/(articles)/type-safe-forms-in-qwik/hero.webp';
import qwikRcMilestoneHero from './blog/(articles)/qwik-rc-milestone/hero.webp';
import framerMotionHero from './blog/(articles)/framer-motion-qwik/hero.webp';
import moduleExtractionHero from './blog/(articles)/module-extraction-the-silent-web-revolution/hero.webp';
import qwikCityServerFnHero from './blog/(articles)/qwik-city-server-functions/hero.webp';
import resumableReactHero from './blog/(articles)/resumable-react-how-to-use-react-inside-qwik/hero.webp';
import qaseForQwikHero from './blog/(articles)/the-qase-for-qwik-love-at-first-tti/hero.webp';
import qwikCityBetaHero from './blog/(articles)/qwik-and-qwik-city-have-reached-beta/hero.webp';
import qwikStartersHero from './blog/(articles)/introducing-qwik-starters/hero.webp';

export const authors: Record<string, { socialLink: string }> = {
  'The Qwik Team': { socialLink: 'https://bsky.app/profile/qwik.dev' },
  'Jack Shelton': { socialLink: 'https://x.com/TheJackShelton' },
  'Vishwas Gopinath': { socialLink: 'https://x.com/CodevolutionWeb' },
  'Manu Mtz.-Almeida': { socialLink: 'https://x.com/manucorporat' },
  'Adam Bradley': { socialLink: 'https://x.com/adamdbradley' },
  'Alex Patterson': { socialLink: 'https://x.com/codercatdev' },
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
    image: qwikNextLeapHero,
    path: '/blog/qwik-next-leap/',
    tags: ['Web Development'],
    readingTime: 3,
  },
  {
    title: 'Towards Qwik 2.0: Lighter, Faster, Better',
    image: qwik2ComingSoonHero,
    path: '/blog/qwik-2-coming-soon/',
    tags: ['Qwik'],
    readingTime: 9,
  },
  {
    title: 'Astro + Qwik: Houston, we have Resumability!',
    image: astroQwikHero,
    path: '/blog/astro-qwik/',
    tags: ['Qwik'],
    readingTime: 4,
  },
  {
    title: 'Qwik Router: A Visual Guide',
    image: qwikCityRoutingHero,
    path: '/blog/qwik-city-routing/',
    tags: ['Web Development'],
    readingTime: 11,
  },
  {
    title: 'Qwik 1.2: Performance in Autopilot',
    image: qwik12PerfHero,
    path: '/blog/qwik-1-2-performance-autopilot/',
    tags: ['Web Development'],
    readingTime: 10,
  },
  {
    title: "Boost Your Site Perf with Qwik's useVisibleTask$ Hook",
    image: qwikTasksHero,
    path: '/blog/qwik-tasks/',
    tags: ['Web Development'],
    readingTime: 4,
  },
  {
    title: 'Qwik Reaches v1.0',
    image: qwikV1Hero,
    path: '/blog/qwik-v1/',
    tags: ['Qwik'],
    readingTime: 5,
  },
  {
    title: 'Type Safe Forms in Qwik with Modular Forms',
    image: typeSafeFormsHero,
    path: '/blog/type-safe-forms-in-qwik/',
    tags: ['Web Development'],
    readingTime: 8,
  },
  {
    title: 'Qwik Reaches RC Milestone',
    image: qwikRcMilestoneHero,
    path: '/blog/qwik-rc-milestone/',
    tags: ['Qwik'],
    readingTime: 2,
  },
  {
    title: 'Building Framer Motion Animations with Qwik',
    image: framerMotionHero,
    path: '/blog/framer-motion-qwik/',
    tags: ['Web Development'],
    readingTime: 7,
  },
  {
    title: 'Code Extraction: The Silent Web Revolution',
    image: moduleExtractionHero,
    path: '/blog/module-extraction-the-silent-web-revolution/',
    tags: ['Qwik'],
    readingTime: 9,
  },
  {
    title: 'Introducing Qwik City Server Functions',
    image: qwikCityServerFnHero,
    path: '/blog/qwik-city-server-functions/',
    tags: ['Qwik'],
    readingTime: 6,
  },
  {
    title: 'Resumable React: How to Use React Inside Qwik',
    image: resumableReactHero,
    path: '/blog/resumable-react-how-to-use-react-inside-qwik/',
    tags: ['Web Development'],
    readingTime: 8,
  },
  {
    title: 'The Qase for Qwik: Love At First TTI',
    image: qaseForQwikHero,
    path: '/blog/the-qase-for-qwik-love-at-first-tti/',
    tags: ['Qwik'],
    readingTime: 18,
  },
  {
    title: 'Qwik and Qwik City have reached beta! 🎉',
    image: qwikCityBetaHero,
    path: '/blog/qwik-and-qwik-city-have-reached-beta/',
    tags: ['Web Development'],
    readingTime: 3,
  },
  {
    title: 'Introducing Qwik starters - get up and running with Qwik now',
    image: qwikStartersHero,
    path: '/blog/introducing-qwik-starters/',
    tags: ['Qwik'],
    readingTime: 1,
  },
  {
    title: 'Hydration, the Saboteur of Lazy Loading',
    image: hydrationSabotagesHero,
    path: '/blog/hydration-sabotages-lazy-loading/',
    tags: ['Qwik'],
    readingTime: 12,
  },
  {
    title: 'Effortless Multi-threading in JSX with worker$',
    image: workerJsxHero,
    path: '/blog/worker-multi-thread-jsx/',
    tags: ['Qwik'],
    readingTime: 6,
  },
  {
    title: 'Unveiling the Magic: Exploring Reactivity Across Various Frameworks',
    image: reactivityHero,
    path: '/blog/reactivity-across-frameworks/',
    tags: ['Web Development'],
    readingTime: 9,
  },
  {
    title: 'Understanding Resumability from the Ground Up',
    image: resumabilityGroundUpHero,
    path: '/blog/resumability-from-ground-up/',
    tags: ['Qwik'],
    readingTime: 12,
  },
  {
    title: 'Resumability vs Hydration',
    image: resumabilityVsHydrationHero,
    path: '/blog/resumability-vs-hydration/',
    tags: ['Qwik'],
    readingTime: 8,
  },
  {
    title: 'How Partytown Works',
    image: howPartytownWorksHero,
    path: '/blog/how-partytown-works/',
    tags: ['Partytown'],
    readingTime: 7,
  },
  {
    title: 'Why is Builder.io creating Qwik and Partytown?',
    image: whyBuilderHero,
    path: '/blog/why-is-builderio-creating-qwik-and-partytown/',
    tags: ['Qwik', 'Partytown'],
    readingTime: 4,
  },
  {
    title: 'Why Progressive Hydration is Harder than You Think',
    image: progressiveHydrationHero,
    path: '/blog/why-progressive-hydration-is-harder-than-you-think/',
    tags: ['Web Development'],
    readingTime: 7,
  },
  {
    title: "You're invited to Partytown! Partytown is now in Beta",
    image: partytownBetaHero,
    path: '/blog/partytown-is-now-in-beta/',
    tags: ['Partytown'],
    readingTime: 4,
  },
  {
    title: 'How we cut 99% of our JavaScript with Qwik + Partytown',
    image: cut99Hero,
    path: '/blog/how-we-cut-99-percent-js-with-qwik-and-partytown/',
    tags: ['Qwik', 'Partytown'],
    readingTime: 6,
  },
  {
    title: 'Death by Closure (and how Qwik solves it)',
    image: deathByClosureHero,
    path: '/blog/death-by-closure/',
    tags: ['Qwik'],
    readingTime: 5,
  },
  {
    title: 'A first look at Qwik - the HTML first framework',
    image: introducingQwikHero,
    path: '/blog/introducing-qwik-framework/',
    tags: ['Qwik'],
    readingTime: 5,
  },
];
