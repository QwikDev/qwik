---
'@builder.io/qwik-city': minor
---

FEAT: Added rewrite() to the RequestEvent object. It works like redirect but does not change the URL,
      think of it as an internal redirect.

Example usage:
```ts
export const onRequest: RequestHandler = async ({ url, rewrite }) => {
  if (url.pathname.includes("/articles/the-best-article-in-the-world")) {
    const artistId = db.getArticleByName("the-best-article-in-the-world");

    // Url will remain /articles/the-best-article-in-the-world, but under the hood,
    // will render /articles/${artistId}
    throw rewrite(`/articles/${artistId}`);
  }
};
```