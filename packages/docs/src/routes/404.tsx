import { component$, useStyles$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

import { Header } from '../components/header/header';
import catVideo from '../media/images/404-cat.mp4?url';

import styles from './404.css?inline';

export default component$(() => {
  useStyles$(styles);
  return (
    <div>
      <Header />
      <div class="c3fbp0c">
        <section class="c8o0ofp">
          <div class="ch99mph">
            <div>
              <svg
                width="1440"
                height="821"
                viewBox="0 0 1440 821"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <ellipse
                  cx="657.051"
                  cy="410.5"
                  rx="842.051"
                  ry="410.5"
                  fill="url(#paint0_radial_1855_2477)"
                  fill-opacity="0.6"
                ></ellipse>
                <defs>
                  <radialGradient
                    id="paint0_radial_1855_2477"
                    cx="0"
                    cy="0"
                    r="1"
                    gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(657.051 410.5) rotate(90) scale(410.5 700.051)"
                  >
                    <stop stop-color="#AC7FF4"></stop>
                    <stop offset="1" stop-color="#151934" stop-opacity="0"></stop>
                  </radialGradient>
                </defs>
              </svg>
            </div>
          </div>
          <div class="coxpa3x">
            <div>
              <svg
                width="1440"
                height="1141"
                viewBox="0 0 1440 1141"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <ellipse
                  cx="774.844"
                  cy="479.424"
                  rx="1054.64"
                  ry="658"
                  transform="rotate(-4.48315 774.844 479.424)"
                  fill="url(#paint0_radial_1855_2450)"
                  fill-opacity="0.5"
                ></ellipse>
                <defs>
                  <radialGradient
                    id="paint0_radial_1855_2450"
                    cx="0"
                    cy="0"
                    r="1"
                    gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(649.289 479.632) rotate(95) scale(758.222 1000)"
                  >
                    <stop stop-color="#18B4F4"></stop>
                    <stop offset="0.632219" stop-color="#2E3772" stop-opacity="0"></stop>
                  </radialGradient>
                </defs>
              </svg>
            </div>
          </div>
          <div class="c88ivna">
            <div class="cpcp8ob">
              <div class="c7vsibe">
                <div>
                  <p>4</p>
                </div>
              </div>
              <div class="cv7i9m5">
                <div class="crjn1wl">
                  <div class="cll733z">
                    <video autoplay muted playsInline loop class="cd2p4ty">
                      <source type="video/mp4" src={catVideo} />
                    </video>
                    <div class="c4vjsfu"></div>
                  </div>
                </div>
              </div>
              <div class="c7vsibe">
                <div>
                  <p>4</p>
                </div>
              </div>
            </div>
            <div class="cq8sxte">
              <div>
                <p>Well, this is awkward...</p>
              </div>
            </div>
            <div class="cdd0lhi">
              <div>
                <p>The page you're trying to view no longer exists or was moved.</p>
              </div>
            </div>
            <div class="cxoynd0">
              <Link href="/" target="_self" class="creulwa">
                Go home
              </Link>
              <Link href="/docs/" target="_self" class="c5p6san">
                Explore the docs
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
});
