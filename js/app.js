// Prototype pilot app: setup, Home (ring + quick-log), Deals, Recap, sheets and limit alerts.
// Rendering is plain template strings. State lives in store.js; pilot events go through track.js.
import * as store from './store.js?v=4';
import { track, flush, pending } from './track.js?v=4';
import * as B from './budget.js?v=4';
import { APP_VERSION } from './config.js?v=4';
import { APP_NAME, SEMESTER_END_DEFAULT, CATEGORIES, SOURCES, FREQS, BILLS, CONSENT, DEALS, TIPS } from './content.js?v=4';

const S = store.get;
const app = document.getElementById('app');
const viewsEl = document.getElementById('views');
const sheetEl = document.getElementById('sheet');
const scrimEl = document.getElementById('scrim');
const toastEl = document.getElementById('toast');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, cents) => {
  const v = Math.abs(n);
  const s = cents ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(v).toLocaleString('en-US');
  return (n < 0 ? '−' : '') + '$' + s;
};
const catOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let mode = '';          // 'setup' | 'app'
let tab = 'home';
let sheet = null;       // name of the open sheet
let dealFilter = 'all';
let installPrompt = null;
const lastPct = {};     // ring fills animate from where they were last time

/* ================= Icons ================= */
const miniRing = offset => `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(238,241,247,.15)" stroke-width="3.5"/><circle cx="12" cy="12" r="8.5" fill="none" stroke="url(#pg)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="53.4" stroke-dashoffset="${offset}" transform="rotate(-90 12 12)"/></svg>`;
const faintRing = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(238,241,247,.18)" stroke-width="3.5"/></svg>`;
const dashedRing = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(238,241,247,.25)" stroke-width="2" stroke-dasharray="2 3"/></svg>`;
const xIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>`;
const gearIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;
const backspace = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 5H8l-6 7 6 7h13z"/><path d="M12 9l6 6M18 9l-6 6"/></svg>`;

const C = 2 * Math.PI * 84;
const ringSVG = (key, pct, extra = '') => `
  <svg viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="84" fill="none" stroke="rgba(238,241,247,.07)" stroke-width="15"/>
    <circle class="arc" data-key="${key}" data-pct="${pct}" cx="100" cy="100" r="84" fill="none" stroke="url(#pg)" stroke-width="15" stroke-linecap="round"
      stroke-opacity="${pct > 0 ? 1 : 0}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" transform="rotate(-90 100 100)"/>
    ${extra}
  </svg>`;
const CC = 2 * Math.PI * 24;
const catRing = (key, color, pct) => `
  <svg viewBox="0 0 60 60" aria-hidden="true">
    <circle cx="30" cy="30" r="24" fill="none" stroke="${color}" stroke-opacity=".16" stroke-width="7"/>
    <circle class="cat-arc" data-key="${key}" data-pct="${pct}" cx="30" cy="30" r="24" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"
      stroke-opacity="${pct > 0 ? 1 : 0}" stroke-dasharray="${CC.toFixed(2)}" stroke-dashoffset="${CC.toFixed(2)}" transform="rotate(-90 30 30)"/>
  </svg>`;

// Fill every ring from its last value (or empty) to its new value.
function animateRings(root) {
  root.querySelectorAll('.arc, .seal, .cat-arc').forEach(a => {
    const len = parseFloat(a.getAttribute('stroke-dasharray'));
    const pct = Math.min(1, Math.max(0, parseFloat(a.dataset.pct) || 0));
    const key = a.dataset.key;
    const from = key && key in lastPct ? lastPct[key] : 0;
    a.style.strokeDashoffset = len * (1 - from);
    getComputedStyle(a).strokeDashoffset;   // flush the start value so the change animates
    a.style.strokeDashoffset = len * (1 - pct);
    if (key) lastPct[key] = pct;
  });
}

// Fade a freshly inserted view in. A forced reflow (not requestAnimationFrame) so it also works in background tabs.
function reveal(el) {
  if (!el) return;
  void el.offsetWidth;
  el.classList.add('on');
}

// Lists show as many whole rows as fit in their card; the rest sit behind "See all".
function fitLists() {
  document.querySelectorAll('.list[data-fit]').forEach(list => {
    const rows = Array.from(list.querySelectorAll(':scope > .tx'));
    rows.forEach(r => { r.hidden = false; });
    const limit = list.getBoundingClientRect().bottom;
    let hidden = 0;
    rows.forEach(r => { if (r.getBoundingClientRect().bottom > limit + 1) { r.hidden = true; hidden++; } });
    const more = list.parentElement.querySelector('[data-more-count]');
    if (more) more.textContent = hidden ? '+' + hidden + ' more' : '';
  });
}

