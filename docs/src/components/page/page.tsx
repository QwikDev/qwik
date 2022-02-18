import type { PageHandler } from '@builder.io/qwest';

interface QwestPageProps {
  page: PageHandler;
  pathname: string;
}

export const Page = ({ page, pathname }: QwestPageProps) => {
  const meta = page.getMetadata();
  const Layout = page.getLayout();
  const Content = page.getContent();

  console.log('title', meta.title);

  return (
    <Layout pathname={pathname}>
      <Content />
    </Layout>
  );
};
