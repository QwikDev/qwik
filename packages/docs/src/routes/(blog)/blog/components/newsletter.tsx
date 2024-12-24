import { component$ } from '@builder.io/qwik';
import { SendIcon } from '../icons/send-icon';

export const Newsletter = component$(() => {
  return (
    <section class="bg-slate-900 text-white py-16 px-4 sm:px-6 lg:px-8 rounded-xl">
      <div class="max-w-2xl mx-auto text-center">
        <h2 class="text-3xl font-bold">Stay Updated</h2>
        <p class="mt-4 text-slate-300">
          Get the latest articles and insights delivered straight to your inbox.
        </p>

        <form class="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <input
            type="email"
            placeholder="Enter your email"
            class="px-4 py-3 rounded-lg bg-white/10 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 flex-grow max-w-md placeholder:text-slate-400"
          />
          <button
            type="submit"
            class="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-white text-slate-900 hover:bg-slate-100 transition-colors font-medium"
          >
            Subscribe
            <SendIcon />
          </button>
        </form>
      </div>
    </section>
  );
});
