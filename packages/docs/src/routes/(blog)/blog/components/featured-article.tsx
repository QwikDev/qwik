import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import { Image } from 'qwik-image';
import { blogArticles } from '../../data';
import { lucide } from '@qds.dev/ui';
import { ArticleTag } from './article-tag';

export const FeaturedArticle = component$(() => {
  return (
    <article class="relative group cursor-pointer">
      <Link href={blogArticles[0].path}>
        <div class="relative max-w-[1280px] overflow-hidden rounded-xl border-b-[1.6px] border-border-base bg-background-accent shadow-base">
          <Image
            layout="fullWidth"
            objectFit="fill"
            class="transform group-hover:scale-105 transition-transform duration-500"
            src={blogArticles[0].image}
            alt={blogArticles[0].title}
          />
        </div>

        <div
          class={{
            'hidden md:block absolute p-14 text-white': true,
            'bottom-0': blogArticles[0].featuredTitlePosition === 'bottom',
            'top-0': blogArticles[0].featuredTitlePosition === 'top',
            hidden: blogArticles[0].featuredTitlePosition === 'none',
          }}
        >
          <h2 class="pb-4 text-h5 font-heading leading-tight transition-colors">
            {blogArticles[0].title}
          </h2>
          <div class="pb-4">
            {blogArticles[0].tags.map((tag, key) => (
              <ArticleTag key={key} tag={tag} />
            ))}
          </div>
          <div class="mb-4 flex items-center space-x-4 text-sm">
            <div class="flex items-center gap-2">
              <lucide.clock2 class="size-[18px] text-border-base" />
              <span class="text-body-sm text-alert-foreground-base">
                {blogArticles[0].readingTime || '5'} min read
              </span>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
});
