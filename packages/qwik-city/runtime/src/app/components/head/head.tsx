import { component$ } from '@builder.io/qwik';
import { useDocumentHead, useLocation } from '~qwik-city-runtime';
import { Social } from './social';
import { Vendor } from './vendor';

export const Head = component$(
  () => {
    const head = useDocumentHead();
    const loc = useLocation();

    return (
      <>
        <meta charSet="utf-8" />

        <title>{head.title ? `${head.title} - Qwik` : `Qwik`}</title>
        <link rel="canonical" href={loc.href} />

        <meta name="viewport" content="width=device-width" />

        <Social loc={loc} head={head} />
        <Vendor loc={loc} />

        {head.meta.map((m) => (
          <meta {...m} />
        ))}

        {head.links.map((l) => (
          <link {...l} />
        ))}

        {head.styles.map((s) => (
          <style {...s.props} dangerouslySetInnerHTML={s.style} />
        ))}
      </>
    );
  },
  { tagName: 'head' }
);
