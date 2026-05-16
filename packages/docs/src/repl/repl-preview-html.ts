const replPreviewStyle = `<style data-repl-preview-font>
html, body {
  font-family: sans-serif;
}

body,
button,
input,
select,
textarea {
  font: inherit;
}
</style>`;

const tryInjectPreviewStyle = (html: string) => {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${replPreviewStyle}</head>`);
  }
  if (/<body(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<body(?:\s[^>]*)?>/i, (body) => `${body}${replPreviewStyle}`);
  }
  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${replPreviewStyle}`);
  }
  return null;
};

export const injectPreviewStyle = (html: string) => {
  return tryInjectPreviewStyle(html) ?? replPreviewStyle + html;
};

export const createPreviewStyleInjector = () => {
  let bufferedHtml = '';
  let injected = false;

  return {
    write(html: string) {
      if (injected) {
        return html;
      }

      bufferedHtml += html;
      const injectedHtml = tryInjectPreviewStyle(bufferedHtml);
      if (injectedHtml) {
        bufferedHtml = '';
        injected = true;
        return injectedHtml;
      }

      return '';
    },
    flush() {
      if (injected || !bufferedHtml) {
        return '';
      }

      const html = injectPreviewStyle(bufferedHtml);
      bufferedHtml = '';
      injected = true;
      return html;
    },
  };
};
