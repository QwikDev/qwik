import { $ } from '@builder.io/qwik';

export const toggleMenu = $(() => {
  if (document.body.classList.contains('menu-open')) {
    document.body.classList.remove('menu-open');
  } else {
    document.body.classList.add('menu-open');
  }
});
