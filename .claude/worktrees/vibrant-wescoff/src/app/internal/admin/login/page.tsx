import Link from "next/link";
import { redirect } from "next/navigation";
import { getInternalAdminSession } from "@/lib/internal-auth";
import { serverEnv } from "@/lib/config/server-env";
import { loginInternalAdminAction } from "@/app/internal/admin/login/actions";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function InternalAdminLoginPage({ searchParams }: LoginPageProps) {
  const session = await getInternalAdminSession();

  if (session) {
    redirect("/internal/admin/settlements");
  }

  const { error } = await searchParams;
  const isConfigured = Boolean(serverEnv.INTERNAL_ADMIN_API_KEY);

  return (
    <main className="shell dashboardShell">
      <section className="panel internalAdminPanel">
        <div>
          <p className="heroKicker">Internal admin</p>
          <h1>Settlement access</h1>
          <p>
            This area is protected by a server-side internal admin key. We issue an http-only
            signed cookie after successful login so settlement actions can run as server actions
            without trusting any client-side role state.
          </p>
        </div>

        {!isConfigured ? (
          <div className="internalAdminNotice">
            <strong>Internal admin access is not configured.</strong>
            <p>
              Set <code>INTERNAL_ADMIN_API_KEY</code> in your environment to enable this page.
            </p>
          </div>
        ) : (
          <form action={loginInternalAdminAction} className="internalAdminForm">
            <label className="withdrawalField">
              <span>Internal admin key</span>
              <input autoComplete="current-password" name="adminKey" type="password" />
            </label>

            <div className="authActions">
              <button className="primaryLinkButton" type="submit">
                Sign in
              </button>
              <Link className="secondaryLinkButton" href="/">
                Back home
              </Link>
            </div>

            {error === "invalid-key" ? (
              <p className="authError">The internal admin key was not accepted.</p>
            ) : null}
            {error === "rate-limited" ? (
              <p className="authError">Too many admin login attempts. Please wait a minute and try again.</p>
            ) : null}
          </form>
        )}
      </section>
    </main>
  );
}
