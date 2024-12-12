import { Image } from 'qwik-image';
import { ClockIcon } from '../icons/clock-icon';
import { blogArticles } from '../../data';
import { component$ } from '@builder.io/qwik';

export const FeaturedPost = component$(() => {
  return (
    <article class="relative group cursor-pointer">
      <a href={blogArticles[0].path}>
        <div class="relative h-96 overflow-hidden rounded-xl">
          <Image
            layout="constrained"
            class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
            src={blogArticles[0].featuredImage}
            alt={blogArticles[0].title}
          />
        </div>

        <div class="absolute bottom-0 p-6 text-white">
          <h2 class="pb-4 text-3xl font-bold leading-tight hover:text-slate-200 transition-colors">
            {blogArticles[0].title}
          </h2>
          <div class="pb-2">
            {blogArticles[0].tags.map((tag, key) => (
              <span
                key={key}
                class="mb-4 px-3 py-1 mr-2 text-xs text-[color:var(--text-color)] bg-[color:var(--bg-color)] rounded-full backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>
          <div class="mb-4 flex items-center space-x-4 text-sm">
            <div class="flex items-center">
              <ClockIcon />
              <span>5 min read</span>
            </div>
          </div>
        </div>
      </a>
    </article>
  );
});