/* ================= Dates ================= */
function weekRange(wk) {
  const a = B.parseKey(wk), b = B.addDays(a, 6);
  return a.getMonth() === b.getMonth()
    ? `${MONTHS[a.getMonth()]} ${a.getDate()}–${b.getDate()}`
    : `${MONTHS[a.getMonth()]} ${a.getDate()} – ${MONTHS[b.getMonth()]} ${b.getDate()}`;
}
function greeting(d) {
  const h = d.getHours();
  return h < 5 ? 'Hey, night owl' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
function when(iso) {
  const d = new Date(iso), n = store.now();
  const diff = B.daysBetween(d, n);
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
  if (diff === 0) return 'Today ' + t;
  if (diff === 1) return 'Yesterday';
  return SHORT[d.getDay()] + ' ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
}
function daysLabel(days) {
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return 'Weekdays';
  return days.map(d => SHORT[d]).join(', ');
}
function daysSinceStart() {
  const s = S();
  return s.setup && s.setup.startDate ? B.daysBetween(B.parseKey(s.setup.startDate), store.now()) : 0;
}

/* ================= Week numbers ================= */
function weekStats(wk) {
  const s = S();
  const budget = B.budgetForWeek(s, wk);
  const items = s.tx.filter(x => B.weekKey(new Date(x.at)) === wk);
  const spent = items.reduce((t, x) => t + x.amount, 0);
  const byCat = CATEGORIES.map(c => items.filter(x => x.cat === c.id).reduce((t, x) => t + x.amount, 0));
  return { wk, budget, spent, left: budget - spent, pct: budget > 0 ? spent / budget : (spent > 0 ? 1 : 0), items, byCat };
}
// Days the current week has for this student (the setup week is shorter).
function weekDays(wk) {
  const st = S().setup && S().setup.startDate;
  if (st && B.weekKey(B.parseKey(st)) === wk) return 7 - ((B.parseKey(st).getDay() + 6) % 7);
  return 7;
}

// Send one week_closed event per finished week (the pilot's "weeks under budget" metric).
function reportWeeks() {
  const s = S();
  const weeks = B.closedWeeks(s, store.now());
  let changed = false;
  weeks.forEach(w => {
    if (s.reported[w.wk]) return;
    track('week_closed', { week: w.wk, budget: w.budget, spent: Math.round(w.spent * 100) / 100, under: w.under, logged: s.tx.filter(x => B.weekKey(new Date(x.at)) === w.wk).length });
    s.reported[w.wk] = true;
    changed = true;
  });
  if (changed) store.save();
}

/* ================= Setup ================= */
let draft = null;
let step = 0;
let setupStarted = 0;
const FIRST_STEPS = ['welcome', 'onhand', 'income', 'bills', 'end', 'stress', 'result', 'split', 'ready'];
const REDO_STEPS = ['onhand', 'income', 'bills', 'end', 'result', 'split'];
const steps = () => (draft.redo ? REDO_STEPS : FIRST_STEPS);
const BILL_FREQS = FREQS.filter(f => f.id !== 'once');

// Incomes and bills are lists of rows, so a student can add two jobs or several bills of one type.
let rowKey = 0;
const newRow = (type, amount, freq) => ({ key: String(++rowKey), type, amount, freq });
const rowsOf = kind => (kind === 'inc' ? draft.incomes : draft.bills);

function newDraft(redo) {
  const prev = S().setup;
  const d = {
    redo,
    onHand: '', incomes: [], bills: [],
    semesterEnd: SEMESTER_END_DEFAULT, stress: null, cushion: true, adjust: 0,
    // category split: priority order, dollars per category, and the weekly number the split was made for
    order: CATEGORIES.map(c => c.id), cats: null, splitBase: null, splitEdited: false
  };
  if (prev) {
    // setups saved before "money you have now" existed kept it as a one-time "savings" source
    let have = Number(prev.onHand) || 0;
    (prev.sources || []).forEach(x => {
      if (x.type === 'savings') have += Number(x.amount) || 0;
      else d.incomes.push(newRow(x.type, String(x.amount), x.freq));
    });
    d.onHand = have ? String(have) : '';
    d.bills = (prev.bills || []).map(x => newRow(x.type, String(x.amount), x.freq || 'monthly'));
    d.semesterEnd = prev.semesterEnd || SEMESTER_END_DEFAULT;
    d.cushion = prev.cushion !== false;
    if (prev.cats && prev.order) {
      d.order = prev.order.slice();
      d.cats = { ...prev.cats };
      d.splitBase = prev.weekly;
      d.splitEdited = true;
    }
  }
  if (B.parseKey(d.semesterEnd) <= B.startOfDay(store.now())) d.semesterEnd = '';
  return d;
}
function answers() {
  const row = x => ({ type: x.type, amount: Number(x.amount) || 0, freq: x.freq });
  return {
    onHand: Number(draft.onHand) || 0,
    sources: draft.incomes.map(row),
    bills: draft.bills.map(row),
    semesterEnd: draft.semesterEnd,
    cushion: draft.cushion
  };
}
const chosenWeekly = () => Math.max(0, B.computeWeekly(answers(), store.now()).weekly + draft.adjust);
// The split always matches the current weekly number: if that number changed, start again from the suggestion.
function ensureSplit() {
  const w = chosenWeekly();
  if (!draft.cats || draft.splitBase !== w) {
    draft.cats = B.suggestSplit(draft.order, w);
    draft.splitBase = w;
    draft.splitEdited = false;
  }
}
const splitLeft = () => draft.splitBase - draft.order.reduce((t, id) => t + (Number(draft.cats[id]) || 0), 0);

function stepValid(name) {
  const pos = v => Number(v) > 0;
  if (name === 'split') { ensureSplit(); return splitLeft() === 0; }
  if (name === 'income') return (draft.incomes.length > 0 || pos(draft.onHand)) && draft.incomes.every(x => pos(x.amount));
  if (name === 'bills') return draft.bills.every(x => pos(x.amount));
  if (name === 'end') return !!draft.semesterEnd && B.parseKey(draft.semesterEnd) > B.startOfDay(store.now());
  if (name === 'stress') return !!draft.stress;
  return true;
}

function startSetup(redo, at) {
  draft = newDraft(redo);
  step = at ? Math.max(0, steps().indexOf(at)) : 0;
  draft.at = at;
  // "Change split" keeps the weekly number in force now instead of a fresh suggestion
  if (at === 'split') {
    const cur = B.weeklyFor(S().budgetHistory || [], B.weekKey(store.now()));
    draft.adjust = cur - B.computeWeekly(answers(), store.now()).weekly;
  }
  setupStarted = Date.now();
  mode = 'setup';
  app.dataset.mode = 'setup';
  track(redo ? 'setup_redo_start' : 'setup_start', {});
  renderSetup(true);
}

function setupBody(name) {
  const now = store.now();
  if (name === 'welcome') {
    return `<span class="s-mono when">${esc(APP_NAME)} &middot; ESP201 pilot</span>
      <h3>Know what you can still spend this week.</h3>
      <div class="card">
        <div class="card-head"><b>${esc(CONSENT.title)}</b><span class="s-mono">4 weeks</span></div>
        <ul class="points">${CONSENT.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      </div>`;
  }
  if (name === 'onhand') {
    return `<span class="s-mono when">About a minute</span>
      <h3>How much do you have right now?</h3>
      <p class="sub">What's in your account or wallet that you can spend this semester. $0 is fine.</p>
      <div class="money-row"><div class="row"><label for="onhand">Right now</label>
        <span class="money-in"><span>$</span><input id="onhand" data-onhand inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(draft.onHand)}"></span></div></div>`;
  }
  if (name === 'income') {
    const none = !draft.incomes.length;
    return `<h3>What money is still coming in?</h3>
      <p class="sub">Add each one: a paycheck, money from family, a refund. For a job, use a typical paycheck.</p>
      ${moneyRows('inc', draft.incomes, SOURCES, FREQS)}
      <div class="chips">${SOURCES.map(x => `<button class="chip" data-add="inc:${x.id}">+ ${esc(x.name)}</button>`).join('')}</div>
      ${none ? `<p class="s-soft">${Number(draft.onHand) > 0 ? 'Nothing else coming in? Just continue.' : 'Add at least one, or go back and enter the money you have now.'}</p>` : ''}`;
  }
  if (name === 'bills') {
    return `<h3>Any bills you pay yourself?</h3>
      <p class="sub">Rent, phone, subscriptions: anything that comes out of your own money on a schedule.</p>
      ${moneyRows('bill', draft.bills, BILLS, BILL_FREQS)}
      <div class="chips">
        <button class="chip${draft.bills.length ? '' : ' sel'}" data-nobills>No bills</button>
        ${BILLS.map(x => `<button class="chip" data-add="bill:${x.id}">+ ${esc(x.name)}</button>`).join('')}
      </div>`;
  }
  if (name === 'split') {
    ensureSplit();
    return `<span class="s-mono when">Your ${money(draft.splitBase)} a week</span>
      <h3>Split it up</h3>
      <p class="sub">Put what matters most at the top. If you go over in one, the ones at the bottom shrink first.</p>
      <div class="money-rows">${draft.order.map((id, i) => {
        const c = catOf(id);
        return `<div class="money-row">
          <div class="row"><label for="cat-${id}"><span class="rank">${i + 1}</span>${esc(c.name)}</label>
            <span class="moves">
              <button class="x" data-move="${id}:-1" aria-label="Move ${esc(c.name)} up" ${i === 0 ? 'disabled' : ''}>&uarr;</button>
              <button class="x" data-move="${id}:1" aria-label="Move ${esc(c.name)} down" ${i === draft.order.length - 1 ? 'disabled' : ''}>&darr;</button>
            </span></div>
          <div class="row split-amt">
            <button class="x" data-catadj="${id}:-1" aria-label="$1 less for ${esc(c.name)}">−</button>
            <span class="money-in"><span>$</span><input id="cat-${id}" data-catamt="${id}" inputmode="numeric" autocomplete="off" placeholder="0" value="${esc(draft.cats[id])}"></span>
            <button class="x" data-catadj="${id}:1" aria-label="$1 more for ${esc(c.name)}">+</button>
          </div>
        </div>`;
      }).join('')}</div>
      ${draft.splitEdited ? `<button class="text-btn" data-resplit>Use the suggested split</button>` : ''}`;
  }
  if (name === 'end') {
    return `<h3>When does your semester end?</h3>
      <p class="sub">We spread your money across the weeks until then.</p>
      <input type="date" class="date-in" data-end value="${esc(draft.semesterEnd)}" min="${B.dateKey(B.addDays(now, 1))}">
      ${draft.semesterEnd ? `<p class="s-soft">${Math.max(1, (B.daysBetween(now, B.parseKey(draft.semesterEnd)) + 1) / 7).toFixed(1)} weeks from today</p>` : ''}`;
  }
  if (name === 'stress') {
    return `<h3>How do you feel about money right now?</h3>
      <p class="sub">One tap. We ask again each week to see if the app helps.</p>
      ${scaleHTML('sstress', draft.stress)}`;
  }
  if (name === 'result') {
    const r = B.computeWeekly(answers(), now);
    const weekly = Math.max(0, r.weekly + draft.adjust);
    const daysIn = 7 - ((now.getDay() + 6) % 7);
    const firstWeek = !draft.redo && daysIn < 7 ? Math.round(weekly * daysIn / 7) : null;
    // the math, one line per piece, so a student can see where the number comes from
    const lines = [];
    if (r.onHand > 0) lines.push(['Money you have now', money(r.onHand)]);
    if (r.oneTime > 0) lines.push(['One-time money coming in', money(r.oneTime)]);
    if (r.held > 0) lines.push(['Kept aside as a 10% cushion', money(-r.held)]);
    if (r.pot > 0) lines.push([`Spread over ${r.weeksLeft.toFixed(1)} weeks left`, money(r.potWeekly) + '/wk']);
    if (r.weeklyIn > 0) lines.push(['Paychecks and other income', '+' + money(r.weeklyIn) + '/wk']);
    if (r.weeklyBills > 0) lines.push(['Bills', money(-r.weeklyBills) + '/wk']);
    if (draft.adjust) lines.push(['Your change', (draft.adjust > 0 ? '+' : '') + money(draft.adjust) + '/wk']);
    return `<span class="s-mono when">Your weekly number</span>
      <div class="card result">
        <span class="big">${money(weekly)}</span>
        <span class="s-soft">to spend each week</span>
        <div class="row" style="margin-top:1em;flex-wrap:wrap;gap:.8em">
          <span class="stepper"><button data-adj="-5" aria-label="Lower by $5">−</button><span>${draft.adjust ? (draft.adjust > 0 ? '+' : '−') + '$' + Math.abs(draft.adjust) : 'Suggested'}</span><button data-adj="5" aria-label="Raise by $5">+</button></span>
          ${r.pot > 0 ? `<button class="switch" role="switch" aria-checked="${draft.cushion}" data-cushion>Keep a 10% cushion <i aria-hidden="true"></i></button>` : ''}
        </div>
      </div>
      <div class="breakdown">
        <span class="s-mono">How we got this</span>
        ${lines.map(([k, v]) => `<div class="set-row"><span class="s-soft">${esc(k)}</span><b>${v}</b></div>`).join('')}
        <div class="set-row total"><span>Each week${r.raw - r.weekly >= 0.5 && !draft.adjust ? ' <small>(rounded down to $5)</small>' : ''}</span><b>${money(weekly)}</b></div>
      </div>
      ${r.weekly <= 0 ? `<p class="note">Your bills use up most of what's coming in. Let's double-check the numbers, or set a number with + if you know what works for you.</p>`
        : firstWeek !== null ? `<p class="s-soft">This week is shorter, so it starts at ${money(firstWeek)} for ${SHORT[now.getDay()]}–Sun.</p>` : ''}`;
  }
  if (name === 'ready') {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return `<span class="s-mono when">Last step</span>
      <h3>You're all set.</h3>
      ${isStandalone() ? `<p class="sub">Tap + whenever you buy something. It takes 5 seconds.</p>` : `
      <div class="card">
        <div class="card-head"><b>Add it to your Home Screen</b><span class="s-mono">Important</span></div>
        <p class="s-soft">It opens like a real app, and your phone keeps your data safe. ${ios
          ? 'On iPhone, tap the Share button in Safari, then <b style="color:var(--screen-ink);font-weight:500">Add to Home Screen</b>.'
          : 'In Chrome, tap the ⋮ menu, then <b style="color:var(--screen-ink);font-weight:500">Install app</b> or <b style="color:var(--screen-ink);font-weight:500">Add to Home screen</b>.'}</p>
        ${installPrompt ? `<button class="cta ghost" data-install style="margin-top:1em">Install now</button>` : ''}
      </div>
      <p class="s-soft">Then tap + whenever you buy something. It takes 5 seconds.</p>`}`;
  }
  return '';
}

// One card per income or bill: amount, how often, and a remove button. A second row of the same type is numbered ("Job 2").
function moneyRows(kind, rows, types, freqs) {
  if (!rows.length) return '';
  const seen = {};
  return `<div class="money-rows">${rows.map(x => {
    const n = seen[x.type] = (seen[x.type] || 0) + 1;
    const name = ((types.find(t => t.id === x.type) || {}).name || 'Other') + (n > 1 ? ' ' + n : '');
    return `<div class="money-row">
      <div class="row"><label for="${kind}-${x.key}">${esc(name)}</label>
        <span class="money-in"><span>$</span><input id="${kind}-${x.key}" data-amt="${kind}:${x.key}" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(x.amount)}"></span>
        <button class="x" data-rm="${kind}:${x.key}" aria-label="Remove ${esc(name)}">${xIcon}</button></div>
      <div class="freqs">${freqs.map(f => `<button class="chip${x.freq === f.id ? ' sel' : ''}" data-freq="${kind}:${x.key}:${f.id}">${f.name}</button>`).join('')}</div>
    </div>`;
  }).join('')}</div>`;
}

