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
  const scriptElm = document.createElement('script');
  scriptElm.dataset.partytown = '';
  scriptElm.innerHTML = partytownSnippet(props);
  document.head.appendChild(scriptElm);

  const innerHTML = partytownSnippet(props);
  return <script dangerouslySetInnerHTML>{innerHTML}</script>;
};
