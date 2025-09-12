This is the test app for the preloader.

Use `pnpm preview` to run the app and observe the network requests and the console output.

The modules have been configured to have a random size between 0.5kb and 50kb, and when they load they will log a message to the console and add their id to the `_loaded` array.
