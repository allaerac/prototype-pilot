// The student's data lives on their phone in localStorage. Pilot usage events go through track.js.

const KEY = 'prototype.v1';

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}

function fresh() {
  return {
    version: 1,
    anonId: uuid(),
    consent: null,            // { at, version } once agreed
    sharing: true,            // the student can stop sharing usage in Settings
    setup: null,              // answers + startDate once finished
    budgetHistory: [],        // [{ from: weekKey, weekly }]
    tx: [],                   // [{ id, amount, cat, note, at }]
    alerts: {},               // { weekKey: { 75: true, 100: true } }
    stress: {},               // { weekKey: 1..5 }
    surveys: {},              // { id: { at, answers } }
    reported: {},             // { weekKey: true } once week_closed was sent
    prefs: { show21: false }
  };
}

let state;
try {
  state = JSON.parse(localStorage.getItem(KEY)) || fresh();
} catch (e) {
  state = fresh();
}
if (!state.anonId) state.anonId = uuid();

export function get() { return state; }

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked: keep running in memory */ }
}

export function update(fn) { fn(state); save(); }

export function reset() {
  const keepId = state.anonId;   // the same student keeps the same pilot ID
  state = fresh();
  state.anonId = keepId;
  save();
}

export const newId = uuid;

// Testing aid: ?now=2026-10-22T18:40 (or localStorage "prototype.now") pretends it's that moment.
export function now() {
  let fake = null;
  try { fake = new URLSearchParams(location.search).get('now') || localStorage.getItem('prototype.now'); } catch (e) { }
  const d = fake ? new Date(fake) : new Date();
  return isNaN(d) ? new Date() : d;
}
