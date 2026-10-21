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
    username: null,           // picked in setup; links events across phones and names the backup (account.js)
    consent: null,            // { at, version } once agreed
    sharing: true,            // the student can stop sharing usage in Settings
    setup: null,              // answers + startDate once finished
    budgetHistory: [],        // [{ from: weekKey, weekly }]
    tx: [],                   // [{ id, amount, cat, note, at }]
    alerts: {},               // { weekKey: { 75: true, 100: true } }
    stress: {},               // { weekKey: 1..5 } from before the daily slider
    stressDaily: {},          // { dateKey: 0..100 } money stress slider, once a day
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

const listeners = [];
export function onSave(fn) { listeners.push(fn); }

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked: keep running in memory */ }
  listeners.forEach(fn => fn());
}

export function update(fn) { fn(state); save(); }

// Swap in a backup after logging in on this phone. The phone keeps its own random ID.
export function restore(backup, username) {
  state = { ...fresh(), ...backup, anonId: state.anonId, username };
  save();
}

export function reset() {
  const keepId = state.anonId;   // the same student keeps the same pilot ID and username
  const keepUser = state.username;
  state = fresh();
  state.anonId = keepId;
  state.username = keepUser;
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
