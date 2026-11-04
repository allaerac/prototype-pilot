// Run with: node app/test/budget.test.mjs
import assert from 'node:assert/strict';
import { computeWeekly, heldFor, assumedBalance, planWeeks, replanNow, weekShare, weekKey, budgetForWeek, closedWeeks, streak, spentInWeek, daysLeftInWeek, suggestSplit, categoryLeft, goalWeekly, scaleSplit, goalProgress, projection, dateKey as B_dateKey } from '../js/budget.js';

const t = (name, fn) => { fn(); console.log('ok -', name); };

// Jordan from the demo: $2,240 one-time for exactly 16 weeks.
const mon = new Date(2026, 7, 24);                 // Mon Aug 24 2026
const end = '2026-12-13';                          // Sunday 16 weeks later (112 days incl. today)
t('Jordan, cushion off = $140', () => {
  const r = computeWeekly({ sources: [{ type: 'family', amount: 2240, freq: 'once' }], semesterEnd: end, cushion: false }, mon);
  assert.equal(r.weekly, 140);
});
t('Jordan, cushion on = $125', () => {
  const r = computeWeekly({ sources: [{ type: 'family', amount: 2240, freq: 'once' }], semesterEnd: end, cushion: true }, mon);
  assert.equal(r.weekly, 125);
});
t('money is only budgeted once it lands', () => {
  // $300 now (cushion $30) has to last until Sep 1, when the first $600 from family lands: 270 ÷ 8 days → $235/wk
  const r = computeWeekly({
    onHand: 300,
    sources: [{ type: 'family', amount: 600, freq: 'monthly' }, { type: 'job', amount: 400, freq: 'biweekly' }],
    bills: [{ type: 'phone', amount: 50 }], semesterEnd: end, cushion: true
  }, mon);
  assert.equal(r.weekly, 235);
  assert.equal(r.until, '2026-08-31');
  assert.deepEqual(r.next, { date: '2026-09-01', amount: 600 });
  // $0 now: nothing to spend until the first paycheck
  const zero = computeWeekly({ sources: [{ type: 'job', amount: 1000, freq: 'weekly' }], bills: [{ type: 'rent', amount: 650, freq: 'monthly' }], semesterEnd: end }, mon);
  assert.equal(zero.weekly, 0);
  assert.equal(zero.until, '2026-08-30');
});
t('money on hand joins the pot, several jobs add up', () => {
  // $1,600 now + $640 refund = $2,240, plus 15 weekly $100s and 7 biweekly $200s before Dec 13 = $5,140 over 16 weeks
  const r = computeWeekly({
    onHand: 1600,
    sources: [{ type: 'loans', amount: 640, freq: 'once' }, { type: 'job', amount: 100, freq: 'weekly' }, { type: 'job', amount: 200, freq: 'biweekly' }],
    semesterEnd: end, cushion: false
  }, mon);
  assert.equal(r.pot, 2240);
  assert.equal(r.total, 5140);
  assert.equal(r.weekly, 320);
  assert.equal(r.until, end);
});
t('$185 now and $500 a month: $40 until Dec 1, then more', () => {
  const wed = new Date(2026, 10, 4, 18);
  const r = computeWeekly({ onHand: 185, sources: [{ type: 'family', amount: 500, freq: 'monthly' }], semesterEnd: '2026-12-11' }, wed);
  assert.equal(r.held, 18.5);
  assert.equal(r.weekly, 40);                                     // 166.50 ÷ 27 days × 7
  assert.equal(r.until, '2026-11-30');
  const order = ['food', 'fun'];
  const state = {
    setup: { onHand: 185, sources: [{ type: 'family', amount: 500, freq: 'monthly' }], bills: [], semesterEnd: '2026-12-11', cushion: true, held: 18.5, startDate: '2026-11-04', completedAt: wed.toISOString(), order, cats: { food: 20, fun: 20 } },
    budgetHistory: [{ from: '2026-11-02', weekly: 40, gross: 40, save: 0, order, cats: { food: 20, fun: 20 } }],
    tx: [{ amount: 20, cat: 'food', at: new Date(2026, 10, 5, 12).toISOString() }, { amount: 30, kind: 'in', at: new Date(2026, 10, 6, 12).toISOString() }]
  };
  // the next Monday: $185 − $20 + $30 = $195 assumed; (195 − 18.50) ÷ 22 days × 7 = 56 → $55
  const mon9 = new Date(2026, 10, 9, 8);
  assert.equal(assumedBalance(state, mon9).amount, 195);
  const weeks = planWeeks(state, mon9);
  assert.deepEqual(weeks.map(e => [e.from, e.weekly]), [['2026-11-09', 55]]);
  assert.equal(weeks[0].cats.food + weeks[0].cats.fun, 55);
  // the $500 is assumed to land Dec 1
  assert.equal(assumedBalance(state, new Date(2026, 10, 30, 9)).amount, 195);
  assert.equal(assumedBalance(state, new Date(2026, 11, 1, 9)).amount, 695);
  // planning through to the week of Nov 30 never re-plans a week twice, and the Dec 1 money makes it the big one
  const all = planWeeks(state, new Date(2026, 10, 30, 9));
  assert.deepEqual(all.map(e => e.from), ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  assert.ok(all[3].weekly > all[2].weekly * 2);
});
t('Update my balance re-plans the rest of this week', () => {
  const wed = new Date(2026, 10, 11, 20);
  const order = ['food'];
  const state = {
    setup: { onHand: 185, sources: [{ type: 'family', amount: 500, freq: 'monthly' }], bills: [], semesterEnd: '2026-12-11', cushion: true, held: 18.5, startDate: '2026-11-02', completedAt: new Date(2026, 10, 2, 9).toISOString(), order, cats: { food: 40 } },
    budgetHistory: [{ from: '2026-11-02', weekly: 40, gross: 40, save: 0, order, cats: { food: 40 } }, { from: '2026-11-09', weekly: 45, gross: 45, save: 0, order, cats: { food: 45 } }],
    tx: [{ amount: 15, cat: 'food', at: new Date(2026, 10, 10, 12).toISOString() }],
    balance: { at: wed.toISOString(), amount: 100 }
  };
  assert.equal(assumedBalance(state, wed).amount, 100);
  const { entry, weekly } = replanNow(state, wed);
  assert.equal(weekly, 25);                                       // (100 − 18.50) ÷ 20 days × 7 = 28.5 → $25
  assert.equal(entry.weekly, 33);                                 // $15 already spent + $25 × 5/7 for Wed–Sun
  // money assumed to land after the update still lands ($100 + $500 on Dec 1)
  assert.equal(assumedBalance({ ...state, tx: [] }, new Date(2026, 11, 2)).amount, 600);
});
t('the cushion is 10% of what they started with', () => {
  assert.equal(heldFor({ onHand: 185, sources: [{ type: 'loans', amount: 40, freq: 'once' }] }), 22.5);
  assert.equal(heldFor({ onHand: 185, held: 18.5 }), 18.5);
  assert.equal(heldFor({ onHand: 185, cushion: false }), 0);
});
t('the semester-end week is prorated', () => {
  const state = { setup: { startDate: '2026-11-02', semesterEnd: '2026-12-10' } };   // ends Thursday
  assert.equal(weekShare(state, '2026-12-07'), 4 / 7);
  assert.equal(weekShare(state, '2026-11-02'), 1);
  assert.equal(weekShare({ setup: { startDate: '2026-11-04', semesterEnd: '2026-12-10' } }, '2026-11-02'), 5 / 7);
});
t('suggested split favors the top of the order and adds up', () => {
  const cats = suggestSplit(['food', 'transport', 'shopping', 'fun'], 55);
  assert.deepEqual(cats, { food: 23, transport: 14, shopping: 10, fun: 8 });
  // any number of categories, always adding up exactly
  const six = suggestSplit(['a', 'b', 'c', 'd', 'e', 'f'], 137);
  assert.equal(Object.values(six).reduce((t, v) => t + v, 0), 137);
  assert.ok(six.a > six.b && six.b > six.f);
  assert.deepEqual(suggestSplit(['solo'], 40), { solo: 40 });
});
t('overspending is covered by the lowest priority first', () => {
  const split = { weekly: 55, order: ['food', 'transport', 'shopping', 'fun'], cats: { food: 25, transport: 12, shopping: 10, fun: 8 } };
  const rows = categoryLeft(split, 55, { food: 30, transport: 8 });
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(by.food.over, 5);
  assert.equal(by.food.left, 0);
  assert.equal(by.fun.left, 3);            // $8 − $5 to cover Food
  assert.equal(by.fun.covered, 5);
  assert.equal(by.shopping.left, 10);
  assert.equal(by.transport.left, 4);
  // a bigger overspend empties Fun, then takes from Shopping
  const big = Object.fromEntries(categoryLeft(split, 55, { food: 40 }).map(r => [r.id, r]));
  assert.equal(big.fun.left, 0);
  assert.equal(big.shopping.left, 3);
  // a prorated week scales every category
  const short = Object.fromEntries(categoryLeft(split, 27.5, {}).map(r => [r.id, r]));
  assert.equal(short.food.budget, 12.5);
});
t('goal per week: every, by a date, percent', () => {
  assert.equal(goalWeekly({ kind: 'every', amount: 100, freq: 'monthly' }, 225, mon), 23);   // 100 × 12 ÷ 52 = 23.08
  assert.equal(goalWeekly({ kind: 'every', amount: 40, freq: 'biweekly' }, 225, mon), 20);
  assert.equal(goalWeekly({ kind: 'percent', pct: 10 }, 225, mon), 23);                     // 22.5 → 23
  assert.equal(goalWeekly({ kind: 'by', target: 500, date: '2026-10-04' }, 225, mon), 84);   // 6 weeks from Aug 24 → 83.3, rounded up
});
t('scaling a split keeps its shape and adds up', () => {
  const order = ['food', 'fun', 'shopping', 'transport'];
  const scaled = scaleSplit(order, { food: 89, fun: 57, shopping: 45, transport: 34 }, 200);
  assert.equal(Object.values(scaled).reduce((t, v) => t + v, 0), 200);
  assert.deepEqual(scaled, { food: 79, fun: 51, shopping: 40, transport: 30 });
});
t('goal fills on weeks you stay on track, going over eats into it', () => {
  const state = {
    setup: { startDate: '2026-10-19', goal: { kind: 'every', amount: 100, freq: 'monthly', since: '2026-10-19' } },
    budgetHistory: [{ from: '2026-10-19', weekly: 200, save: 25 }],
    tx: [
      { amount: 150, at: new Date(2026, 9, 20).toISOString() },   // week of Oct 19: under → +25
      { amount: 210, at: new Date(2026, 9, 27).toISOString() },   // week of Oct 26: $10 over → +15
      { amount: 260, at: new Date(2026, 10, 3).toISOString() }    // week of Nov 2: $60 over → +0
    ]
  };
  const now = new Date(2026, 10, 10, 12);                        // Tue Nov 10, nothing spent yet this week
  const g = goalProgress(state, now);
  assert.deepEqual(g.weeks.map(w => w.saved), [25, 15, 0]);
  assert.equal(g.total, 40);
  assert.equal(g.pending, 25);
  assert.equal(g.month, 25);                                     // November: Nov 2 week (0) + this week (25)
  assert.equal(g.projected('2026-11-30'), 40 + 25 + 25 * 2);     // Nov 16 and Nov 23 weeks still to come
});
t('projection: plan vs pace, and when the money runs out', () => {
  const state = {
    setup: { startDate: '2026-10-19', semesterEnd: '2026-12-13' },
    budgetHistory: [{ from: '2026-10-19', weekly: 100 }],
    tx: [
      { amount: 140, at: new Date(2026, 9, 21).toISOString() },   // week of Oct 19: 140 of 100
      { amount: 120, at: new Date(2026, 9, 28).toISOString() }    // week of Oct 26: 120 of 100
    ]
  };
  const p = projection(state, new Date(2026, 10, 2, 9));          // Mon Nov 2, 6 weeks to Dec 13
  assert.equal(p.weeks, 6);
  assert.equal(p.start, 600);
  assert.equal(p.pace, 130);                                      // (140 + 120) / (100 + 100) × 100
  assert.equal(p.endLeft, 600 - 130 * 6);
  assert.equal(B_dateKey(p.runOut), '2026-12-04');                // 600 ÷ 130 = 4.6 weeks → 32 days
  // nothing finished yet: this week so far, scaled to 7 days
  const fresh = projection({ setup: { startDate: '2026-11-02', semesterEnd: '2026-12-13' }, budgetHistory: [{ from: '2026-11-02', weekly: 100 }], tx: [{ amount: 30, at: new Date(2026, 10, 3).toISOString() }] }, new Date(2026, 10, 4, 9));
  assert.equal(fresh.pace, 70);                                   // $30 over 3 days → $70 a week
  assert.equal(fresh.runOut, null);
});
t('never negative', () => {
  const r = computeWeekly({ sources: [{ type: 'job', amount: 100, freq: 'monthly' }], bills: [{ type: 'rent', amount: 900 }], semesterEnd: end }, mon);
  assert.equal(r.weekly, 0);
});
t('week keys run Monday to Sunday', () => {
  assert.equal(weekKey(new Date(2026, 9, 19)), '2026-10-19');   // Mon
  assert.equal(weekKey(new Date(2026, 9, 25, 23, 59)), '2026-10-19'); // Sun night
  assert.equal(weekKey(new Date(2026, 9, 26)), '2026-10-26');
  assert.equal(daysLeftInWeek(new Date(2026, 9, 21)), 5);        // Wed
});
t('first week is prorated, streak counts closed weeks', () => {
  const state = {
    setup: { startDate: '2026-10-21' },                 // Wednesday → 5 of 7 days
    budgetHistory: [{ from: '2026-10-19', weekly: 140 }],
    tx: [
      { amount: 90, at: new Date(2026, 9, 22).toISOString() },
      { amount: 120, at: new Date(2026, 9, 28).toISOString() },
      { amount: 160, at: new Date(2026, 10, 3).toISOString() },
      { amount: 20, at: new Date(2026, 10, 10).toISOString() }
    ]
  };
  assert.equal(budgetForWeek(state, '2026-10-19'), 100);
  assert.equal(budgetForWeek(state, '2026-10-26'), 140);
  const now = new Date(2026, 10, 18);                  // Wed Nov 18
  const weeks = closedWeeks(state, now);
  assert.deepEqual(weeks.map(w => w.under), [true, true, false, true]);
  assert.equal(streak(state, now), 1);
  state.tx.pop();                                      // nothing logged in the last week → streak resets
  assert.equal(streak(state, now), 0);
});

t('money in adds to that week and is never counted as spending', () => {
  const state = {
    setup: { startDate: '2026-10-19' },
    budgetHistory: [{ from: '2026-10-19', weekly: 100 }],
    tx: [
      { amount: 80, cat: 'food', at: new Date(2026, 9, 20).toISOString() },
      { amount: 30, kind: 'in', note: 'Refund', at: new Date(2026, 9, 21).toISOString() },
      { amount: 50, kind: 'in', at: new Date(2026, 9, 28).toISOString() }      // only money in that week
    ]
  };
  assert.equal(budgetForWeek(state, '2026-10-19'), 130);
  assert.equal(spentInWeek(state.tx, '2026-10-19'), 80);
  const weeks = closedWeeks(state, new Date(2026, 10, 3));
  assert.deepEqual(weeks.map(w => [w.budget, w.spent, w.logged, w.under]), [[130, 80, 1, true], [150, 0, 0, true]]);
  assert.equal(streak(state, new Date(2026, 10, 3)), 0);                   // a week with only money in doesn't count
});
