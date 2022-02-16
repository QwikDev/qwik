import type { PageHandler } from '@builder.io/qwest';

interface PageProps {
  page: PageHandler;
  pathname: string;
}

export const Page = ({ page, pathname }: PageProps) => {
  const Layout = page.getLayout();
  const Content = page.getContent();

  return (
    <Layout pathname={pathname}>
      <Content />
    </Layout>
  );
};
