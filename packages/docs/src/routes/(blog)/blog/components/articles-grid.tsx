import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import { Image } from 'qwik-image';
import { blogArticles } from '../../data';
import { lucide } from '@qds.dev/ui';
import { ArticleTag } from './article-tag';

export const ArticlesGrid = component$(() => {
  return (
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
      {blogArticles.map((post, key) => (
        <article
          key={key}
          class="group rounded-2xl border-[1.6px] border-border-base bg-background-base shadow-base cursor-pointer overflow-hidden"
        >
          <Link href={post.path}>
            <div class="relative h-48 overflow-hidden">
              <Image
                layout="constrained"
                class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                src={post.image}
                alt={post.title}
              />
            </div>

            <div class="p-6">
              <h3 class="pb-4 text-h6 font-heading font-bold min-h-[72px] transition-colors">
                {post.title}
              </h3>

              <div class="pb-4">
                {post.tags.map((tag, key) => (
                  <ArticleTag key={key} tag={tag} />
                ))}
              </div>
              <div class="flex items-center space-x-2">
                <lucide.clock2 class="size-[18px] text-primary-standalone-base" />
                <span class="text-body-sm">{post.readingTime || '5'} min read</span>
              </div>
            </div>
          </Link>
        </article>
      ))}
    </div>
  );
});
