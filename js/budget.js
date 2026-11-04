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
  Money is only budgeted once it's there. We don't ask when money lands, so we assume monthly money and bills
  land on the 1st, and weekly or every-2-weeks ones every 7 or 14 days counting from setup (payFrom).
  One-time money counts as already in hand.

  spendable     = money on hand + one-time money − cushion (10%, fixed at setup) − money already saved for the goal
  for each day money comes in or a bill goes out (and the semester end):
    what's there by then ÷ weeks until then
  weekly_number = the smallest of those, rounded down to $5. So the weeks before a payday stretch what's there now,
  and the number goes up once the money lands (Home works it out again every Monday).
*/
const PERIOD_DAYS = { weekly: 7, biweekly: 14 };
// When each recurring amount lands, from the day after `after` through `until` (both dates): [{date, amount, sign}]
export function flows(items, sign, payFrom, after, until) {
  const out = [];
  for (const x of items) {
    const amt = Math.max(0, Number(x.amount) || 0);
    const freq = x.freq || (sign < 0 ? 'monthly' : 'once');
    if (!amt || freq === 'once') continue;
    if (freq === 'monthly') {
      for (let d = new Date(after.getFullYear(), after.getMonth() + 1, 1); d <= until; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push({ date: d, amount: amt * sign });
    } else {
      const n = PERIOD_DAYS[freq];
      if (!n) continue;
      const k = Math.max(1, Math.floor(daysBetween(payFrom, after) / n) + 1);
      for (let d = addDays(payFrom, k * n); d <= until; d = addDays(d, n)) if (d > after) out.push({ date: d, amount: amt * sign });
    }
  }
  return out.sort((a, b) => a.date - b.date);
}
export function computeWeekly({ onHand = 0, sources = [], bills = [], semesterEnd, cushion = true, held = null, saved = 0, payFrom = null }, today) {
  const t0 = startOfDay(today), end = parseKey(semesterEnd);
  const days = Math.max(1, daysBetween(t0, end) + 1);
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
  const keep = held != null ? Math.max(0, Number(held) || 0) : (cushion ? pot * 0.1 : 0);
  const spendable = pot - keep - Math.max(0, Number(saved) || 0);
  const from = payFrom ? parseKey(payFrom) : t0;
  const events = [...flows(sources, 1, from, t0, end), ...flows(bills, -1, from, t0, end)].sort((a, b) => a.date - b.date);
  // the limit that bites first: {raw (dollars a week), until (date key), weeks, have (money for that stretch)}
  let best = null;
  const check = (have, n, until) => {
    if (n <= 0) return;
    const g = have * 7 / n;
    if (!best || g < best.raw - 1e-9) best = { raw: g, until: dateKey(until), weeks: n / 7, have };
  };
  let running = spendable, paidIn = 0, billsOut = 0;
  for (let i = 0; i < events.length;) {
    const d = events[i].date, n = daysBetween(t0, d);
    check(running, n, addDays(d, -1));             // just before that day's money lands
    for (; i < events.length && +events[i].date === +d; i++) {
      running += events[i].amount;
      if (events[i].amount > 0) paidIn += events[i].amount; else billsOut -= events[i].amount;
    }
    check(running, n, addDays(d, -1));             // after that day's bills
  }
  check(running, days, end);
  const raw = best.raw;
  const weekly = Math.max(0, Math.floor(raw / 5) * 5);
  const next = events.find(e => e.amount > 0) || null;
  // money landing the day after the stretch that sets the number, when that's what holds it down
  const upOn = dateKey(addDays(parseKey(best.until), 1));
  const lands = best.until < dateKey(end) ? events.filter(e => e.amount > 0 && dateKey(e.date) === upOn).reduce((t, e) => t + e.amount, 0) : 0;
  return {
    weekly, raw, weeksLeft, onHand: have, oneTime, pot, held: keep, saved: Math.max(0, Number(saved) || 0), spendable,
    until: best.until, untilWeeks: best.weeks, untilHave: best.have,
    // money that lands (and bills that go out) before the stretch that sets the number ends
    inBefore: events.filter(e => e.amount > 0 && dateKey(e.date) <= best.until).reduce((t, e) => t + e.amount, 0),
    billsBefore: -events.filter(e => e.amount < 0 && dateKey(e.date) <= best.until).reduce((t, e) => t + e.amount, 0),
    next: next && { date: dateKey(next.date), amount: next.amount }, up: lands > 0 ? { date: upOn, amount: lands } : null,
    total: running, paidIn, billsOut, weeklyIn, weeklyBills, monthlyBills
  };
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

// The week setup happened in and the week the semester ends in are usually partial, so their budget (and savings)
// are prorated by the days of them that count.
export function weekShare(state, wk) {
  const startKey = state.setup && state.setup.startDate, endKey = state.setup && state.setup.semesterEnd;
  const mon = parseKey(wk);
  let first = 0, last = 6;
  if (startKey && wk === weekKey(parseKey(startKey))) first = daysBetween(mon, parseKey(startKey));
  if (endKey && wk === weekKey(parseKey(endKey))) last = daysBetween(mon, parseKey(endKey));
  return Math.max(0, last - first + 1) / 7;
}
// Plus any money the student logged as coming in that week (a refund, cash from a friend, an extra shift).
export function budgetForWeek(state, wk) {
  return Math.round(weeklyFor(state.budgetHistory || [], wk) * weekShare(state, wk)) + addedInWeek(state.tx || [], wk);
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
  start = `left` when given (what's there now plus what's still coming in, from weeklyFrom's total), otherwise
  their weekly number × weeks left. The plan uses all of it by the end. pace = what they actually spend per week:
  finished weeks with something logged (a short first week counts by its days), or before any week has finished,
  this week so far scaled to 7 days once there are at least 3 days of it (one big day would otherwise look like
  a huge weekly pace). null pace = not enough to go on yet.
  Returns {weeks, plan, pace, start, endLeft, runOut (date or null), points: [{t (weeks from now), plan, pace}]}.
*/
export function projection(state, now, left) {
  const setup = state.setup;
  if (!setup || !setup.semesterEnd) return null;
  const weeks = Math.max(0, (daysBetween(now, parseKey(setup.semesterEnd)) + 1) / 7);
  const weekly = weeklyFor(state.budgetHistory || [], weekKey(now));
  const start = left != null ? Math.max(0, left) : weekly * weeks;
  const plan = weeks > 0 ? start / weeks : weekly;
  const done = closedWeeks(state, now).filter(w => w.logged > 0 && w.budget > 0);
  let pace = null;
  if (done.length) {
    pace = done.reduce((t, w) => t + w.spent, 0) / done.reduce((t, w) => t + weekShare(state, w.wk), 0);
  } else {
    const wk = weekKey(now);
    const spent = spentInWeek(state.tx || [], wk);
    const from = setup.startDate && setup.startDate > wk ? parseKey(setup.startDate) : parseKey(wk);
    const days = Math.max(1, daysBetween(from, now) + 1);
    if (spent > 0 && days >= 3) pace = spent / days * 7;
  }
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

/*
  The balance we assume the student has: the last amount they told us (setup's "right now", or Update my balance)
  − purchases logged since + money in logged since + recurring money that should have landed − bills that should
  have gone out. Returns {amount, start, since (ISO), spent, added, paid, bills}.
*/
const recurring = list => (list || []).filter(x => x.freq !== 'once');
const oneTimeOf = setup => (setup.sources || []).reduce((t, x) => t + (x.freq === 'once' ? Math.max(0, Number(x.amount) || 0) : 0), 0);
export function balanceAnchor(state) {
  const s = state.setup;
  let a = { at: s.balanceAt || s.completedAt || new Date(parseKey(s.startDate).getTime() + 12 * 3600e3).toISOString(), amount: Math.max(0, Number(s.onHand) || 0) + oneTimeOf(s) };
  if (state.balance && new Date(state.balance.at) > new Date(a.at)) a = { at: state.balance.at, amount: state.balance.amount };
  return a;
}
export function assumedBalance(state, now) {
  const s = state.setup;
  if (!s) return null;
  const a = balanceAnchor(state), from = new Date(a.at);
  let spent = 0, added = 0;
  for (const x of state.tx || []) {
    const at = new Date(x.at);
    if (at <= from || at > now) continue;
    if (isIn(x)) added += x.amount; else spent += x.amount;
  }
  const payFrom = parseKey(s.startDate), d0 = startOfDay(from), d1 = startOfDay(now);
  const paid = flows(recurring(s.sources), 1, payFrom, d0, d1).reduce((t, e) => t + e.amount, 0);
  const bills = -flows(s.bills || [], -1, payFrom, d0, d1).reduce((t, e) => t + e.amount, 0);
  const r2 = v => Math.round(v * 100) / 100;
  return { amount: r2(a.amount - spent + added + paid - bills), start: a.amount, since: a.at, spent: r2(spent), added: r2(added), paid, bills };
}
// The cushion is 10% of what the student started with, so it stays put as weeks are worked out again.
export function heldFor(setup) {
  if (setup.cushion === false) return 0;
  if (setup.held != null) return setup.held;
  return Math.round((Math.max(0, Number(setup.onHand) || 0) + oneTimeOf(setup)) * 10) / 100;
}
// The weekly number from the assumed balance at a moment (the start of a week, or right after Update my balance).
export function weeklyFrom(state, at) {
  const s = state.setup;
  const bal = assumedBalance(state, at);
  const goal = s.goal ? goalProgress(state, at) : null;
  return computeWeekly({ onHand: bal.amount, sources: recurring(s.sources), bills: s.bills || [], semesterEnd: s.semesterEnd, held: heldFor(s), saved: goal ? goal.total : 0, payFrom: s.startDate }, at);
}
// A budgetHistory entry built from the one before it: same goal savings (a percent goal grows with the total)
// and the same category shape, new total.
function entryFrom(prev, gross, wk, percent) {
  let save = Number(prev.save) || 0;
  if (save && percent && prev.gross > 0) save = Math.round(save * gross / prev.gross);
  save = Math.min(save, gross);
  const weekly = Math.max(0, gross - save);
  const e = { from: wk, weekly, gross, save, auto: true };
  if (prev.order && prev.cats) { e.order = prev.order.slice(); e.cats = scaleSplit(prev.order, prev.cats, weekly); }
  return e;
}
/*
  Every Monday the weekly number is worked out again from the assumed balance, so a payday week gets more and
  overspending shows up in the weeks after. Returns the new budgetHistory entries (oldest first) for each week
  from the one after the last entry through the current week; past weeks are never rewritten.
*/
export function planWeeks(state, now) {
  const s = state.setup;
  if (!s || !s.startDate || !s.semesterEnd) return [];
  const hist = (state.budgetHistory || []).slice();
  if (!hist.length) return [];
  const out = [];
  const cur = weekKey(now), end = parseKey(s.semesterEnd);
  let wk = dateKey(addDays(parseKey(hist[hist.length - 1].from), 7));
  for (; wk <= cur && parseKey(wk) <= end; wk = dateKey(addDays(parseKey(wk), 7))) {
    const st = { ...state, budgetHistory: hist };
    const r = weeklyFrom(st, parseKey(wk));
    const e = entryFrom(hist[hist.length - 1], r.weekly, wk, s.goal && s.goal.kind === 'percent');
    hist.push(e);
    out.push(e);
  }
  return out;
}
/*
  Right after Update my balance: this week becomes what's already spent + the new weekly rate for the days left,
  so the change shows up today instead of next Monday. The entry's gross is the new rate (before the goal), so
  next Monday and "Change split" start from it. Returns {entry, weekly (the new rate), r}.
*/
export function replanNow(state, now) {
  const wk = weekKey(now);
  const hist = state.budgetHistory || [];
  const prev = [...hist].reverse().find(b => b.from <= wk) || hist[hist.length - 1];
  const r = weeklyFrom(state, now);
  const save = Math.min(Number(prev.save) || 0, r.weekly);
  const rest = Math.max(0, r.weekly - save) * daysLeftInWeek(now) / 7;
  const total = spentInWeek(state.tx || [], wk) + rest - addedInWeek(state.tx || [], wk);
  const weekly = Math.max(0, Math.round(total / weekShare(state, wk)));
  const entry = { from: wk, weekly, gross: r.weekly, save, auto: true };
  if (prev.order && prev.cats) { entry.order = prev.order.slice(); entry.cats = scaleSplit(prev.order, prev.cats, weekly); }
  return { entry, weekly: r.weekly, r };
}

// Entries are purchases, or money coming in (kind: 'in'), which adds to that week instead of using it up.
export const isIn = x => x.kind === 'in';
export function spentInWeek(tx, wk) {
  return tx.reduce((t, x) => (!isIn(x) && weekKey(new Date(x.at)) === wk ? t + x.amount : t), 0);
}
export function addedInWeek(tx, wk) {
  return Math.round(tx.reduce((t, x) => (isIn(x) && weekKey(new Date(x.at)) === wk ? t + x.amount : t), 0) * 100) / 100;
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
    const logged = (state.tx || []).filter(x => !isIn(x) && weekKey(new Date(x.at)) === wk).length;
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
