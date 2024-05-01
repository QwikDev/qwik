(function () {
  try {
    var preferredUwu;
    try {
      preferredUwu = localStorage.getItem('uwu');
    } catch (err) {
      //
    }

    const isUwuValue =
      window.location && window.location.search && window.location.search.match(/uwu=(true|false)/);

    if (isUwuValue) {
      const isUwu = isUwuValue[1] === 'true';
      if (isUwu) {
        try {
          localStorage.setItem('uwu', true);
        } catch (err) {
          //
        }
        document.documentElement.classList.add('uwu');
        console.log('uwu mode enabled. turn off with ?uwu=false');
        console.log(
          'logo credit to @sawaratsuki1004 via https://github.com/SAWARATSUKI/ServiceLogos'
        );
      } else {
        try {
          localStorage.removeItem('uwu', false);
        } catch (err) {
          //
        }
      }
    } else if (preferredUwu) {
      document.documentElement.classList.add('uwu');
    }
  } catch (err) {
    //
  }
})();

document.addEventListener('load', (event) => {
  const imgEl = document.getElementById('qwik-logo');
  if (document.documentElement.classList.contains('uwu')) {
    imgEl.src = '../../../public/logos/qwik-uwu.webp';
  }
});
