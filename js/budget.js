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
  pot           = money on hand now + all one-time money
  weekly_in     = recurring money converted to a week
  weekly_bills  = each bill converted to a week (bills saved before bills had a frequency are monthly)
  cushion       = 10% of pot when on
  weekly_number = (pot − cushion) ÷ weeks_left + weekly_in − weekly_bills, rounded down to $5
*/
export function computeWeekly({ onHand = 0, sources = [], bills = [], semesterEnd, cushion = true }, today) {
  const days = Math.max(1, daysBetween(today, parseKey(semesterEnd)) + 1);
  const weeksLeft = days / 7;
  const have = Math.max(0, Number(onHand) || 0);
  let oneTime = 0, weeklyIn = 0;
  for (const s of sources) {
    const amt = Math.max(0, Number(s.amount) || 0);
    if (s.freq === 'once') oneTime += amt;
    else weeklyIn += amt * (FREQ_PER_WEEK[s.freq] || 0);
  }
  const pot = have + oneTime;
  const weeklyBills = bills.reduce((t, b) => t + Math.max(0, Number(b.amount) || 0) * (FREQ_PER_WEEK[b.freq || 'monthly'] || 0), 0);
  const monthlyBills = weeklyBills * 52 / 12;
  const held = cushion ? pot * 0.1 : 0;
  const potWeekly = (pot - held) / weeksLeft;
  const raw = potWeekly + weeklyIn - weeklyBills;
  const weekly = Math.max(0, Math.floor(raw / 5) * 5);
  return { weekly, raw, weeksLeft, onHand: have, oneTime, pot, held, potWeekly, weeklyIn, weeklyBills, monthlyBills };
}

// The weekly number in force for a given week. budgetHistory is [{from: weekKey, weekly}], oldest first,
// so changing the number later never rewrites past weeks.
export function weeklyFor(budgetHistory, wk) {
  let v = 0;
  for (const b of budgetHistory) if (b.from <= wk) v = b.weekly;
  return v;
}

// The category split in force for a week: the budgetHistory entry's {weekly, order, cats}, or null for
// entries saved before categories had their own budgets.
export function splitFor(budgetHistory, wk) {
  let v = null;
  for (const b of budgetHistory) if (b.from <= wk) v = b;
  return v && v.cats && v.order ? v : null;
}

// Suggested split: the higher a category is in the student's order, the bigger its share.
// Whole dollars that add up to the weekly number exactly (the rounding difference goes to the top category).
export const SPLIT_WEIGHTS = [0.4, 0.25, 0.2, 0.15];
export function suggestSplit(order, weekly) {
  const cats = {};
  let total = 0;
  order.forEach((id, i) => { cats[id] = Math.round(weekly * (SPLIT_WEIGHTS[i] || 0)); total += cats[id]; });
  if (order.length) cats[order[0]] += weekly - total;
  return cats;
}

/*
  What's left per category this week. budget is the week's total (it can be prorated), so each category is
  scaled the same way. Going over in one category is covered by the lowest-priority categories first,
  so "left" is what a student can still spend there and stay on track for the week.
  Returns rows in priority order: {id, budget, spent, left, over, covered}.
*/
export function categoryLeft(split, budget, spentByCat) {
  const scale = split.weekly > 0 ? budget / split.weekly : 0;
  const rows = split.order.map(id => {
    const b = (Number(split.cats[id]) || 0) * scale;
    const spent = spentByCat[id] || 0;
    return { id, budget: b, spent, left: b - spent, over: Math.max(0, spent - b), covered: 0 };
  });
  let over = rows.reduce((t, r) => t + r.over, 0);
  for (let i = rows.length - 1; i >= 0 && over > 0; i--) {
    const r = rows[i];
    if (r.left <= 0) continue;
    const take = Math.min(over, r.left);
    r.left -= take;
    r.covered = take;
    over -= take;
  }
  rows.forEach(r => { if (r.left < 0) r.left = 0; });
  return rows;
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
