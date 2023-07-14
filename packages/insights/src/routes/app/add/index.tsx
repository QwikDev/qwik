import Container from '~/components/container';
import Layout from '~/components/layout';
import { component$ } from '@builder.io/qwik';

export default component$(() => (
  <Layout mode="bright">
    <Container position="center" width="small"></Container>
    <h1>add app</h1>
  </Layout>
));
