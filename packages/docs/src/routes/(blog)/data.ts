type BlogArticle = {
  title: string;
  image: string;
  featuredImage: string;
  path: string;
  tags: string[];
};

export const blogArticles: BlogArticle[] = [
  {
    title: 'Example',
    image: 'https://placehold.co/400x200',
    featuredImage: 'https://placehold.co/1200x400',
    path: '/blog/qwik-next-leap',
    tags: ['Web development'],
  },
  {
    title: 'Example',
    image: 'https://placehold.co/400x200',
    featuredImage: 'https://placehold.co/1200x400',
    path: '/blog/qwik-next-leap',
    tags: ['Web development'],
  },
  {
    title: 'Example',
    image: 'https://placehold.co/400x200',
    featuredImage: 'https://placehold.co/1200x400',
    path: '/blog/qwik-next-leap',
    tags: ['Web development'],
  },
];
