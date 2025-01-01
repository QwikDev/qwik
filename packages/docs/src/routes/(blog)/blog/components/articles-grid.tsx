import { Image } from 'qwik-image';
import { blogArticles } from '../../data';
import { ClockIcon } from '../icons/clock-icon';
import { component$ } from '@builder.io/qwik';

export const ArticlesGrid = component$(() => {
  return (
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {blogArticles.map((post, key) => (
        <article
          key={key}
          class="group bg-[color:var(--text-color)] rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow duration-300 cursor-pointer"
        >
          <a href={post.path}>
            <div class="relative h-48 overflow-hidden">
              <Image
                layout="constrained"
                class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                src={post.image}
                alt={post.title}
              />
            </div>

            <div class="p-6">
              <h3 class="pb-4 text-xl font-bold text-[color:var(--bg-color)] group-hover:opacity-70 transition-colors">
                {post.title}
              </h3>

              <div class="pb-2">
                {blogArticles[0].tags.map((tag, key) => (
                  <span
                    key={key}
                    class="px-3 py-1 mr-2 text-xs font-semibold text-[color:var(--text-color)] bg-[color:var(--bg-color)] rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div class="flex items-center space-x-4 text-sm text-[color:var(--bg-color)]">
                <div class="flex items-center">
                  <ClockIcon />
                  <span>5 min read</span>
                </div>
              </div>
            </div>
          </a>
        </article>
      ))}
    </div>
  );
});
