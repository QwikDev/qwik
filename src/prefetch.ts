const PREFETCH_DEFAULT_DEBUG = '';

((window, document, IntersectionObserver) => {
  window.addEventListener('load', () => {
    let observer = new IntersectionObserver((items) => {
      items.forEach((item) => {
        if (item.intersectionRatio > 0) {
          console.log(item.target);
        }
      });
    });
    document.querySelectorAll('[on\\:]').forEach(observer.observe.bind(observer));
  });
})(window, document, IntersectionObserver);
