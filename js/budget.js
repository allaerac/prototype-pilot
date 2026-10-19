// Budget math: the setup formula, week boundaries (Monday to Sunday, local time), and streaks.
// Pure functions only, so they can be tested with plain Node (see test/budget.test.mjs).

const DAY = 86400000;

export const FREQ_PER_WEEK = { weekly: 1, biweekly: 0.5, monthly: 12 / 52 };

// Local calendar date as "YYYY-MM-DD".
export function dateKey(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// Weeks run Monday to Sunday. The key is the Monday's date.
export function weekStart(d) {
  const s = startOfDay(d);
  const back = (s.getDay() + 6) % 7;   // Monday = 0
  return addDays(s, -back);
}
export function weekKey(d) { return dateKey(weekStart(d)); }

// Whole calendar days from a to b, ignoring clock time and daylight-saving shifts.
export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
}

/*
  weeks_left    = days from today to semester end ÷ 7 (not rounded; the end date counts as a day)
  pot           = all one-time money
  weekly_in     = recurring money converted to a week
  weekly_bills  = monthly bills × 12 ÷ 52
  cushion       = 10% of pot when on
  weekly_number = (pot − cushion) ÷ weeks_left + weekly_in − weekly_bills, rounded down to $5
*/
export function computeWeekly({ sources = [], bills = [], semesterEnd, cushion = true }, today) {
  const days = Math.max(1, daysBetween(today, parseKey(semesterEnd)) + 1);
  const weeksLeft = days / 7;
  let pot = 0, weeklyIn = 0;
  for (const s of sources) {
    const amt = Math.max(0, Number(s.amount) || 0);
    if (s.freq === 'once') pot += amt;
    else weeklyIn += amt * (FREQ_PER_WEEK[s.freq] || 0);
  }
  const monthlyBills = bills.reduce((t, b) => t + Math.max(0, Number(b.amount) || 0), 0);
  const weeklyBills = monthlyBills * 12 / 52;
  const held = cushion ? pot * 0.1 : 0;
  const raw = (pot - held) / weeksLeft + weeklyIn - weeklyBills;
  const weekly = Math.max(0, Math.floor(raw / 5) * 5);
  return { weekly, raw, weeksLeft, pot, held, weeklyIn, weeklyBills, monthlyBills };
}

// The weekly number in force for a given week. budgetHistory is [{from: weekKey, weekly}], oldest first,
// so changing the number later never rewrites past weeks.
export function weeklyFor(budgetHistory, wk) {
  let v = 0;
  for (const b of budgetHistory) if (b.from <= wk) v = b.weekly;
  return v;
}

// The week setup happened in is usually partial, so its budget is prorated by the days that were left in it.
export function budgetForWeek(state, wk) {
  const full = weeklyFor(state.budgetHistory || [], wk);
  const startKey = state.setup && state.setup.startDate;
  if (!startKey) return full;
  if (wk === weekKey(parseKey(startKey))) {
    const daysIn = 7 - ((parseKey(startKey).getDay() + 6) % 7);
    return Math.round(full * daysIn / 7);
  }
  return full;
}

export function spentInWeek(tx, wk) {
  return tx.reduce((t, x) => (weekKey(new Date(x.at)) === wk ? t + x.amount : t), 0);
}

// Every finished week from the setup week up to (not including) the current one.
export function closedWeeks(state, now) {
  if (!state.setup || !state.setup.startDate) return [];
  const out = [];
  const current = weekKey(now);
  let w = weekStart(parseKey(state.setup.startDate));
  while (dateKey(w) < current) {
    const wk = dateKey(w);
    const budget = budgetForWeek(state, wk);
    const spent = spentInWeek(state.tx || [], wk);
    const logged = (state.tx || []).filter(x => weekKey(new Date(x.at)) === wk).length;
    out.push({ wk, budget, spent, logged, under: spent <= budget + 0.005 });
    w = addDays(w, 7);
  }
  return out;
}

// Consecutive finished weeks under budget, counting back from the most recent one.
// A week with nothing logged doesn't count: it usually means the app wasn't used, not $0 spent.
export const counts = w => w.under && w.logged > 0;
export function streak(state, now) {
  const weeks = closedWeeks(state, now);
  let n = 0;
  for (let i = weeks.length - 1; i >= 0 && counts(weeks[i]); i--) n++;
  return n;
}

// Days left in the current week including today (Monday = 7, Sunday = 1).
export function daysLeftInWeek(now) {
  return 7 - ((now.getDay() + 6) % 7);
}
