export const themeStorageKey = 'theme-preference';

export const ThemeScript = () => {
  const themeScript = `
        document.firstElementChild
            .setAttribute('data-theme',
                localStorage.getItem('${themeStorageKey}') ??
                (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            )`;
  return <script dangerouslySetInnerHTML={themeScript} />;
};

// we want to keep logic as much as possible in typescript
// the following reduces the maintenance cost of keeping logic as string
// and also allows us to use typescript to ensure the logic is correct
// at a later date, when the new combineInlines is available, we can use it here
// as follows:
// **************************************************************
// import { combineInlines } from '@builder.io/qwik';

// export const themeStorageKey = 'theme-preference';

// function setTheme() {
//   const colorTheme = localStorage.getItem(themeStorageKey);
//   if (colorTheme === 'dark') {
//     document.documentElement.classList.add('dark');
//   } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
//     localStorage.setItem(themeStorageKey, colorTheme || 'dark');
//     document.documentElement.classList.add('dark');
//     document.documentElement.classList.remove('light');
//   } else {
//     document.documentElement.classList.add('light');
//     document.documentElement.classList.remove('dark');
//   }
// }

// export const ThemeScript = () => {
//   return <script dangerouslySetInnerHTML={combineInlines([setTheme])} />;
// };
