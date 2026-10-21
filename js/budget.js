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

// Suggested split: the higher a category is in the student's order, the bigger its share (weight 1 ÷ (rank + 1.5),
// so four categories get about 42%, 25%, 18% and 14%). Whole dollars that add up to the weekly number exactly;
// the rounding difference goes to the top category.
export function suggestSplit(order, weekly) {
  const weights = order.map((_, i) => 1 / (i + 1.5));
  const sum = weights.reduce((t, w) => t + w, 0);
  const cats = {};
  let total = 0;
  order.forEach((id, i) => { cats[id] = Math.round(weekly * weights[i] / sum); total += cats[id]; });
  if (order.length) cats[order[0]] += weekly - total;
  return cats;
}

// Resize a split to a new weekly total while keeping its shape: every category moves by the same share.
// Whole dollars that add up exactly; the rounding difference goes to the top category.
export function scaleSplit(order, cats, total) {
  const from = order.reduce((t, id) => t + (Number(cats[id]) || 0), 0);
  if (from <= 0) return suggestSplit(order, total);
  const out = {};
  let sum = 0;
  order.forEach(id => { out[id] = Math.round((Number(cats[id]) || 0) * total / from); sum += out[id]; });
  if (order.length) out[order[0]] += total - sum;
  return out;
}

/*
  Savings goal: dollars per week set aside before the student spends anything.
  goal.kind: 'every' (amount each week / 2 weeks / month), 'by' (target by a date), 'percent' (pct of the
  weekly money before saving). 'by' spreads the target over the weeks from today to the date, rounded up.
*/
// Just what the goal is (no bookkeeping like perWeek or since), to tell whether the student changed it.
export function goalFields(g) {
  if (g.kind === 'every') return { name: g.name, kind: g.kind, amount: g.amount, freq: g.freq };
  if (g.kind === 'by') return { name: g.name, kind: g.kind, target: g.target, date: g.date };
  return { name: g.name, kind: g.kind, pct: g.pct };
}
export function goalWeekly(goal, grossWeekly, today) {
  if (!goal) return 0;
  if (goal.kind === 'percent') return Math.round(grossWeekly * (Number(goal.pct) || 0) / 100);
  if (goal.kind === 'by') {
    const weeks = Math.max(1, (daysBetween(today, parseKey(goal.date)) + 1) / 7);
    return Math.ceil((Number(goal.target) || 0) / weeks);
  }
  return Math.round((Number(goal.amount) || 0) * (FREQ_PER_WEEK[goal.freq] || 0));
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

// The week setup happened in is usually partial, so its budget (and savings) are prorated by the days left in it.
function weekShare(state, wk) {
  const startKey = state.setup && state.setup.startDate;
  if (startKey && wk === weekKey(parseKey(startKey))) return (7 - ((parseKey(startKey).getDay() + 6) % 7)) / 7;
  return 1;
}
export function budgetForWeek(state, wk) {
  return Math.round(weeklyFor(state.budgetHistory || [], wk) * weekShare(state, wk));
}
// Dollars set aside for the goal that week (budgetHistory entries carry `save` once a goal is set).
export function saveForWeek(state, wk) {
  let save = 0;
  for (const b of state.budgetHistory || []) if (b.from <= wk) save = Number(b.save) || 0;
  return Math.round(save * weekShare(state, wk));
}

/*
  How the savings goal is doing. Each finished week since the goal was set adds that week's savings if the
  student stayed within their number; going over eats into it first. The current week counts what's still
  on track so far. Month = weeks whose Monday is in the current month.
  Returns {total, pending, month, perWeek, projected(untilKey)}.
*/
export function goalProgress(state, now) {
  const goal = state.setup && state.setup.goal;
  if (!goal) return null;
  const since = goal.since || '';
  const gotFor = (wk, spent) => { const save = saveForWeek(state, wk); return Math.max(0, save - Math.max(0, spent - budgetForWeek(state, wk))); };
  const weeks = closedWeeks(state, now).filter(w => w.wk >= since).map(w => ({ wk: w.wk, saved: gotFor(w.wk, w.spent) }));
  const cur = weekKey(now);
  const pending = cur >= since ? gotFor(cur, spentInWeek(state.tx || [], cur)) : 0;
  const total = weeks.reduce((t, w) => t + w.saved, 0);
  const ym = cur.slice(0, 7);
  const month = weeks.filter(w => w.wk.slice(0, 7) === ym).reduce((t, w) => t + w.saved, 0) + pending;
  const perWeek = saveForWeek({ ...state, setup: { ...state.setup, startDate: null } }, cur);
  // if they keep it up: what's saved, plus this week, plus every full week until the date
  const projected = untilKey => total + pending + perWeek * Math.max(0, Math.floor((daysBetween(now, parseKey(untilKey)) - daysLeftInWeek(now) + 1) / 7));
  return { weeks, total, pending, month, perWeek, projected };
}

/*
  Where the money's headed: money left to spend for the rest of the semester (beyond bills and savings),
  on the plan vs at the student's pace, from today to the semester end.
  plan = their weekly number now. pace = what they actually spend per week: finished weeks with something
  logged, compared with what those weeks allowed (so a short first week counts fairly); before any week has
  finished, this week so far scaled to 7 days once there are at least 3 days of it (one big day would
  otherwise look like a huge weekly pace). null pace = not enough to go on yet.
  Returns {weeks, plan, pace, start, endLeft, runOut (date or null), points: [{t (weeks from now), plan, pace}]}.
*/
export function projection(state, now) {
  const setup = state.setup;
  if (!setup || !setup.semesterEnd) return null;
  const weeks = Math.max(0, (daysBetween(now, parseKey(setup.semesterEnd)) + 1) / 7);
  const plan = weeklyFor(state.budgetHistory || [], weekKey(now));
  const done = closedWeeks(state, now).filter(w => w.logged > 0 && w.budget > 0);
  let pace = null;
  if (done.length) {
    pace = plan * done.reduce((t, w) => t + w.spent, 0) / done.reduce((t, w) => t + w.budget, 0);
  } else {
    const wk = weekKey(now);
    const spent = spentInWeek(state.tx || [], wk);
    const from = setup.startDate && setup.startDate > wk ? parseKey(setup.startDate) : parseKey(wk);
    const days = Math.max(1, daysBetween(from, now) + 1);
    if (spent > 0 && days >= 3) pace = spent / days * 7;
  }
  const start = plan * weeks;
  const at = (rate, t) => start - rate * t;
  const steps = Math.max(1, Math.ceil(weeks));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = Math.min(i, weeks);
    points.push({ t, plan: at(plan, t), pace: pace == null ? null : at(pace, t) });
  }
  const endLeft = pace == null ? null : at(pace, weeks);
  const runOut = pace > 0 && endLeft < 0 ? addDays(startOfDay(now), Math.floor(start / pace * 7)) : null;
  return { weeks, plan, pace, start, endLeft, runOut, points };
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
