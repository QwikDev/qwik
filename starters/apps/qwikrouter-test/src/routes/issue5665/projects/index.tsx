import { component$ } from "@qwik.dev/core";
import { Link, useLocation } from "@qwik.dev/router";

export default component$((props) => {
  const {
    url: { pathname },
  } = useLocation();

  const isProjects = pathname.includes("projects");
  const hrefPath = isProjects ? "projekte" : "projects";

  return (
    <div>
      <h1>Issue 5665</h1>
      <p>
        Translated routes from rewriteRoutes get ignored for [...catchall] route
        in same folder
      </p>
      <Link href={`/qwikrouter-test/issue5665/${hrefPath}`}>
        Go to {isProjects ? "projekte" : "projects"}
      </Link>
    </div>
  );
});
