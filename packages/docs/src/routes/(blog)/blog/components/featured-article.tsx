import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import { Image } from 'qwik-image';
import { blogArticles } from '../../data';
import { ClockIcon } from '../icons/clock-icon';

export const FeaturedArticle = component$(() => {
  return (
    <article class="relative group cursor-pointer">
      <Link href={blogArticles[0].path}>
        <div class="relative max-w-[1200px] overflow-hidden rounded-xl">
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
          <h2 class="pb-4 text-3xl font-bold leading-tight hover:text-slate-200 transition-colors">
            {blogArticles[0].title}
          </h2>
          <div class="pb-4">
            {blogArticles[0].tags.map((tag, key) => (
              <span
                key={key}
                class="mb-4 px-3 py-1 mr-2 text-xs text-[#0e201a] bg-white rounded-full backdrop-blur-xs"
              >
                {tag}
              </span>
            ))}
          </div>
          <div class="mb-4 flex items-center space-x-4 text-sm">
            <div class="flex items-center">
              <ClockIcon />
              <span>{blogArticles[0].readingTime || '5'} min read</span>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
});
