import Avatar from "../avatar";
import { Link } from "@builder.io/qwik-city";
import { QwikIcon } from "../icons/qwik";
import { component$ } from "@builder.io/qwik";
import { useAuthSignout } from "~/routes/plugin@auth";
import { useUserSession } from "~/routes/layout";

export default component$(() => {
  const signOutSig = useAuthSignout();
  const session = useUserSession();

  return (
    <header class="flex items-center gap-3 border border-b-slate-200 px-6 py-3">
      <Link href="/">
        <QwikIcon width="46" height="50" />
      </Link>
      <span class="font-thin">Insights</span>

      {session.value.user?.email && (
        <div class="ml-auto flex items-center justify-center gap-8">
          <Link href="/">Setting</Link>
          <Link
            class=""
            onClick$={() => {
              signOutSig.submit({ callbackUrl: "/" });
            }}
          >
            Logout
          </Link>
          <Avatar
            src={session.value.user?.image ?? ""}
            alt={session.value.user?.name ?? ""}
            size="small"
          />
        </div>
      )}
    </header>
  );
});
