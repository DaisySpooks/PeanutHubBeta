import "server-only";

import { db } from "@/lib/db";

function normalizeConfigValue(value?: string | null) {
  return value ?? null;
}

export async function recordSystemConfigAudit(params: {
  key: string;
  oldValue?: string | null;
  newValue?: string | null;
  changedBy: string;
  reason?: string | null;
}) {
  await db.systemConfigAudit.create({
    data: {
      key: params.key,
      oldValue: normalizeConfigValue(params.oldValue),
      newValue: normalizeConfigValue(params.newValue),
      changedBy: params.changedBy,
      reason: params.reason ?? null,
    },
  });
}