function setupFoot(name) {
  if (name === 'welcome') {
    return `<button class="cta" data-agree>Agree and start</button>
      <button class="text-btn" data-noshare>Use it without sharing</button>`;
  }
  const last = name === 'split' && draft.redo;
  const label = name === 'result' ? 'Use this number' : name === 'split' ? (draft.redo ? 'Save my plan' : 'Use this split') : name === 'ready' ? 'Start my week' : 'Continue';
  let status = '';
  if (name === 'split') {
    const left = splitLeft();
    status = `<p class="split-status${left === 0 ? ' ok' : ''}" aria-live="polite">${left === 0 ? `All ${money(draft.splitBase)} is split up`
      : left > 0 ? `${money(left)} left to assign` : `${money(-left)} too much: take some off`}</p>`;
  }
  return `${status}<button class="cta" data-next ${stepValid(name) ? '' : 'disabled'}>${label} <span aria-hidden="true">${last ? '' : '&rarr;'}</span></button>`;
}

function renderSetup(animate) {
  const list = steps();
  const name = list[step];
  const canBack = step > 0 && name !== 'ready';
  viewsEl.innerHTML = `<section class="view v-setup${animate ? '' : ' on'}" aria-label="Setup">
    <div class="setup-top">
      ${canBack ? `<button class="back" data-back>&larr; Back</button>` : `<span class="brand">${miniRing(16)}${esc(APP_NAME)}</span>`}
      ${draft.redo && (step === 0 || name === draft.at) ? `<button class="back" data-cancel>Cancel</button>` : `<span class="dots" aria-hidden="true">${list.map((_, i) => `<b class="${i <= step ? 'on' : ''}"></b>`).join('')}</span>`}
    </div>
    <div class="setup-body">${setupBody(name)}</div>
    <div class="setup-foot">${setupFoot(name)}</div>
  </section>`;
  if (animate) reveal(viewsEl.firstElementChild);
}
function refreshSetupFoot() {
  const foot = viewsEl.querySelector('.setup-foot');
  if (foot) foot.innerHTML = setupFoot(steps()[step]);
}

function nextStep() {
  const list = steps();
  const name = list[step];
  if (!stepValid(name)) return;
  track('setup_step', { step: name, redo: !!draft.redo });
  if (name === 'split') { finishSetup(); if (draft.redo) return; }
  if (name === 'ready') { enterApp('home'); return; }
  step = Math.min(list.length - 1, step + 1);
  renderSetup(true);
}

