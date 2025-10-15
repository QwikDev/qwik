export const themeStorageKey = 'theme-preference';

export const ThemeScript = () => {
  const themeScript = `
        try {
          const getItem = localStorage.getItem('${themeStorageKey}')
          const el = document.firstElementChild;
          if(!el) { throw new Error('documentElement not found'); }

          if(getItem === 'light' || getItem === 'dark'){
              el.setAttribute('data-theme', getItem);
          } else {
              const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              el.setAttribute('data-theme', isDark ? 'dark' : 'light');
          }
        } catch (err) { }`;
  return <script dangerouslySetInnerHTML={themeScript} />;
};
