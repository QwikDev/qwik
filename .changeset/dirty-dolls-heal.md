---
'@builder.io/qwik-city': minor
---

FEAT: Support rewrite feature. should work like redirect, but without modifying the address bar url

Example usage:
```
export const onRequest: RequestHandler = async ({ url, rewrite }) => {
  if (url.pathname.includes("/articles/the-best-article-in-the-world")) {
    const artistId = db.getArticleByName("the-best-article-in-the-world");

    // Url will remain /articles/the-best-article-in-the-world, but under the hood,
    // will render /articles/${artistId}
    throw rewrite(`/articles/${artistId}`);
  }
};
```