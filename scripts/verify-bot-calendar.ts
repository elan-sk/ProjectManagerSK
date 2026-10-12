import assert from "node:assert/strict";
import { getWorkingCalendar } from "../src/lib/botCalendar";

async function main() {
  const range = await getWorkingCalendar("CO", { from: "2026-12-24", to: "2026-12-28" });
  assert.ok(!("error" in range));
  assert.equal(range.businessDays, 2);
  assert.equal(range.calendarDays, 5);
  assert.deepEqual(range.holidays.map((h) => h.date), ["2026-12-25"]);

  const duration = await getWorkingCalendar("CO", { from: "2026-12-24", durationDays: 2 });
  assert.ok(!("error" in duration));
  assert.equal(duration.endDate, "2026-12-28");
  assert.equal(duration.startIsBusinessDay, true);

  const fromHoliday = await getWorkingCalendar("CO", { from: "2026-12-25", durationDays: 1 });
  assert.ok(!("error" in fromHoliday));
  assert.equal(fromHoliday.startIsBusinessDay, false);
  assert.equal(fromHoliday.endDate, "2026-12-28");

  const year = await getWorkingCalendar("CO", { from: "2026-01-01" });
  assert.ok(!("error" in year));
  assert.equal(year.to, "2026-12-31");
  assert.ok(year.holidays.length >= 15);

  assert.ok("error" in (await getWorkingCalendar("CO", { from: "2026-05-10", to: "2026-05-01" })));
  assert.ok("error" in (await getWorkingCalendar("CO", { from: "2026-01-01", to: "2029-01-01" })));

  console.log("verify-bot-calendar: OK");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
