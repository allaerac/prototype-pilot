// Run with: node app/test/budget.test.mjs
import assert from 'node:assert/strict';
import { computeWeekly, weekKey, budgetForWeek, closedWeeks, streak, daysLeftInWeek, suggestSplit, categoryLeft, goalWeekly, scaleSplit, goalProgress, projection, dateKey as B_dateKey } from '../js/budget.js';

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
t('recurring + bills', () => {
  // $600/mo from family ≈ $138.46/wk, $400 every 2 weeks = $200/wk, $50/mo phone ≈ $11.54/wk → 326.9 → 325
  const r = computeWeekly({
    sources: [{ type: 'family', amount: 600, freq: 'monthly' }, { type: 'job', amount: 400, freq: 'biweekly' }],
    bills: [{ type: 'phone', amount: 50 }], semesterEnd: end, cushion: true
  }, mon);
  assert.equal(r.weekly, 325);
});
t('money on hand joins the pot, several jobs add up', () => {
  // $1,600 now + $640 refund = $2,240 → $140/wk with no cushion; two jobs: $100/wk + $200 every 2 weeks = $200/wk → $340
  const r = computeWeekly({
    onHand: 1600,
    sources: [{ type: 'loans', amount: 640, freq: 'once' }, { type: 'job', amount: 100, freq: 'weekly' }, { type: 'job', amount: 200, freq: 'biweekly' }],
    semesterEnd: end, cushion: false
  }, mon);
  assert.equal(r.pot, 2240);
  assert.equal(r.weekly, 340);
});
t('bills have their own frequency', () => {
  // $1,000/wk coming in − $650/mo rent (150/wk) − $20/wk other → 830
  const r = computeWeekly({
    sources: [{ type: 'job', amount: 1000, freq: 'weekly' }],
    bills: [{ type: 'rent', amount: 650, freq: 'monthly' }, { type: 'other', amount: 20, freq: 'weekly' }],
    semesterEnd: end
  }, mon);
  assert.equal(r.weekly, 830);
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
