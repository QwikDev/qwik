import { component$ } from '@builder.io/qwik';
import BuilderContentComp from '../../components/builder-content';
import { BUILDER_FOOTER_MODEL, BUILDER_PUBLIC_API_KEY } from '../../constants';

export const Footer = component$(() => {
  return (
    <footer class="container mx-auto">
      <BuilderContentComp apiKey={BUILDER_PUBLIC_API_KEY} model={BUILDER_FOOTER_MODEL} tag="div" />
    </footer>
  );
});
