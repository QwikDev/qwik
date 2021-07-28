const PREFETCH_DEFAULT_DEBUG = '';

((win, doc, IntersectionObserver) => {
  win.addEventListener('load', () => {
    let observer = new IntersectionObserver((items) => {
      items.forEach((item) => {
        if (item.intersectionRatio > 0) {
          console.log(item.target);
        }
      });
    });
    doc.querySelectorAll('[on\\:]').forEach(observer.observe.bind(observer));
    const worker = new Worker(URL.createObjectURL((window as any).WorkerBlob));
  });
})(window, document, IntersectionObserver);
