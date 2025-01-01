import { component$ } from '@builder.io/qwik';
import { useDocumentHead } from '@builder.io/qwik-city';
import { Image } from 'qwik-image';

type Props = { imageSrc: string; authorLink: string };

export const ArticleHero = component$<Props>(({ imageSrc, authorLink }) => {
  const { title, frontmatter } = useDocumentHead();

  if (!frontmatter.authorName || !frontmatter.tags || !frontmatter.date) {
    return <>Missing frontmatter props</>;
  }

  return (
    <>
      <div class="pt-4">
        <a
          class="text-[color:var(--text-color)] flex items-center space-x-1 pl-2"
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
        </a>
      </div>
      <div class="max-w-[1000px] pb-8 mx-auto">
        <div class="flex flex-col justify-center">
          <h4 class="text-xl text-[color:var(--qwik-blue)] font-semibold uppercase text-center pt-6 tracking-wide">
            {frontmatter.tags.map((tag: string) => (
              <span class="pr-2">{tag}</span>
            ))}
          </h4>
          <h1 class="text-[48px] text-[color:var(--text-color)] font-bold text-center tracking-wide pt-6">
            {title}
          </h1>
          <div class="flex justify-center pt-8 pb-10 text-[color:var(--text-color)] text-xl">
            <h4 class="font-semibold uppercase text-center">{frontmatter.date}</h4>
            <div class="border border-[color:var(--text-color)] mx-4"></div>
            <div class="font-semibold uppercase text-center">
              Written By{' '}
              <a
                class="text-[color:var(--qwik-blue)]"
                target="_blank"
                rel="noopener"
                href={authorLink}
              >
                {frontmatter.authorName}
              </a>
            </div>
          </div>
        </div>
      </div>
      <div class="relative h-[400px] w-full bg-[color:var(--text-color)] mb-8">
        <Image class="w-full h-full object-cover" alt={title} src={imageSrc} layout="fullWidth" />
      </div>
    </>
  );
});
