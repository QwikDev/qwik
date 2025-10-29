import loadThemeScript from './load-theme?compiled-string';

export const InjectThemeScript = () => {
  return <script dangerouslySetInnerHTML={loadThemeScript} />;
};
