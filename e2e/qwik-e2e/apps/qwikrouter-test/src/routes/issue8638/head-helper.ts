export const buildHead = ({ ogImage }: { ogImage?: string }) => {
  if (!ogImage) {
    ogImage = `fallback-image-url`;
  }
  return {
    title: 'issue 8638',
    meta: [{ property: 'og:image', content: ogImage }],
  };
};
