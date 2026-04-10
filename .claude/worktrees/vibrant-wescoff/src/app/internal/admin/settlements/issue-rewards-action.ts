"use server";

type Deps = {
  enforceRateLimit: (action: string) => Promise<void>;
  fetch: typeof fetch;
  revalidatePath: (path: string) => void;
  redirect: (path: string) => never;
};

function isRedirectError(error: unknown) {
  return error instanceof Error && error.name === "NEXT_REDIRECT";
}

function buildIssueRewardsErrorRedirect(message?: string) {
  const normalized = message?.trim();

  if (!normalized) {
    return "/internal/admin/settlements?flash=issue-error";
  }

  return `/internal/admin/settlements?flash=issue-error&detail=${encodeURIComponent(normalized)}`;
}

export async function runIssueNutshellRewardsAction(params: {
  adminApiKey?: string;
  walletAddress: string;
  amount: string;
  reason: string;
  note: string;
  appUrl: string;
  deps: Deps;
}) {
  try {
    await params.deps.enforceRateLimit("issue-nutshell");

    if (!params.adminApiKey) {
      params.deps.redirect("/internal/admin/settlements?flash=action-error");
    }

    const response = await params.deps.fetch(
      new URL("/api/internal/rewards/issue", params.appUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-admin-key": params.adminApiKey,
        },
        body: JSON.stringify({
          walletAddress: params.walletAddress,
          amount: Number.parseInt(params.amount, 10),
          reason: params.reason,
          note: params.note.trim() || undefined,
        }),
        cache: "no-store",
      },
    );

    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        params.deps.redirect(buildIssueRewardsErrorRedirect(data.error));
      }

      params.deps.redirect("/internal/admin/settlements?flash=action-error");
    }

    params.deps.revalidatePath("/internal/admin/settlements");
    params.deps.redirect("/internal/admin/settlements?flash=issue-success");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    params.deps.redirect("/internal/admin/settlements?flash=action-error");
  }
}
