import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RecentNutshellActivity } from "./recent-nutshell-activity";

test("renders current balance and human-readable recent ledger activity labels", () => {
  const html = renderToStaticMarkup(
    <RecentNutshellActivity
      currentBalance={1200}
      items={[
        {
          id: "ledger-1",
          delta: 250,
          reason: "ADMIN_CREDIT",
          note: "Manual reward credit",
          createdAt: "2026-04-05T12:00:00.000Z",
          exchangeId: null,
        },
        {
          id: "ledger-2",
          delta: -100,
          reason: "EXCHANGE_DEBIT",
          note: "Used in exchange",
          createdAt: "2026-04-05T11:00:00.000Z",
          exchangeId: "exchange-1",
        },
      ]}
    />,
  );

  assert.match(html, /1,200 available/);
  assert.match(html, /Manual reward/);
  assert.match(html, /\+250 Nutshells/);
  assert.match(html, /Exchange used/);
  assert.match(html, /-100 Nutshells/);
  assert.match(html, /Exchange exchange-1/);
});