function finishSetup() {
  const now = store.now();
  const a = answers();
  const r = B.computeWeekly(a, now);
  const weekly = Math.max(0, r.weekly + draft.adjust);
  const wk = B.weekKey(now);
  const order = draft.order.slice();
  const cats = Object.fromEntries(order.map(id => [id, Number(draft.cats[id]) || 0]));
  store.update(st => {
    st.setup = {
      ...a,
      order,
      cats,
      startDate: st.setup && st.setup.startDate ? st.setup.startDate : B.dateKey(now),
      completedAt: now.toISOString(),
      suggested: r.weekly,
      weekly,
      baselineStress: draft.redo ? (st.setup && st.setup.baselineStress) : draft.stress
    };
    st.budgetHistory = (st.budgetHistory || []).filter(b => b.from !== wk);
    st.budgetHistory.push({ from: wk, weekly, order, cats });
    st.budgetHistory.sort((x, y) => (x.from < y.from ? -1 : 1));
  });
  track(draft.redo ? 'setup_redo_complete' : 'setup_complete', {
    sources: a.sources.map(x => x.type),
    freqs: a.sources.map(x => x.freq),
    bills: a.bills.map(x => x.type),
    bill_freqs: a.bills.map(x => x.freq),
    has_money_now: a.onHand > 0,
    cat_order: order,
    cat_split: cats,
    cat_split_edited: draft.splitEdited,
    cushion: a.cushion,
    suggested: r.weekly,
    weekly,
    adjusted: draft.adjust !== 0,
    weeks_left: Math.round(r.weeksLeft * 10) / 10,
    seconds: Math.round((Date.now() - setupStarted) / 1000),
    baseline_stress: draft.redo ? undefined : draft.stress
  });
  if (draft.redo) {
    enterApp('home');
    showToast('New plan saved', `${money(weekly)} a week, starting this week.`);
  }
}

/* ================= App views ================= */
function vhead(eyebrow, title, right) {
  return `<div class="vhead">
    <div class="vhead-l">
      <span class="mark" aria-hidden="true">${miniRing(16)}</span>
      <div><span class="s-mono when">${eyebrow}</span><h3>${title}</h3></div>
    </div>
    <div class="vhead-r">${right || ''}</div>
  </div>`;
}
function streakLabel() {
  const n = B.streak(S(), store.now());
  const closed = B.closedWeeks(S(), store.now()).length;
  return { n, label: n ? `${n}-week streak` : closed ? 'New streak this week' : 'Streak starts Sunday', short: n ? `${n}-wk streak` : closed ? 'New streak' : 'Week 1' };
}
function streakPill() {
  const { n, label } = streakLabel();
  return `<span class="streak">${miniRing(n ? 0 : 40)}${label}</span>`;
}

function homeHTML() {
  const now = store.now();
  const wk = B.weekKey(now);
  const w = weekStats(wk);
  const split = B.splitFor(S().budgetHistory || [], wk);
  const spentBy = Object.fromEntries(CATEGORIES.map((c, i) => [c.id, w.byCat[i]]));
  const daysLeft = B.daysLeftInWeek(now);
  const total = weekDays(wk);
  const elapsed = Math.max(0, total - daysLeft);
  let pace, warm = false;
  if (w.budget <= 0) { pace = 'Set a weekly number in Settings'; warm = true; }
  else if (w.left <= 0) { warm = true; pace = w.left < 0 ? `${money(-w.left)} past this week's number · resets Monday` : `That's this week's number · resets Monday`; }
  else {
    const perDay = Math.floor(w.left / daysLeft);
    const expected = w.budget * (elapsed + 1) / total;   // what's fine to have spent by the end of today
    if (w.spent <= expected + 0.5) pace = `On pace · about ${money(perDay)} a day keeps you there`;
    else { warm = true; pace = `About ${money(perDay)} a day for the rest of the week`; }
  }
  const items = w.items.slice().sort((a, b) => (a.at < b.at ? 1 : -1));
  const rows = items.map(txRow).join('');
  return `<section class="view" data-view="home" aria-label="Home">
    ${vhead(`<span class="only-portrait">${streakLabel().short} &middot; </span>${weekRange(wk)}`, greeting(now), `<button class="icon-btn" data-sheet="settings" aria-label="Settings">${gearIcon}</button>`)}
    <div class="grid2">
      <div class="card hero">
        <div class="hero-top">${streakPill()}</div>
        <div class="big-ring">
          ${ringSVG('home', Math.min(1, w.pct))}
          <div class="ring-center">
            <span class="s-mono">Left this week</span>
            <span class="ring-num">${money(Math.max(0, w.left))}</span>
            <span class="s-soft">of ${money(w.budget)} &middot; ${Math.round(w.pct * 100)}% used</span>
          </div>
        </div>
        <span class="pace${warm ? ' warm' : ''}">${pace}</span>
      </div>
      <div class="col">
        <div class="card">
          ${split ? `<div class="card-head"><b>By category</b><span class="s-mono">left to spend</span></div>
          <div class="cats">${B.categoryLeft(split, w.budget, spentBy).map(r => {
            const c = catOf(r.id);
            // the ring fills as the category gets used up, including money it gave to cover another one
            const used = r.budget > 0 ? 1 - r.left / r.budget : (r.spent > 0 ? 1 : 0);
            const note = r.over >= 0.5 ? `${money(r.over)} over` : r.covered >= 0.5 ? `−${money(r.covered)} to cover` : `of ${money(r.budget)}`;
            return `<div class="cat${r.over >= 0.5 ? ' over' : ''}"><div class="cat-ring">${catRing('cat-' + c.id, c.color, Math.min(1, used))}<span>${money(r.left)}</span></div><b>${esc(c.name)}</b><em>${note}</em></div>`;
          }).join('')}</div>`
          : `<div class="card-head"><b>By category</b><span class="s-mono">of ${money(w.budget)}</span></div>
          <div class="cats">${CATEGORIES.map((c, i) => {
            const pct = w.budget > 0 ? w.byCat[i] / w.budget : 0;
            return `<div class="cat"><div class="cat-ring">${catRing('cat-' + c.id, c.color, Math.min(1, pct))}<span>${Math.round(pct * 100)}%</span></div><b>${esc(c.name)}</b><em>${money(w.byCat[i])}</em></div>`;
          }).join('')}</div>`}
        </div>
        <div class="card fill">
          <div class="card-head"><b>Logged this week</b><span class="s-mono">${items.length} ${items.length === 1 ? 'purchase' : 'purchases'}</span></div>
          ${items.length ? `<div class="list" data-fit>${rows}</div>
            <div class="more"><button class="link" data-sheet="purchases">See all purchases &rarr;</button><span class="s-mono" data-more-count></span></div>`
          : `<div class="empty"><b>Nothing logged yet</b><span class="s-soft">Tap + after you buy something. It takes 5 seconds.</span></div>`}
        </div>
      </div>
    </div>
  </section>`;
}
function txRow(x) {
  const c = catOf(x.cat);
  return `<button class="tx" data-tx="${x.id}">
    <span class="tx-icon"><i style="background:${c.color}"></i></span>
    <span class="tx-main"><span>${esc(x.note || c.name)}</span><span>${x.note ? esc(c.name) + ' &middot; ' : ''}${when(x.at)}</span></span>
    <span class="tx-amt">−${money(x.amount, true)}</span>
  </button>`;
}

