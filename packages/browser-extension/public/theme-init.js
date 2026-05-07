(function () {
  var theme = localStorage.getItem('vueuse-color-scheme') || 'dark';
  if (theme !== 'auto') {
    document.documentElement.setAttribute('data-theme', theme);
  }
})();
