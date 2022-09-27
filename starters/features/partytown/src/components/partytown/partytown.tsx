import { partytownSnippet, PartytownConfig } from '@builder.io/partytown/integration';

/**
 * Props for `<QwikPartytown/>`, which extends the Partytown Config.
 *
 * https://github.com/BuilderIO/partytown#config
 *
 * @public
 */
export interface PartytownProps extends PartytownConfig {}

/**
 * @public
 * You can pass setting with props
 */
export const QwikPartytown = (props: PartytownProps): any => {
  if (typeof document !== 'undefined' && !document._partytown) {
    if (!document.querySelector('script[data-partytown]')) {
      const scriptElm = document.createElement('script');
      scriptElm.dataset.partytown = '';
      scriptElm.innerHTML = partytownSnippet(props);
      document.head.appendChild(scriptElm);
    }
    // should only append this script once per document, and is not dynamic
    document._partytown = true;
  }

  const innerHTML = partytownSnippet(props);
  return <script>{innerHTML}</script>;
};

interface PartytownDocument extends Document {
  _partytown?: boolean;
}

declare const document: PartytownDocument;
