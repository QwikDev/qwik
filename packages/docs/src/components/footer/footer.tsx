import { component$ } from '@builder.io/qwik';
import BuilderContentComp from '../../components/builder-content';
import { BUILDER_FOOTER_MODEL, BUILDER_PUBLIC_API_KEY } from '../../constants';
import { QwikLogo } from '../svgs/qwik-logo';

export const Footer = component$(() => {
  return (
    <>
      <footer class="mx-auto">
        <div class="flex justify-center flex-wrap max-w-screen-xl px-4">
          <div class="flex-1">
            <QwikLogo width={210} height={110} />
          </div>
          <div class="flex flex-1 gap-y-4 gap-x-20 text-xs">
            <div class="flex flex-col gap-4 flex-1">
              <a class="hover:text-interactive-blue" href="https://qwik.dev/docs/">
                Docs
              </a>
              <a class="hover:text-interactive-blue" href="https://qwik.dev/docs/qwikcity/">
                Qwik City
              </a>
              <a class="hover:text-interactive-blue" href="https://qwik.dev/ecosystem/">
                Ecosystem
              </a>
              <a class="hover:text-interactive-blue" href="https://qwik.dev/playground/">
                Playground
              </a>
            </div>
            <div class="flex flex-col gap-4 flex-1">
              <a
                class="hover:text-interactive-blue"
                href="https://qwik.dev/ecosystem/#integrations"
              >
                Integrations
              </a>
              <a class="hover:text-interactive-blue" href="https://qwik.dev/ecosystem/#deployments">
                Deployments
              </a>
              <a class="hover:text-interactive-blue" href="">
                Media
              </a>
              <a class="hover:text-interactive-blue" href="">
                Showcase
              </a>
            </div>
            <div class="flex flex-col gap-4 flex-1">
              <a class="hover:text-interactive-blue" href="">
                Tutorial
              </a>
              <a class="hover:text-interactive-blue" href="">
                Presentations
              </a>
              <a class="hover:text-interactive-blue" href="">
                Community
              </a>
            </div>
          </div>
        </div>
      </footer>
      <BuilderContentComp apiKey={BUILDER_PUBLIC_API_KEY} model={BUILDER_FOOTER_MODEL} tag="div" />
    </>
  );
});
