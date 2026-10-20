// Run with: node app/test/budget.test.mjs
import assert from 'node:assert/strict';
import { computeWeekly, weekKey, budgetForWeek, closedWeeks, streak, daysLeftInWeek, suggestSplit, categoryLeft } from '../js/budget.js';

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
  assert.deepEqual(cats, { food: 22, transport: 14, shopping: 11, fun: 8 });
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
