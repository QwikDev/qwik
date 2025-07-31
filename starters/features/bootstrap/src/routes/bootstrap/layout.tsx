import type { RequestHandler } from "@qwik.dev/router";
import { component$, Slot, useStyles$ } from "@qwik.dev/core";
import { Navbar } from "~/components/bootstrap";

// Add bootstrap styles

import bootstrapStyles from "../../../node_modules/bootstrap/dist/css/bootstrap.min.css?inline";

export default component$(() => {
  useStyles$(bootstrapStyles);
  return (
    <>
      <Navbar />
      <div class="container">
        <div class="row mb-2 mt-4">
          <p>
            Bootstrap is a powerful, feature-packed frontend toolkit. Build
            anything—from prototype to production—in minutes.
          </p>
        </div>
        <Slot />
      </div>
    </>
  );
});
