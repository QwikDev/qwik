import { component$ } from '@qwik.dev/core';
import { Link, useDocumentHead } from '@qwik.dev/router';
import { Image } from 'qwik-image';

type Props = { image: string; authorLinks: string[] };

export const ArticleHero = component$<Props>(({ image, authorLinks }) => {
  const { title, frontmatter } = useDocumentHead();

  if (
    !frontmatter.authors ||
    !Array.isArray(frontmatter.authors) ||
    frontmatter.authors.length === 0 ||
    !frontmatter.tags ||
    !frontmatter.date
  ) {
    return <>Missing frontmatter props or authors array is empty</>;
  }

  return (
    <>
      <div class="pt-4">
        <Link
          class="flex items-center space-x-1 pl-2 text-[color:var(--text-color)]"
          rel="noopener"
          href="/blog"
        >
          <svg
            aria-hidden="true"
            height="16"
            viewBox="0 0 16 16"
            version="1.1"
            width="16"
            data-view-component="true"
            fill="currentcolor"
          >
            <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z"></path>
          </svg>
          <span class="text-xl">Back to blog</span>
        </Link>
      </div>
      <div class="mx-auto max-w-[1000px] pb-8">
        <div class="flex flex-col justify-center">
          <h4 class="pt-6 text-center text-xl font-semibold tracking-wide text-[color:var(--qwik-blue)] uppercase">
            {frontmatter.tags.map((tag: string) => (
              <span class="pr-2">{tag}</span>
            ))}
          </h4>
          <h1 class="pt-6 text-center text-[48px] font-bold tracking-wide text-[color:var(--text-color)]">
            {title}
          </h1>
          <div class="flex justify-center pt-8 pb-10 text-xl text-[color:var(--text-color)]">
            <h4 class="text-center font-semibold uppercase">{frontmatter.date}</h4>
            <div class="mx-4 border border-[color:var(--text-color)]"></div>
            <div class="text-center font-semibold uppercase">
              {frontmatter.authors.length > 1 && 'Co-'}Written by{' '}
              {frontmatter.authors.map((author: string, index: number) => (
                <span key={author}>
                  <a
                    class="text-[color:var(--qwik-blue)]"
                    target="_blank"
                    rel="noopener"
                    href={authorLinks[index]}
                  >
                    {author}
                  </a>
                  {index < frontmatter.authors.length - 1 &&
                    (index === frontmatter.authors.length - 2 ? ' & ' : ', ')}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div class="relative max-w-[1200px] bg-[color:var(--text-color)]">
        <Image alt={title} src={image} layout="fullWidth" class="max-w-[1200px]" />
      </div>
    </>
  );
});