function visibleDeals() {
  const show21 = S().prefs.show21;
  return DEALS.filter(d => !d.age21 || show21);
}
function dealRow(d) {
  return `<button class="tx" data-deal="${d.id}">
    <span class="tx-icon">${esc(d.venue[0])}</span>
    <span class="tx-main"><span>${esc(d.venue)}${d.age21 ? '<span class="tag21">21+</span>' : ''}</span><span>${esc(d.title)} &middot; ${daysLabel(d.days)}</span></span>
    <span class="deal-amt">${esc(d.price)}</span>
  </button>`;
}
function dealsHTML() {
  const now = store.now();
  const today = now.getDay();
  const all = visibleDeals();
  const todays = all.filter(d => d.cat !== 'national' && d.days.includes(today));
  const lead = todays.find(d => d.cat === 'food') || todays[0];
  const rest = todays.filter(d => d !== lead);
  const filters = [['all', 'All'], ['food', 'Food'], ['free', 'Free'], ...(S().prefs.show21 ? [['drinks', 'Drinks']] : []), ['national', 'National']];
  if (!filters.some(f => f[0] === dealFilter)) dealFilter = 'all';
  const filtered = all.filter(d => dealFilter === 'all' || d.cat === dealFilter)
    .sort((a, b) => (b.days.includes(today) && b.cat !== 'national') - (a.days.includes(today) && a.cat !== 'national'));
  return `<section class="view" data-view="deals" aria-label="Deals">
    ${vhead(`${DAYS[today]} &middot; Oxford`, 'Student deals', `<button class="switch" role="switch" aria-checked="${S().prefs.show21}" data-toggle21>21+ deals <i aria-hidden="true"></i></button>`)}
    <div class="grid2">
      <div class="card feature">
        <div class="card-head"><span class="s-mono live">Today &middot; ${todays.length} ${todays.length === 1 ? 'deal' : 'deals'}</span></div>
        ${lead ? `<button class="lead-deal" data-deal="${lead.id}">
            <span class="name">${esc(lead.venue)}</span>
            <p>${esc(lead.title)}</p>
            <span class="s-soft">${esc([lead.price, lead.time].filter(Boolean).join(' · '))}</span>
          </button>
          <div class="list" data-fit>${rest.map(dealRow).join('')}</div>`
        : `<div class="empty"><b>Nothing posted for today</b><span class="s-soft">Check All deals for the rest of the week.</span></div>`}
      </div>
      <div class="card fill">
        <div class="card-head"><div class="chips">${filters.map(([id, n]) => `<button class="chip${dealFilter === id ? ' sel' : ''}" data-filter="${id}">${n}</button>`).join('')}</div></div>
        <div class="list" data-fit>${filtered.map(dealRow).join('')}</div>
        <div class="more"><button class="link" data-sheet="deals">See all deals &rarr;</button><span class="s-mono" data-more-count></span></div>
      </div>
    </div>
  </section>`;
}

// Which week the Recap shows: from 6 pm Sunday the week that's ending, otherwise the last finished week,
// and before any week has finished, the first week so far.
function recapWeek() {
  const now = store.now();
  const cur = B.weekKey(now);
  if (now.getDay() === 0 && now.getHours() >= 18) return { wk: cur, kind: 'closing' };
  const closed = B.closedWeeks(S(), now);
  if (closed.length) return { wk: closed[closed.length - 1].wk, kind: 'closed' };
  return { wk: cur, kind: 'first' };
}
function dueSurvey() {
  const s = S();
  const d = daysSinceStart();
  if (d >= 27 && !s.surveys.final) return 'final';
  if (d >= 13 && !s.surveys.midpoint && !s.surveys.final) return 'midpoint';
  return null;
}
function scaleHTML(attr, value) {
  const labels = ['Calm', '', 'Okay', '', 'Stressed'];
  return `<div class="scale">${[1, 2, 3, 4, 5].map(n => `<button class="${value === n ? 'sel' : ''}" data-${attr}="${n}" aria-pressed="${value === n}"><b>${n}</b><span>${labels[n - 1] || '&nbsp;'}</span></button>`).join('')}</div>`;
}
function recapHTML() {
  const s = S();
  const now = store.now();
  const { wk, kind } = recapWeek();
  const w = weekStats(wk);
  const final = kind !== 'first';
  const under = w.spent <= w.budget + 0.005;
  let n = B.streak(s, now);
  if (kind === 'closing' && under && w.items.length) n += 1;
  const closed = B.closedWeeks(s, now).slice(-7);
  const empty = final && !w.items.length;
  const sealed = final && under && w.budget > 0 && !empty;
  const seal = sealed ? `<circle class="seal" data-key="seal-${wk}" data-pct="1" cx="100" cy="100" r="98" fill="none" stroke="#3BCFBF" stroke-width="3.5" stroke-linecap="round"
      stroke-dasharray="${(2 * Math.PI * 98).toFixed(2)}" stroke-dashoffset="${(2 * Math.PI * 98).toFixed(2)}" transform="rotate(-90 100 100)"/>` : '';
  const head = kind === 'first' ? 'Your first recap lands Sunday.' : empty ? 'Nothing logged that week.' : sealed ? 'You closed the week.' : 'A heavier week.';
  const sub = kind === 'first' ? `${money(w.spent, true)} spent so far` : empty ? 'Tap + as you spend and the ring tracks your week.' : sealed ? `${money(w.budget - w.spent)} under budget` : `That happens. Monday is a fresh start.`;
  const total = w.spent;
  const tip = TIPS[Math.abs(Math.floor(B.parseKey(wk) / 6048e5)) % TIPS.length];
  const survey = dueSurvey();
  const stressNow = s.stress[wk] || null;
  return `<section class="view" data-view="recap" aria-label="Recap">
    ${vhead(`${kind === 'first' ? 'This week' : kind === 'closing' ? 'Tonight' : 'Last week'} &middot; ${weekRange(wk)}`, 'Your week, recapped')}
    <div class="grid2">
      <div class="card recap-hero">
        <div class="recap-rings">
          ${ringSVG('recap-' + wk, Math.min(1, w.pct), seal)}
          <div class="check"><span class="s-mono">Spent</span><strong>${money(w.spent)}</strong><span class="s-soft">of ${money(w.budget)}</span></div>
          ${sealed ? [0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => `<span class="spark" style="--a:${a}deg;background:${['#6474FF', '#3BCFBF', '#FF9FBD'][i % 3]}"></span>`).join('') : ''}
        </div>
        <div><h4>${head}</h4><span class="s-soft">${sub}</span><div class="only-portrait-block" style="margin-top:.6em">${streakPill()}</div></div>
      </div>
      <div class="stack">
        <div class="card streak-card">
          <div class="card-head"><b>Streak</b><span class="s-mono">${n} ${n === 1 ? 'week' : 'weeks'} in a row</span></div>
          <div class="weeks">${closed.map(c => (B.counts(c) ? miniRing(0) : faintRing)).join('')}${kind === 'closing' ? (under && w.items.length ? miniRing(0) : faintRing) : dashedRing}</div>
        </div>
        <div class="card">
          <div class="card-head"><b>Where it went</b><span class="s-mono">${money(total)} total</span></div>
          <div class="bar">${total > 0 ? CATEGORIES.map((c, i) => w.byCat[i] > 0 ? `<span style="width:${(w.byCat[i] / total * 100).toFixed(1)}%;background:${c.color}"></span>` : '').join('') : ''}</div>
          <div class="legend">${CATEGORIES.map((c, i) => `<div><i style="background:${c.color}"></i>${esc(c.name)}<b>${money(w.byCat[i])}</b></div>`).join('')}</div>
        </div>
        <div class="card">
          <div class="card-head"><b>How ${kind === 'closed' ? 'did you feel about money last week' : 'do you feel about money this week'}?</b></div>
          ${scaleHTML('stress', stressNow)}
        </div>
        ${survey ? `<button class="nudge" data-sheet="survey"><span><b>Got 30 seconds?</b><br><span class="s-soft">Tell us how the app is going.</span></span><span aria-hidden="true">&rarr;</span></button>`
        : `<div class="card tip"><div class="card-head"><b>One tip</b><span class="s-mono">20-second read</span></div><p>${esc(tip)}</p></div>`}
      </div>
    </div>
  </section>`;
}

function renderApp(animate) {
  const html = tab === 'deals' ? dealsHTML() : tab === 'recap' ? recapHTML() : homeHTML();
  viewsEl.innerHTML = html;
  const view = viewsEl.firstElementChild;
  if (animate) reveal(view);
  else view.classList.add('on');
  app.querySelectorAll('[data-tab]').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  animateRings(view);
  fitLists();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitLists);
}

