import { component$, Slot, useStyles$ } from "@builder.io/qwik";
import type { RequestHandler } from "@builder.io/qwik-city";
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
