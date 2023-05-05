import { component$, Slot, useStyles$ } from '@builder.io/qwik'; 
import { ContentNav } from '../../components/content-nav/content-nav';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import apiStyles from './api.css?inline';
import docsStyles from '../docs/docs.css?inline';

export default component$(() => { 
  useStyles$(docsStyles);
  useStyles$(apiStyles);

  return (
    <div class="docs api fixed-header">
      <Header />
      <main>
        <div class="docs-container">
          <article>
            <Slot />
          </article>
          <ContentNav />
          <Footer />
        </div> 
      </main>
    </div>
  );
});
