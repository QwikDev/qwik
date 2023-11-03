import { component$ } from '@builder.io/qwik';
import BuilderContentComp from '../components/builder-content';
import { Header } from '../components/header/header';
import { QWIK_PUBLIC_API_KEY } from '../constants';

const MODEL = 'error';

export default component$(() => {
  return (
    <div>
      <Header />
      <BuilderContentComp apiKey={QWIK_PUBLIC_API_KEY} model={MODEL} tag="div" />
    </div>
  );
});
