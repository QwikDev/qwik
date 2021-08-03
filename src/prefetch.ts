/**
 * Prefetch visible QRLs on the page.
 *
 * 1. Upon DOM content loaded
 * 2. Select all which have `on:*` event QRL handlers
 * 3. Use `IntersectionObserver` to determine if the elements are user visible.
 * 3. For each visible QRL user Web-Worker to pre-fetch each QRL.
 *
 *
 * # Goal
 *
 * Because Qwik applications are resumable they don't need to execute any code until user
 * interaction. The implication is that the browser needs to download code behind the user
 * interaction only after the user interacts with the application. This may lead to long
 * initial latency.
 *
 *
 * # Solution
 *
 * The solution is to eagerly download and pre-populate the browser cache for each possible QRL.
 * This warms up the browser cache which lowers the time-to interactive for the page.
 *
 *
 * # PageSpeed and WebWorker
 *
 * [PageSpeed Insights](https://developers.google.com/speed/pagespeed/insights) measures time
 * the main thread spends doing work and counts it against time-to-interactive time. For this
 * reason the pre-fetching of the QRLs is performed on the web-worker thread which does not
 * affect the PageSpeed Insights score.
 *
 *
 * # Usage
 *
 * This script is optional and does not need to be loaded in the qwik application. Its inclusion
 * improves the latency of the application startup (but does not change its behavior.)
 */

import { setupPrefetching } from './bootloader-shared';
setupPrefetching(window, document, IntersectionObserver);
