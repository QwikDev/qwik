/**
 * Menu used to create the tutorial navigation and steps.
 */
export const menu: TutorialMenu = [
  {
    title: 'Introduction',
    items: [
      {
        title: 'Basics',
        path: '/tutorial/introduction/basics',
      },
      {
        title: 'Lazy Loading',
        path: '/tutorial/introduction/lazy-loading',
      },
    ],
  },
  {
    title: 'Reactivity',
    items: [
      {
        title: 'Assignments',
        path: '/tutorial/reactivity/assignments',
      },
    ],
  },
];

export const menuItems: TutorialItem[] = [];
menu.forEach((s) => menuItems.push(...s.items));

export type TutorialMenu = TutorialSection[];

export interface TutorialSection {
  title: string;
  items: TutorialItem[];
}

export interface TutorialItem {
  title: string;
  path: string;
}