function enterApp(t) {
  mode = 'app';
  app.dataset.mode = 'app';
  go(t || 'home', true);
}
function go(t, force) {
  if (t === tab && !force) return;
  tab = t;
  renderApp(true);
  track('screen_view', { screen: t });
  if (t === 'recap') { const r = recapWeek(); track('recap_view', { week: r.wk, kind: r.kind }); }
}

/* ================= Sheets ================= */
let logDraft = null;
let txOpen = null;
let confirmDel = false;
let confirmReset = false;
let surveyDraft = {};

function openSheet(name, arg) {
  sheet = name;
  if (name === 'log') {
    const last = S().tx[S().tx.length - 1];
    logDraft = { amount: '', cat: last ? last.cat : 'food', note: '', day: 'today' };
    track('log_open', {});
  }
  if (name === 'tx') { txOpen = arg; confirmDel = false; }
  if (name === 'deal') { txOpen = arg; const d = DEALS.find(x => x.id === arg); track('deal_open', { deal: arg, cat: d && d.cat }); }
  if (name === 'settings') confirmReset = false;
  if (name === 'survey') { surveyDraft = { id: dueSurvey() || 'final' }; track('survey_open', { survey: surveyDraft.id }); }
  if (name === 'feedback') surveyDraft = { text: '' };
  renderSheet();
  scrimEl.classList.add('on');
  sheetEl.classList.add('on');
  const focus = sheetEl.querySelector('[data-autofocus]');
  if (focus && matchMedia('(pointer: fine)').matches) focus.focus();
}
function closeSheet() {
  if (!sheet) return;
  sheet = null;
  scrimEl.classList.remove('on');
  sheetEl.classList.remove('on');
}
function sheetHead(title) {
  return `<div class="sheet-head"><h4 id="sheetTitle">${title}</h4><button class="x" data-close aria-label="Close">${xIcon}</button></div>`;
}
function amountText(a) {
  if (!a) return '0';
  const [i, d] = a.split('.');
  return Number(i || 0).toLocaleString('en-US') + (d !== undefined ? '.' + d : '');
}

