import { component$ } from '@builder.io/qwik';
import QwikLogo from '/public/logos/qwik.png?jsx';
import QwikLogoSVG from '/public/logos/qwik.svg?jsx';
import QwikLogouwu from '/public/logos/qwik-uwu.webp?jsx';
import QwikSocial from '/public/logos/social-card.png?jsx';
import QwikSocial2 from '/public/logos/social-card.jpg?jsx';
import { Header } from '~/components/header/header';
import { Footer } from '~/components/footer/footer';

export default component$(() => {
  return (
    <main>
      <Header />
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 p-2 px-32">
        <div>
          <h1 class="text-2xl font-bold text-center">Qwik Logo (png)</h1>
          <QwikLogo />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-center">Qwik Logo (svg)</h1>
          <QwikLogoSVG />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-center">Qwik Logo (uwu)</h1>
          <QwikLogouwu />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-center">Qwik social card Light</h1>
          <QwikSocial />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-center">Qwik social card Dark</h1>
          <QwikSocial2 />
        </div>

        <div class="grid grid-rows-7 text-center">
          <h1 class="text-2xl font-bold text-center">Qwik Colors</h1>
          <div style=" background-color:var(--qwik-blue);" class="flex justify-center items-center">
            Qwik Blue #0093ee{' '}
          </div>
          <div
            style="background-color:var(--qwik-dark-blue);"
            class="flex justify-center items-center"
          >
            Qwik Dark Blue #006ce9
          </div>
          <div
            style="background-color:var(--qwik-light-blue); color:black;"
            class="flex justify-center items-center"
          >
            Qwik Light Blue #daf0ff
          </div>
          <div
            style="background-color:var(--qwik-purple);"
            class="flex justify-center items-center"
          >
            Qwik Purple #ac7ef4
          </div>
          <div
            style="background-color:var(--qwik-dark-purple);"
            class="flex justify-center items-center"
          >
            Qwik Dark Purple #ac7ef4
          </div>
          <div
            style="background-color:var(--qwik-dark-purple-bg);"
            class="flex justify-center items-center"
          >
            Qwik Dark Purple Bg #151934
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
});
