import { Slot, component$, useSignal } from "@builder.io/qwik";
import { Link, useNavigate, usePreventNavigate$ } from "@builder.io/qwik-city";

export default component$(() => {
  const okToNavigate = useSignal(true);
  const runCount = useSignal(0);
  const navSig = useSignal<URL | number>();
  const showConfirm = useSignal(false);
  const nav = useNavigate();
  usePreventNavigate$((url) => {
    runCount.value++;
    if (okToNavigate.value) {
      return false;
    }
    if (!url) {
      // beforeunload doesn't allow confirm dialog
      // return !window.confirm("really?");
      return true;
    }
    navSig.value = url;
    showConfirm.value = true;
    return true;
  });

  return (
    <div>
      <div id="pn-runcount">{runCount.value}</div>
      <button
        id="pn-button"
        onClick$={() => (okToNavigate.value = !okToNavigate.value)}
      >
        is {!okToNavigate.value ? "dirty" : "clean"}
      </button>
      <br />
      <Link id="pn-link" href="/qwikcity-test/">
        Go home Link
      </Link>
      <br />
      <a id="pn-a" href="/qwikcity-test/">
        Go home &lt;a&gt;
      </a>
      <hr />
      <Slot />
      <hr />
      <br />
      {showConfirm.value && (
        <div>
          <div id="pn-confirm-text">
            Do you want to lose changes and go to {String(navSig.value)}?
          </div>
          <button
            id="pn-confirm-yes"
            onClick$={() => {
              showConfirm.value = false;
              okToNavigate.value = true;
              nav(navSig.value!);
            }}
          >
            Yes
          </button>
          <button
            id="pn-confirm-no"
            onClick$={() => {
              showConfirm.value = false;
            }}
          >
            No
          </button>
        </div>
      )}
    </div>
  );
});
