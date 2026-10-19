// Run with: node app/test/budget.test.mjs
import assert from 'node:assert/strict';
import { computeWeekly, weekKey, budgetForWeek, closedWeeks, streak, daysLeftInWeek } from '../js/budget.js';

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
