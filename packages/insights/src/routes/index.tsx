import AppsIcon from '~/components/icons/apps';
import Button from '~/components/button';
import GithubIcon from '~/components/icons/github';
import Layout from '~/components/layout';
import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return (
    <Layout mode="bright">
      <h1>Log in to Qwik Insights </h1>

      <Button onClick$={() => console.log('navigate to dashboard')}>
        <AppsIcon /> Go to the Dashboard
      </Button>

      <Button theme="github" onClick$={() => console.log('start github oauth flow')}>
        <GithubIcon />
        Continue with GitHub
      </Button>
    </Layout>
  );
});
