import { component$, useOn, $ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
export const Navbar = component$(() => {
  useOn(
    "qvisible",
    $(() => import("bootstrap")),
  );

  return (
    <nav class="navbar navbar-expand-lg bg-body-tertiary">
      <div class="container-fluid">
        <button
          class="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarTogglerDemo01"
          aria-controls="navbarTogglerDemo01"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarTogglerDemo01">
          <Link class="navbar-brand" href={"/bootstrap/"}>
            Boostrap in Qwik
          </Link>
          <ul class="navbar-nav me-auto mb-2 mb-lg-0">
            <li class="nav-item">
              <Link class="nav-link" href={"/bootstrap/alerts"}>
                Alerts
              </Link>
            </li>
            <Link class="nav-link" href={"/bootstrap/buttons"}>
              Buttons
            </Link>
            <Link class="nav-link" href={"/bootstrap/spinners"}>
              Spinners
            </Link>
          </ul>
        </div>
      </div>
    </nav>
  );
});