function renderSheet() {
  const s = S();
  let html = '';
  if (sheet === 'log') {
    const valid = Number(logDraft.amount) > 0;
    html = `${sheetHead('Log a purchase')}
      <div class="amount" aria-live="polite"><small>$</small>${amountText(logDraft.amount)}</div>
      <div class="chips" style="justify-content:center">${CATEGORIES.map(c => `<button class="chip${logDraft.cat === c.id ? ' sel' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('')}</div>
      <div class="row">
        <input class="field" data-note maxlength="40" placeholder="Where? (optional)" value="${esc(logDraft.note)}" autocomplete="off">
        <span class="chips" style="flex-wrap:nowrap">${['today', 'yesterday'].map(d => `<button class="chip${logDraft.day === d ? ' sel' : ''}" data-day="${d}">${d === 'today' ? 'Today' : 'Yesterday'}</button>`).join('')}</span>
      </div>
      <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map(k => `<button data-key="${k}" aria-label="${k === 'del' ? 'Delete' : k}">${k === 'del' ? backspace : k}</button>`).join('')}</div>
      <button class="cta" data-save-tx ${valid ? '' : 'disabled'}>${valid ? 'Add ' + money(Number(logDraft.amount), true) : 'Enter an amount'}</button>`;
  } else if (sheet === 'purchases') {
    const groups = {};
    s.tx.slice().sort((a, b) => (a.at < b.at ? 1 : -1)).forEach(x => { (groups[B.weekKey(new Date(x.at))] ||= []).push(x); });
    const cur = B.weekKey(store.now());
    html = `${sheetHead('All purchases')}
      <div class="sheet-body">${Object.keys(groups).length ? Object.keys(groups).map(wk => `
        <span class="s-mono group-label">${wk === cur ? 'This week' : 'Week of ' + weekRange(wk)} &middot; ${money(groups[wk].reduce((t, x) => t + x.amount, 0), true)}</span>
        <div>${groups[wk].map(txRow).join('')}</div>`).join('') : '<p class="s-soft">Nothing logged yet.</p>'}</div>`;
  } else if (sheet === 'tx') {
    const x = s.tx.find(t => t.id === txOpen);
    if (!x) { closeSheet(); return; }
    const c = catOf(x.cat);
    const d = new Date(x.at);
    html = `${sheetHead(esc(x.note || c.name))}
      <div class="amount"><small>$</small>${amountText(x.amount.toFixed(2))}</div>
      <p class="s-soft" style="text-align:center">${esc(c.name)} &middot; ${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}</p>
      <button class="cta ghost danger" data-del-tx>${confirmDel ? 'Tap again to remove' : 'Remove this purchase'}</button>`;
  } else if (sheet === 'deal') {
    const d = DEALS.find(t => t.id === txOpen);
    if (!d) { closeSheet(); return; }
    html = `${sheetHead(esc(d.venue) + (d.age21 ? '<span class="tag21">21+</span>' : ''))}
      <p style="font-family:var(--display);font-size:1.6em;line-height:1.15;letter-spacing:-.02em">${esc(d.title)}</p>
      <div class="set-row"><div><span class="s-mono">When</span><span>${daysLabel(d.days)}${d.time ? ' · ' + esc(d.time) : ''}</span></div><span class="deal-amt" style="font-size:1em">${esc(d.price)}</span></div>
      <p class="s-soft">${d.cat === 'national' ? 'National student offer. Prices and terms can change, so check before you sign up.' : 'Posted on the venue\'s website. Deals can change, so check before you go.'}${d.checked ? ' Last checked ' + esc(d.checked) + '.' : ''}</p>
      <a class="cta ghost" href="${esc(d.source)}" target="_blank" rel="noopener" data-source="${d.id}" style="text-decoration:none">See where this was posted &nearr;</a>`;
  } else if (sheet === 'deals') {
    const today = store.now().getDay();
    const all = visibleDeals().filter(d => dealFilter === 'all' || d.cat === dealFilter);
    html = `${sheetHead('All deals')}
      <div class="sheet-body">${[1, 2, 3, 4, 5, 6, 0].map(day => {
        const list = all.filter(d => d.cat !== 'national' && d.days.includes(day));
        return list.length ? `<span class="s-mono group-label">${DAYS[day]}${day === today ? ' · today' : ''}</span><div>${list.map(dealRow).join('')}</div>` : '';
      }).join('')}
      ${all.some(d => d.cat === 'national') ? `<span class="s-mono group-label">National</span><div>${all.filter(d => d.cat === 'national').map(dealRow).join('')}</div>` : ''}</div>`;
  } else if (sheet === 'settings') {
    const wk = B.weekKey(store.now());
    const n = pending();
    html = `${sheetHead('Settings')}
      <div class="sheet-body">
        <div>
          <div class="set-row"><div><span>Weekly number</span><small>${money(B.weeklyFor(s.budgetHistory, wk))} a week until ${s.setup ? MONTHS[B.parseKey(s.setup.semesterEnd).getMonth()] + ' ' + B.parseKey(s.setup.semesterEnd).getDate() : '—'}</small></div><button class="chip" data-redo>Redo setup</button></div>
          ${s.setup ? `<div class="set-row"><div><span>Category split</span><small>${(s.setup.order || CATEGORIES.map(c => c.id)).map(id => catOf(id).name).join(' › ')}</small></div><button class="chip" data-resplit-open>Change split</button></div>` : ''}
          <div class="set-row"><div><span>Show 21+ deals</span><small>Drink specials at Uptown bars</small></div><button class="switch" role="switch" aria-checked="${s.prefs.show21}" data-toggle21><i aria-hidden="true"></i></button></div>
          <div class="set-row"><div><span>Share usage with the ESP201 team</span><small>Random ID ${esc(s.anonId.slice(0, 8))}${n ? ` · ${n} waiting to send` : ''}</small></div><button class="switch" role="switch" aria-checked="${!!(s.consent && s.sharing)}" data-sharing><i aria-hidden="true"></i></button></div>
          <div class="set-row"><div><span>Send feedback</span><small>Anything that's confusing, broken or missing</small></div><button class="chip" data-sheet="feedback">Write</button></div>
          ${!isStandalone() ? `<div class="set-row"><div><span>Add to Home Screen</span><small>Keeps your data safe and opens like an app</small></div>${installPrompt ? '<button class="chip" data-install>Install</button>' : ''}</div>` : ''}
          <div class="set-row"><div><span class="danger">Erase everything on this phone</span><small>Purchases, setup and settings</small></div><button class="chip danger" data-reset>${confirmReset ? 'Tap again' : 'Erase'}</button></div>
        </div>
        <p class="s-mono" style="text-align:center">${esc(APP_NAME)} ${APP_VERSION} &middot; ESP201 pilot</p>
      </div>`;
  } else if (sheet === 'survey') {
    const id = surveyDraft.id;
    const q = (label, inner) => `<div><p style="margin-bottom:.6em">${label}</p>${inner}</div>`;
    const opts = (key, list) => `<div class="chips">${list.map(o => `<button class="chip${surveyDraft[key] === o ? ' sel' : ''}" data-sv="${key}" data-val="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
    const ready = !!surveyDraft.satisfaction && (id !== 'final' || (surveyDraft.keep && surveyDraft.pay));
    html = `${sheetHead(id === 'final' ? 'Last check-in' : 'Quick check-in')}
      <div class="sheet-body">
        ${q('How do you like the app so far?', `<div class="scale">${[1, 2, 3, 4, 5].map(n => `<button class="${surveyDraft.satisfaction === n ? 'sel' : ''}" data-sv="satisfaction" data-val="${n}"><b>${n}</b><span>${['Not really', '', 'It\'s okay', '', 'Love it'][n - 1] || '&nbsp;'}</span></button>`).join('')}</div>`)}
        ${id === 'final' ? q('Would you keep using it after the pilot?', opts('keep', ['Yes', 'Maybe', 'No']))
          + q('What would you pay for it?', opts('pay', ['Free only', 'Up to $2/month', '$3–5/month', 'My parents would pay'])) : ''}
        ${q('What would make it better? <span class="s-soft">(optional)</span>', `<textarea class="field" data-svtext maxlength="600" rows="3">${esc(surveyDraft.text || '')}</textarea>`)}
      </div>
      <button class="cta" data-sv-submit ${ready ? '' : 'disabled'}>Send</button>`;
  } else if (sheet === 'feedback') {
    const can = s.consent && s.sharing;
    html = `${sheetHead('Send feedback')}
      ${can ? `<textarea class="field" data-fbtext maxlength="1000" rows="5" placeholder="What's confusing, broken or missing?" data-autofocus>${esc(surveyDraft.text || '')}</textarea>
      <button class="cta" data-fb-submit ${surveyDraft.text && surveyDraft.text.trim() ? '' : 'disabled'}>Send to the team</button>`
      : `<p class="s-soft">Feedback goes through usage sharing, which is off. Turn it on in Settings to send feedback.</p>`}`;
  }
  sheetEl.innerHTML = html;
}

function keypad(k) {
  let a = logDraft.amount;
  if (k === 'del') a = a.slice(0, -1);
  else if (k === '.') { if (!a.includes('.')) a = (a || '0') + '.'; }
  else {
    const [i, d] = a.split('.');
    if (d !== undefined) { if (d.length < 2) a += k; }
    else if ((i || '').length < 4) a = (a === '0' ? '' : a) + k;
  }
  logDraft.amount = a;
  renderSheet();
}

function saveTx() {
  const amount = Math.round(Number(logDraft.amount) * 100) / 100;
  if (!(amount > 0)) return;
  const now = store.now();
  const at = logDraft.day === 'yesterday' ? new Date(B.addDays(B.startOfDay(now), -1).getTime() + 12 * 3600e3) : now;
  const wk = B.weekKey(at);
  const before = weekStats(wk);
  const x = { id: store.newId(), amount, cat: logDraft.cat, note: logDraft.note.trim(), at: at.toISOString() };
  store.update(s => { s.tx.push(x); });
  const after = weekStats(wk);
  track('tx_add', { amount, cat: x.cat, day: logDraft.day, has_note: !!x.note, week: wk, pct_after: Math.round(after.pct * 100) / 100 });
  closeSheet();
  if (mode === 'app') { if (tab !== 'home') go('home'); else renderApp(false); }
  if (wk === B.weekKey(now)) checkAlerts(before, after);
}

// Gentle limit alerts at 75% and 100%. Each one fires once per week.
function checkAlerts(before, after) {
  if (after.budget <= 0) return;
  const s = S();
  const a = (s.alerts[after.wk] ||= {});
  const daysLeft = B.daysLeftInWeek(store.now());
  let fired = null;
  if (after.pct >= 1 && before.pct < 1 && !a[100]) {
    fired = 100;
    showToast("That's this week's number.", 'Next week starts fresh on Monday. Anything else this week shows as over, and that\'s okay.');
  } else if (after.pct >= 0.75 && before.pct < 0.75 && !a[75] && after.pct < 1) {
    fired = 75;
    const perDay = Math.floor(after.left / daysLeft);
    showToast("You've used 75% of this week.", `${money(after.left)} left until Sunday${daysLeft > 1 ? `, about ${money(perDay)} a day` : ''}.`);
  }
  if (fired) {
    a[fired] = true;
    if (fired === 100) a[75] = true;
    store.save();
    track('alert_shown', { threshold: fired, week: after.wk });
  }
}

let toastTimer = 0;
function showToast(title, body) {
  toastEl.innerHTML = `<div class="row between">
      <span class="row"><span class="app-ico">${miniRing(13)}</span><b style="font-size:1em">${esc(APP_NAME)}</b></span>
      <span class="row"><span class="s-soft">now</span><button class="x" data-dismiss aria-label="Close notification">${xIcon}</button></span>
    </div>
    <b>${esc(title)}</b>
    <p>${esc(body)}</p>`;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 9000);
}

/* ================= Events ================= */
app.addEventListener('click', e => {
  const t = e.target.closest('button, a, [data-close]');
  if (!t) return;
  const d = t.dataset;
  const s = S();

  if ('dismiss' in d) { toastEl.classList.remove('on'); return; }
  if ('close' in d) { closeSheet(); return; }

  // setup
  if ('agree' in d) { store.update(st => { st.consent = { at: new Date().toISOString(), version: CONSENT.version }; st.sharing = true; }); track('consent_given', { version: CONSENT.version }); track('setup_start', {}); nextStep(); return; }
  if ('noshare' in d) { store.update(st => { st.consent = null; st.sharing = false; }); nextStep(); return; }
  if ('next' in d) { nextStep(); return; }
  if ('back' in d) { step = Math.max(0, step - 1); renderSetup(true); return; }
  if ('cancel' in d) { enterApp('home'); return; }
  if (d.add) {
    const [kind, type] = d.add.split(':');
    const r = newRow(type, '', kind === 'inc' ? SOURCES.find(x => x.id === type).freq : 'monthly');
    rowsOf(kind).push(r);
    renderSetup(false);
    const input = document.getElementById(kind + '-' + r.key);
    if (input) input.focus();
    return;
  }
  if (d.rm) { const [kind, key] = d.rm.split(':'); const rows = rowsOf(kind); rows.splice(rows.findIndex(x => x.key === key), 1); renderSetup(false); return; }
  if (d.freq) { const [kind, key, f] = d.freq.split(':'); rowsOf(kind).find(x => x.key === key).freq = f; renderSetup(false); return; }
  if ('nobills' in d) { draft.bills = []; renderSetup(false); return; }
  if (d.move) {
    const [id, dir] = d.move.split(':');
    const i = draft.order.indexOf(id), j = i + Number(dir);
    if (j < 0 || j >= draft.order.length) return;
    [draft.order[i], draft.order[j]] = [draft.order[j], draft.order[i]];
    // until the student sets amounts themselves, the suggestion follows the new order
    if (!draft.splitEdited) draft.cats = B.suggestSplit(draft.order, draft.splitBase);
    renderSetup(false);
    return;
  }
  if (d.catadj) { const [id, n] = d.catadj.split(':'); draft.cats[id] = Math.max(0, (Number(draft.cats[id]) || 0) + Number(n)); draft.splitEdited = true; renderSetup(false); return; }
  if ('resplit' in d) { draft.cats = B.suggestSplit(draft.order, draft.splitBase); draft.splitEdited = false; renderSetup(false); return; }
  if (d.sstress) { draft.stress = +d.sstress; renderSetup(false); return; }
  if ('cushion' in d) { draft.cushion = !draft.cushion; renderSetup(false); return; }
  if (d.adj) { draft.adjust += +d.adj; const base = B.computeWeekly(answers(), store.now()).weekly; if (base + draft.adjust < 0) draft.adjust = -base; renderSetup(false); return; }
  if ('install' in d) { if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice.then(c => track('install_prompt', { outcome: c.outcome })); installPrompt = null; } if (mode === 'setup') renderSetup(false); else renderSheet(); return; }

  // app
  if (d.tab) { closeSheet(); go(d.tab); return; }
  if ('log' in d) { openSheet('log'); return; }
  if (d.sheet) { openSheet(d.sheet); return; }
  if (d.tx) { openSheet('tx', d.tx); return; }
  if (d.deal) { openSheet('deal', d.deal); return; }
  if (d.source) { track('deal_source', { deal: d.source }); return; }
  if (d.filter) { dealFilter = d.filter; renderApp(false); return; }
  if ('toggle21' in d) {
    store.update(st => { st.prefs.show21 = !st.prefs.show21; });
    track('deals_21_toggle', { on: s.prefs.show21 });
    if (sheet === 'settings') renderSheet();
    if (mode === 'app') renderApp(false);
    return;
  }
  if (d.stress) {
    const { wk } = recapWeek();
    store.update(st => { st.stress[wk] = +d.stress; });
    track('stress_checkin', { week: wk, score: +d.stress });
    renderApp(false);
    return;
  }

  // log sheet
  if (d.key) { keypad(d.key); return; }
  if (d.cat) { logDraft.cat = d.cat; renderSheet(); return; }
  if (d.day) { logDraft.day = d.day; renderSheet(); return; }
  if ('saveTx' in d) { saveTx(); return; }
  if ('delTx' in d) {
    if (!confirmDel) { confirmDel = true; renderSheet(); return; }
    const x = s.tx.find(t2 => t2.id === txOpen);
    store.update(st => { st.tx = st.tx.filter(t2 => t2.id !== txOpen); });
    if (x) track('tx_delete', { amount: x.amount, cat: x.cat, age_days: B.daysBetween(new Date(x.at), store.now()) });
    closeSheet();
    renderApp(false);
    return;
  }

  // settings
  if ('redo' in d) { closeSheet(); startSetup(true); return; }
  if ('resplitOpen' in d) { closeSheet(); startSetup(true, 'split'); return; }
  if ('sharing' in d) {
    const on = !(s.consent && s.sharing);
    if (!on) track('sharing_off', {});
    store.update(st => { if (on && !st.consent) st.consent = { at: new Date().toISOString(), version: CONSENT.version }; st.sharing = on; });
    if (on) track('sharing_on', {});
    renderSheet();
    return;
  }
  if ('reset' in d) {
    if (!confirmReset) { confirmReset = true; renderSheet(); return; }
    track('reset', {});
    store.reset();
    closeSheet();
    startSetup(false);
    return;
  }

  // surveys and feedback
  if (d.sv) { surveyDraft[d.sv] = d.sv === 'satisfaction' ? +d.val : d.val; renderSheet(); return; }
  if ('svSubmit' in d) {
    const id = surveyDraft.id;
    const ans = { satisfaction: surveyDraft.satisfaction, keep: surveyDraft.keep, pay: surveyDraft.pay, text: (surveyDraft.text || '').trim().slice(0, 600) };
    store.update(st => { st.surveys[id] = { at: new Date().toISOString(), answers: ans }; });
    track('survey_response', { survey: id, ...ans });
    closeSheet();
    renderApp(false);
    showToast('Thank you!', 'That really helps the team.');
    return;
  }
  if ('fbSubmit' in d) {
    const text = (surveyDraft.text || '').trim().slice(0, 1000);
    if (!text) return;
    track('feedback', { text });
    closeSheet();
    showToast('Sent to the team', 'Thanks for helping make it better.');
    return;
  }
});

app.addEventListener('input', e => {
  const t = e.target;
  const d = t.dataset;
  const clean = v => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').replace(/^(\d{0,6})\d*/, '$1').replace(/(\.\d{0,2})\d*/, '$1');
  if (d.amt) { t.value = clean(t.value); const [kind, key] = d.amt.split(':'); rowsOf(kind).find(x => x.key === key).amount = t.value; refreshSetupFoot(); return; }
  if ('onhand' in d) { t.value = clean(t.value); draft.onHand = t.value; refreshSetupFoot(); return; }
  if (d.catamt) { t.value = t.value.replace(/\D/g, '').slice(0, 5); draft.cats[d.catamt] = Number(t.value) || 0; draft.splitEdited = true; refreshSetupFoot(); return; }
  if ('end' in d) { draft.semesterEnd = t.value; renderSetup(false); return; }
  if ('note' in d) { logDraft.note = t.value; return; }
  if ('svtext' in d) { surveyDraft.text = t.value; return; }
  if ('fbtext' in d) {
    surveyDraft.text = t.value;
    const btn = sheetEl.querySelector('[data-fb-submit]');
    if (btn) btn.disabled = !t.value.trim();
  }
});

// Enter moves setup forward; the log sheet takes typed digits on a laptop.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (sheet) closeSheet(); else toastEl.classList.remove('on'); return; }
  if (sheet === 'log' && !e.target.matches('input, textarea')) {
    if (/^[0-9]$/.test(e.key)) { keypad(e.key); e.preventDefault(); }
    else if (e.key === '.') { keypad('.'); e.preventDefault(); }
    else if (e.key === 'Backspace') { keypad('del'); e.preventDefault(); }
    else if (e.key === 'Enter') { saveTx(); e.preventDefault(); }
    return;
  }
  if (e.key === 'Enter' && mode === 'setup' && !sheet && e.target.tagName !== 'BUTTON') { e.preventDefault(); nextStep(); }
});

let lastDay = B.dateKey(store.now());
function refreshIfNewDay() {
  const today = B.dateKey(store.now());
  if (today === lastDay) return;
  lastDay = today;
  reportWeeks();
  if (mode === 'app' && !sheet) renderApp(false);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  track('app_open', { standalone: isStandalone(), resumed: true, days_since_start: daysSinceStart() });
  refreshIfNewDay();
});
setInterval(refreshIfNewDay, 60000);
addEventListener('resize', () => { if (mode === 'app') fitLists(); });

addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  if (mode === 'setup' && draft && steps()[step] === 'ready') renderSetup(false);
});
addEventListener('appinstalled', () => track('installed', {}));

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}

/* ================= Boot ================= */
(function boot() {
  const s = S();
  if (s.setup) {
    track('app_open', { standalone: isStandalone(), resumed: false, days_since_start: daysSinceStart() });
    reportWeeks();
    enterApp('home');
  } else {
    startSetup(false);
  }
  flush();
})();
