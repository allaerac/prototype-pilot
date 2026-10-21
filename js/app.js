// Prototype pilot app: setup, Home (ring + quick-log), Deals, Recap, sheets and limit alerts.
// Rendering is plain template strings. State lives in store.js; pilot events go through track.js.
import * as store from './store.js?v=26';
import { track, flush, pending, groupOn, dropGroup, tagQueue } from './track.js?v=26';
import * as account from './account.js?v=26';
import * as B from './budget.js?v=26';
import { APP_VERSION } from './config.js?v=26';
import { APP_NAME, SEMESTER_END_DEFAULT, CATEGORIES, SOURCES, FREQS, BILLS, CONSENT, TRACKING, DEALS, QUOTES } from './content.js?v=26';

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
// The student's categories: the built-in four plus any they added on the split screen. Removed ones stay
// in the list (off: true) so older purchases keep their name and color. activeCats() is in priority order.
const allCats = () => (S().setup && S().setup.categories) || CATEGORIES;
const activeCats = () => {
  const setup = S().setup, all = allCats();
  return setup && setup.order ? setup.order.map(id => all.find(c => c.id === id)).filter(Boolean) : all.filter(c => !c.off);
};
const catOf = id => allCats().find(c => c.id === id) || CATEGORIES.find(c => c.id === id) || { id, name: 'Other', color: '#8F97AA' };
const NEW_CAT_COLORS = ['#A78BFA', '#5EEAD4', '#F472B6', '#FDBA74', '#93C5FD', '#86EFAC', '#FCA5A5', '#FDE68A'];
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
  const spentBy = {};
  items.forEach(x => { spentBy[x.cat] = (spentBy[x.cat] || 0) + x.amount; });
  return { wk, budget, spent, left: budget - spent, pct: budget > 0 ? spent / budget : (spent > 0 ? 1 : 0), items, spentBy };
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
  const goal = B.goalProgress(s, store.now());
  let changed = false;
  weeks.forEach(w => {
    if (s.reported[w.wk]) return;
    const g = goal && goal.weeks.find(x => x.wk === w.wk);
    track('week_closed', { week: w.wk, budget: w.budget, spent: Math.round(w.spent * 100) / 100, under: w.under, logged: s.tx.filter(x => B.weekKey(new Date(x.at)) === w.wk).length, ...(g ? { goal_saved: g.saved } : {}) });
    s.reported[w.wk] = true;
    changed = true;
  });
  if (changed) store.save();
}

/* ================= Setup ================= */
let draft = null;
let step = 0;
let setupStarted = 0;
const FIRST_STEPS = ['welcome', 'username', 'onhand', 'income', 'bills', 'end', 'stress', 'goal', 'result', 'split', 'ready'];
const REDO_STEPS = ['onhand', 'income', 'bills', 'end', 'goal', 'result', 'split'];
const GOAL_IDEAS = ['Investing', 'Emergency fund', 'Spring break', 'Concert tickets', 'New laptop'];
// login: "Already have a username?" from the welcome screen. claim: someone set up before usernames existed.
const steps = () => (draft.login ? ['welcome', 'login'] : draft.claim ? ['username'] : draft.redo ? REDO_STEPS : FIRST_STEPS);
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
    order: CATEGORIES.map(c => c.id), cats: null, splitBase: null, splitEdited: false,
    categories: CATEGORIES.map(c => ({ ...c })), newCat: null,
    // savings goal being edited; noGoal after "Not right now"; goalTouched once any goal field changes
    goal: { name: '', kind: 'every', amount: '', freq: 'monthly', target: '', date: '', pct: '' }, noGoal: false, goalTouched: false,
    // username and login screens: what's typed, a message under it, and whether we're waiting on the server
    username: '', userMsg: '', busy: false
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
    if (prev.categories) d.categories = prev.categories.map(c => ({ ...c }));
    if (prev.goal) d.goal = { ...d.goal, ...prev.goal, amount: String(prev.goal.amount || ''), target: String(prev.goal.target || ''), pct: String(prev.goal.pct || '') };
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
// Weekly money from setup's answers, before the goal and before any − / + change.
const grossWeekly = () => B.computeWeekly(answers(), store.now()).weekly;

// The goal as typed, or null when skipped or not filled in yet.
function draftGoal() {
  const g = draft.goal, pos = v => Number(v) > 0;
  if (draft.noGoal || !g.name.trim()) return null;
  if (g.kind === 'every' && pos(g.amount)) return { name: g.name.trim(), kind: 'every', amount: Number(g.amount), freq: g.freq };
  if (g.kind === 'by' && pos(g.target) && g.date && B.parseKey(g.date) > B.startOfDay(store.now())) return { name: g.name.trim(), kind: 'by', target: Number(g.target), date: g.date };
  if (g.kind === 'percent' && pos(g.pct) && Number(g.pct) < 100) return { name: g.name.trim(), kind: 'percent', pct: Number(g.pct) };
  return null;
}
// Dollars a week for the goal. An untouched saved goal keeps the amount it was set with ("by a date" goals
// would otherwise creep up every time the student opens setup).
function saveWeekly() {
  const g = draftGoal();
  if (!g) return 0;
  const prev = S().setup && S().setup.goal;
  if (!draft.goalTouched && prev && prev.perWeek != null) return prev.perWeek;
  return B.goalWeekly(g, grossWeekly(), store.now());
}
// What they spend each week: weekly money minus what goes to the goal. draft.adjust is how far the student moved
// off our pick on the Conservative ↔ Aggressive slider (positive = save less, spend more). This is the number
// the split and Home use.
const spendWeekly = () => Math.max(0, grossWeekly() - saveWeekly() + draft.adjust);
// What actually lands in the goal each week at the level they picked.
const actualSave = () => (draftGoal() ? Math.max(0, grossWeekly() - spendWeekly()) : 0);
// The slider runs from Conservative (half our pick) to Aggressive (1.5× our pick, never more than the weekly
// money), stretched if needed to include what they already had.
function paceRange() {
  const planned = saveWeekly(), gross = grossWeekly(), cur = actualSave();
  const lo = Math.min(Math.round(planned * 0.5), cur), hi = Math.max(Math.min(Math.round(planned * 1.5), gross), cur);
  return { lo, mid: planned, hi };
}
const paceName = save => { const p = paceRange(); return save === p.mid ? 'middle' : save === p.lo ? 'conservative' : save === p.hi ? 'aggressive' : 'custom'; };
// Full weeks (fractional) from today to a date, for "by Dec 11" impact numbers.
const weeksUntil = key => Math.max(0, (B.daysBetween(store.now(), B.parseKey(key)) + 1) / 7);
const dateText = key => `${MONTHS[B.parseKey(key).getMonth()]} ${B.parseKey(key).getDate()}`;

const daysText = n => (n === 1 ? '1 day' : `${n} days`);

// The level they picked in real terms: when they reach the goal, compared with our pick.
// "By a date" goals: the day they hit the total. Amount-per-period and percent goals: how many days each
// chunk takes (a percent goal's chunk is a month's worth at our pick).
function paceText(rate) {
  const g = draftGoal(), planned = saveWeekly();
  if (!g || !planned) return null;
  if (rate <= 0) return { good: false, text: `Nothing goes to ${g.name} at this level.` };
  if (g.kind === 'by') {
    const prev = S().setup && S().setup.goal;
    const same = prev && JSON.stringify(B.goalFields(prev)) === JSON.stringify(g);
    const left = Math.max(0, g.target - (same ? B.goalProgress(S(), store.now()).total : 0));
    const days = Math.ceil(left / rate * 7), pick = Math.ceil(left / planned * 7);
    const when = dateText(B.dateKey(B.addDays(store.now(), days))), pickWhen = dateText(B.dateKey(B.addDays(store.now(), pick)));
    if (days === pick) return { good: true, text: `Our pick: at ${money(rate)} a week you'll reach ${money(g.target)} by ${when}.` };
    return days < pick
      ? { good: true, text: `At ${money(rate)} a week you'll reach ${money(g.target)} on ${when}, ${daysText(pick - days)} sooner than our pick (${pickWhen}).` }
      : { good: false, text: `At ${money(rate)} a week you'll reach ${money(g.target)} on ${when}, ${daysText(days - pick)} later than our pick (${pickWhen}).` };
  }
  const chunk = g.kind === 'every' ? g.amount : Math.round(planned * 52 / 12);
  const days = Math.max(1, Math.round(chunk / rate * 7)), pick = Math.max(1, Math.round(chunk / planned * 7));
  if (days === pick) return { good: true, text: `Our pick: ${money(chunk)} put away every ${daysText(pick)}.` };
  return days < pick
    ? { good: true, text: `You'll put away ${money(chunk)} every ${daysText(days)} instead of every ${daysText(pick)}: ${daysText(pick - days)} sooner than our pick.` }
    : { good: false, text: `You'll put away ${money(chunk)} every ${daysText(days)} instead of every ${daysText(pick)}: ${daysText(days - pick)} slower than our pick.` };
}

// The split always matches the spending number. If it changed, an edited split is resized ("a bit from
// each"), an untouched one is suggested again.
function ensureSplit() {
  const w = spendWeekly();
  if (!draft.cats) { draft.cats = B.suggestSplit(draft.order, w); draft.splitBase = w; draft.splitEdited = false; }
  else if (draft.splitBase !== w) {
    draft.cats = draft.splitEdited ? B.scaleSplit(draft.order, draft.cats, w) : B.suggestSplit(draft.order, w);
    draft.splitBase = w;
  }
}
// After adding or removing a category: a split the student hasn't touched is suggested again; an edited one
// keeps its amounts, and the status line shows what's left to assign.
function afterCatChange() {
  if (!draft.splitEdited) draft.cats = B.suggestSplit(draft.order, draft.splitBase);
  renderSetup(false);
}
function addNewCat() {
  const name = (draft.newCat || '').trim().slice(0, 18);
  if (!name) return;
  const id = 'c' + Date.now().toString(36);
  const color = NEW_CAT_COLORS[draft.categories.filter(c => !CATEGORIES.some(b => b.id === c.id)).length % NEW_CAT_COLORS.length];
  draft.categories.push({ id, name, color });
  draft.order.push(id);
  draft.cats[id] = 0;
  draft.newCat = null;
  afterCatChange();
}
const splitLeft = () => draft.splitBase - draft.order.reduce((t, id) => t + (Number(draft.cats[id]) || 0), 0);

function stepValid(name) {
  const pos = v => Number(v) > 0;
  if (name === 'username') return !!S().username || (!draft.busy && account.USERNAME_OK.test(draft.username));
  if (name === 'login') return !draft.busy && account.USERNAME_OK.test(draft.username);
  if (name === 'split') { ensureSplit(); return splitLeft() === 0; }
  if (name === 'goal') return draft.noGoal || (!!draftGoal() && saveWeekly() < grossWeekly());
  if (name === 'income') return (draft.incomes.length > 0 || pos(draft.onHand)) && draft.incomes.every(x => pos(x.amount));
  if (name === 'bills') return draft.bills.every(x => pos(x.amount));
  if (name === 'end') return !!draft.semesterEnd && B.parseKey(draft.semesterEnd) > B.startOfDay(store.now());
  if (name === 'stress') return draft.stress != null;
  return true;
}

function startSetup(redo, at, claim) {
  draft = newDraft(redo);
  draft.claim = !!claim;
  step = at ? Math.max(0, steps().indexOf(at)) : 0;
  draft.at = at;
  // "Change split" and "Change goal" keep the weekly money in force now instead of a fresh suggestion
  if (at === 'split' || at === 'goal') {
    const cur = B.weeklyFor(S().budgetHistory || [], B.weekKey(store.now()));
    draft.adjust = cur - (grossWeekly() - saveWeekly());
  }
  setupStarted = Date.now();
  mode = 'setup';
  app.dataset.mode = 'setup';
  if (!claim) track(redo ? 'setup_redo_start' : 'setup_start', {});
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
        <button class="link" data-sheet="data" style="margin-top:1em">See exactly what we collect and why &rarr;</button>
      </div>`;
  }
  if (name === 'username') {
    const have = S().username;
    if (have) {
      return `<span class="s-mono when">Your username</span>
        <h3>You're @${esc(have)}</h3>
        <p class="sub">Log in with it on any phone to get your budget back. No password needed.</p>`;
    }
    return `<span class="s-mono when">Pick a username</span>
      <h3>What should we call you?</h3>
      <p class="sub">If you switch phones or clear your browser, log in with this to get everything back. No password. Use a nickname, not your real name.</p>
      ${usernameField()}`;
  }
  if (name === 'login') {
    return `<span class="s-mono when">Welcome back</span>
      <h3>Log in with your username</h3>
      <p class="sub">We'll bring back your budget and purchases from your last phone.</p>
      ${usernameField()}`;
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
  if (name === 'goal') {
    const g = draft.goal;
    const field = (label, key, pre, post, attrs = '') => `<div class="money-row"><div class="row"><label for="goal-${key}">${label}</label>
      <span class="money-in"><span>${pre}</span><input id="goal-${key}" data-goalf="${key}" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(g[key])}" ${attrs}>${post ? `<span>${post}</span>` : ''}</span></div>`;
    let how = '';
    if (g.kind === 'every') {
      how = `${field('How much', 'amount', '$', '')}
        <div class="freqs">${BILL_FREQS.map(f => `<button class="chip${g.freq === f.id ? ' sel' : ''}" data-goalfreq="${f.id}">${f.name}</button>`).join('')}</div></div>`;
    } else if (g.kind === 'by') {
      how = `${field('Total', 'target', '$', '')}</div>
        <div class="money-row"><div class="row"><label for="goal-date">By</label>
          <input type="date" id="goal-date" class="date-in small" data-goaldate value="${esc(g.date)}" min="${B.dateKey(B.addDays(now, 7))}"></div></div>`;
    } else {
      how = `${field('Of my money', 'pct', '', '%')}
        <div class="freqs">${[5, 10, 20, 30].map(p => `<button class="chip${Number(g.pct) === p ? ' sel' : ''}" data-goalpct="${p}">${p}%</button>`).join('')}</div></div>`;
    }
    return `<span class="s-mono when">Optional, but it's the fun part</span>
      <h3>What are we saving for?</h3>
      <p class="sub">We set it aside before you spend. Stay on track each week and watch it fill up.</p>
      <div class="money-row"><div class="row"><label for="goalname">Goal</label>
        <span class="money-in user-in"><input id="goalname" data-goalname maxlength="24" autocomplete="off" placeholder="Name it" value="${esc(g.name)}"></span></div>
        <div class="freqs">${GOAL_IDEAS.map(n => `<button class="chip${g.name === n ? ' sel' : ''}" data-goalpick="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>
      <div class="chips">${[['every', '$ every week or month'], ['by', '$ by a date'], ['percent', '% of my money']].map(([k, label]) => `<button class="chip${g.kind === k ? ' sel' : ''}" data-goalkind="${k}">${label}</button>`).join('')}</div>
      ${how}
      <div data-goal-preview>${goalPreview()}</div>`;
  }
  if (name === 'split') {
    ensureSplit();
    const cat = id => draft.categories.find(c => c.id === id) || catOf(id);
    const removed = draft.categories.filter(c => !draft.order.includes(c.id));
    return `<span class="s-mono when">Your ${money(draft.splitBase)} a week</span>
      <h3>Split up your week</h3>
      <p class="sub">Every amount here is per week, Monday to Sunday. Put what matters most at the top: if you go over in one, the ones at the bottom shrink first.</p>
      <div class="money-rows">${draft.order.map((id, i) => {
        const c = cat(id);
        return `<div class="money-row">
          <div class="row"><label for="cat-${id}"><span class="rank">${i + 1}</span>${esc(c.name)}</label>
            <span class="moves">
              <button class="x" data-move="${id}:-1" aria-label="Move ${esc(c.name)} up" ${i === 0 ? 'disabled' : ''}>&uarr;</button>
              <button class="x" data-move="${id}:1" aria-label="Move ${esc(c.name)} down" ${i === draft.order.length - 1 ? 'disabled' : ''}>&darr;</button>
              ${draft.order.length > 1 ? `<button class="x" data-cat-rm="${id}" aria-label="Remove ${esc(c.name)}">${xIcon}</button>` : ''}
            </span></div>
          <div class="row split-amt">
            <button class="x" data-catadj="${id}:-1" aria-label="$1 less a week for ${esc(c.name)}">−</button>
            <span class="money-in"><span>$</span><input id="cat-${id}" data-catamt="${id}" inputmode="numeric" autocomplete="off" placeholder="0" value="${esc(draft.cats[id])}"><span>/wk</span></span>
            <button class="x" data-catadj="${id}:1" aria-label="$1 more a week for ${esc(c.name)}">+</button>
          </div>
        </div>`;
      }).join('')}</div>
      ${draft.newCat !== null ? `<div class="money-row"><div class="row">
          <span class="money-in user-in"><input id="newcat" data-newcat maxlength="18" autocomplete="off" enterkeyhint="done" placeholder="Like Coffee, Gas or Gifts" value="${esc(draft.newCat)}"></span>
          <button class="chip sel" data-newcat-save>Add</button></div></div>` : ''}
      <div class="chips">
        ${removed.map(c => `<button class="chip" data-cat-add="${c.id}">+ ${esc(c.name)}</button>`).join('')}
        ${draft.newCat === null && draft.order.length < 8 ? `<button class="chip" data-newcat-open>+ New category</button>` : ''}
      </div>
      ${draft.splitEdited ? `<button class="text-btn" data-resplit>Use the suggested split</button>` : ''}`;
  }
  if (name === 'end') {
    return `<h3>When does your semester end?</h3>
      <p class="sub">We spread your money across the weeks until then.</p>
      <input type="date" class="date-in" data-end value="${esc(draft.semesterEnd)}" min="${B.dateKey(B.addDays(now, 1))}">
      ${draft.semesterEnd ? `<p class="s-soft">${Math.max(1, (B.daysBetween(now, B.parseKey(draft.semesterEnd)) + 1) / 7).toFixed(1)} weeks from today</p>` : ''}`;
  }
  if (name === 'stress') {
    const v = draft.stress;
    return `<h3>How stressed are you about money right now?</h3>
      <p class="sub">Just slide it. We'll ask once a day on Home to see if the app actually helps.</p>
      <div class="stress-setup">
        <span class="stress-big" data-stress-label>${v == null ? '–' : v + '%'}</span>
        <input type="range" class="stress-range${v == null ? '' : ' set'}" min="0" max="100" step="1" value="${v == null ? 50 : v}" data-sstress aria-label="How stressed about money are you, 0 to 100" style="--v:${v == null ? 50 : v}%">
        <div class="scale-ends"><span>Chill</span><span>Super stressed</span></div>
      </div>`;
  }
  if (name === 'result') {
    const r = B.computeWeekly(answers(), now);
    const g = draftGoal(), bits = resultBits();
    const save = actualSave(), p = paceRange();
    return `<span class="s-mono when">Your weekly number</span>
      <div class="card result">
        <span class="big" data-r-big>${money(bits.weekly)}</span>
        <span class="s-soft" data-r-sub>${bits.sub}</span>
        ${g && p.hi > p.lo ? `<div class="pace-pick">
          <span class="s-mono">How hard do you want to go at ${esc(g.name)}?</span>
          <div class="chips pace-chips">${[['lo', 'Conservative', p.lo, ''], ['mid', 'Middle', p.mid, ' · our pick'], ['hi', 'Aggressive', p.hi, '']].map(([k, label, v, note]) =>
            `<button class="chip${save === v ? ' sel' : ''}" data-pace="${k}" data-pace-v="${v}"><b>${label}</b><small>${money(v)}/wk${note}</small></button>`).join('')}</div>
          <input type="range" class="save-range" min="${p.lo}" max="${p.hi}" step="1" value="${save}" data-save aria-label="Dollars a week for ${esc(g.name)}" style="--v:${((save - p.lo) / (p.hi - p.lo) * 100).toFixed(1)}%">
          <div class="scale-ends"><span>${money(p.lo)}/wk · spend more</span><span>save more · ${money(p.hi)}/wk</span></div>
        </div>` : ''}
        ${r.pot > 0 ? `<button class="switch" role="switch" aria-checked="${draft.cushion}" data-cushion style="margin-top:1em">Keep a 10% cushion <i aria-hidden="true"></i></button>` : ''}
        ${g ? '' : `<button class="text-btn add-goal" data-goto-goal>Saving for something? Add a goal &rarr;</button>`}
      </div>
      <div data-r-impact>${bits.impact}</div>
      <div class="breakdown" data-r-breakdown>${bits.breakdown}</div>
      ${r.weekly <= 0 ? `<p class="note">Your bills use up most of what's coming in. Let's double-check the numbers.</p>`
        : bits.firstWeek !== null ? `<p class="s-soft" data-r-first>This week is shorter, so it starts at ${money(bits.firstWeek)} for ${SHORT[now.getDay()]}–Sun.</p>` : ''}`;
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

// What the goal changes: dollars set aside, the weekly number before → after, and each category before → after
// (every category gives up the same share).
function goalPreview() {
  const g = draftGoal();
  if (!g) return '';
  const save = saveWeekly(), gross = grossWeekly();
  // before = spending with no goal, after = spending with it (both include any − / + change from earlier)
  const beforeSpend = Math.max(0, gross + draft.adjust), spend = spendWeekly();
  if (save >= gross) return `<p class="note">That's more than you have each week. Try a smaller amount${g.kind === 'by' ? ' or a later date' : ''}.</p>`;
  const base = draft.cats && draft.splitBase ? draft.cats : B.suggestSplit(draft.order, beforeSpend);
  const before = B.scaleSplit(draft.order, base, beforeSpend), after = B.scaleSplit(draft.order, base, spend);
  const name = id => (draft.categories.find(c => c.id === id) || catOf(id)).name;
  const row = (k, a, b) => `<div class="set-row"><span class="s-soft">${esc(k)}</span><b>${money(a)} <span class="arrow">&rarr;</span> ${money(b)}</b></div>`;
  return `<div class="breakdown">
    <span class="s-mono">What it changes, per week</span>
    <div class="set-row total"><span>Set aside for ${esc(g.name)}</span><b>${money(save)}/wk <small>about ${money(save * 52 / 12)}/mo</small></b></div>
    ${row('Your weekly number', beforeSpend, spend)}
    ${draft.order.map(id => row(name(id), before[id], after[id])).join('')}
  </div>`;
}
// The parts of the weekly-number screen that change while they slide: the number, the line under it,
// the "days sooner / later" note and the math.
function resultBits() {
  const now = store.now(), r = B.computeWeekly(answers(), now);
  const g = draftGoal(), weekly = spendWeekly(), save = actualSave();
  const lines = [];
  if (r.onHand > 0) lines.push(['Money you have now', money(r.onHand)]);
  if (r.oneTime > 0) lines.push(['One-time money coming in', money(r.oneTime)]);
  if (r.held > 0) lines.push(['Kept aside as a 10% cushion', money(-r.held)]);
  if (r.pot > 0) lines.push([`Spread over ${r.weeksLeft.toFixed(1)} weeks left`, money(r.potWeekly) + '/wk']);
  if (r.weeklyIn > 0) lines.push(['Paychecks and other income', '+' + money(r.weeklyIn) + '/wk']);
  if (r.weeklyBills > 0) lines.push(['Bills', money(-r.weeklyBills) + '/wk']);
  if (g) lines.push([`Saving for ${g.name}`, money(-save) + '/wk']);
  const pace = paceText(save);
  const daysIn = 7 - ((now.getDay() + 6) % 7);
  return {
    weekly,
    sub: `to spend each week${g ? `, after ${money(save)} for ${esc(g.name)}` : ''}`,
    impact: pace ? `<p class="impact${pace.good ? ' good' : ''}" aria-live="polite">${esc(pace.text)}</p>` : '',
    breakdown: `<span class="s-mono">How we got this</span>
      ${lines.map(([k, v]) => `<div class="set-row"><span class="s-soft">${esc(k)}</span><b>${v}</b></div>`).join('')}
      <div class="set-row total"><span>Each week${!g && !draft.adjust && r.raw - r.weekly >= 0.5 ? ' <small>(rounded down to $5)</small>' : ''}</span><b>${money(weekly)}</b></div>`,
    firstWeek: !draft.redo && daysIn < 7 ? Math.round(weekly * daysIn / 7) : null
  };
}
function refreshResult() {
  const bits = resultBits(), save = actualSave(), p = paceRange();
  const set = (sel, html) => { const el = viewsEl.querySelector(sel); if (el) el.innerHTML = html; };
  set('[data-r-big]', money(bits.weekly));
  set('[data-r-sub]', bits.sub);
  set('[data-r-impact]', bits.impact);
  set('[data-r-breakdown]', bits.breakdown);
  if (bits.firstWeek !== null) set('[data-r-first]', `This week is shorter, so it starts at ${money(bits.firstWeek)} for ${SHORT[store.now().getDay()]}–Sun.`);
  viewsEl.querySelectorAll('[data-pace]').forEach(b => b.classList.toggle('sel', Number(b.dataset.paceV) === save));
  const range = viewsEl.querySelector('[data-save]');
  if (range && p.hi > p.lo) range.style.setProperty('--v', ((save - p.lo) / (p.hi - p.lo) * 100).toFixed(1) + '%');
}

function refreshGoalPreview() {
  const box = viewsEl.querySelector('[data-goal-preview]');
  if (box) box.innerHTML = goalPreview();
  refreshSetupFoot();
}

function usernameField() {
  return `<div class="money-row"><div class="row"><label for="uname">Username</label>
      <span class="money-in user-in"><span>@</span><input id="uname" data-username autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="nickname" value="${esc(draft.username)}"></span></div></div>
    <p class="s-soft">3 to 20 letters, numbers, _ or .</p>`;
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
      <button class="text-btn" data-noshare>Use it without sharing</button>
      <button class="text-btn" data-login-open>Already have a username? Log in</button>`;
  }
  const last = (name === 'split' && draft.redo) || name === 'login';
  const label = name === 'result' ? 'Use this number' : name === 'split' ? (draft.redo ? 'Save my plan' : 'Use this split') : name === 'ready' ? 'Start my week'
    : name === 'login' ? (draft.busy ? 'Logging in…' : 'Log in') : name === 'username' && draft.busy ? 'Checking…' : 'Continue';
  let status = '';
  if (name === 'goal') {
    return `<button class="cta" data-next ${!draft.noGoal && stepValid('goal') ? '' : 'disabled'}>Let's make it happen <span aria-hidden="true">&rarr;</span></button>
      <button class="text-btn" data-goal-skip>${S().setup && S().setup.goal ? 'No goal for now' : 'Not right now'}</button>`;
  }
  if ((name === 'username' || name === 'login') && draft.userMsg) status = `<p class="split-status" aria-live="polite">${esc(draft.userMsg)}</p>`;
  if (name === 'split') {
    const left = splitLeft();
    status = `<p class="split-status${left === 0 ? ' ok' : ''}" aria-live="polite">${left === 0 ? `All ${money(draft.splitBase)} a week is split up`
      : left > 0 ? `${money(left)} a week left to assign` : `${money(-left)} a week too much: take some off`}</p>`;
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
      ${draft.redo && (step === 0 || name === draft.at) ? `<button class="back" data-cancel>Cancel</button>` : draft.login || draft.claim ? '' : `<span class="dots" aria-hidden="true">${list.map((_, i) => `<b class="${i <= step ? 'on' : ''}"></b>`).join('')}</span>`}
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

async function nextStep() {
  const list = steps();
  const name = list[step];
  if (!stepValid(name)) return;
  if (name === 'login') { await logIn(); return; }
  if (name === 'username' && !S().username) {
    if (!(await claimUsername())) return;
    if (draft.claim) { enterApp('home'); return; }
  }
  track('setup_step', { step: name, redo: !!draft.redo });
  if (name === 'split') { finishSetup(); if (draft.redo) return; }
  if (name === 'ready') { enterApp('home'); return; }
  step = Math.min(list.length - 1, step + 1);
  renderSetup(true);
}

const OFFLINE_MSG = "Couldn't connect. Check your internet and try again.";
async function claimUsername() {
  draft.busy = true; draft.userMsg = ''; refreshSetupFoot();
  let ok = null;
  try { ok = await account.signup(draft.username); } catch (e) { ok = null; }
  draft.busy = false;
  if (ok) {
    store.update(st => { st.username = draft.username; });
    tagQueue(draft.username);
    return true;
  }
  draft.userMsg = ok === false ? "That one's taken. Try another, or log in if it's yours." : OFFLINE_MSG;
  refreshSetupFoot();
  return false;
}
async function logIn() {
  draft.busy = true; draft.userMsg = ''; refreshSetupFoot();
  let r;
  try { r = await account.login(draft.username); } catch (e) { r = undefined; }
  draft.busy = false;
  if (!r) {
    draft.userMsg = r === null ? "We couldn't find that username. Check the spelling." : OFFLINE_MSG;
    refreshSetupFoot();
    return;
  }
  const u = draft.username;
  if (r.backup) store.restore(r.backup, u);
  else store.update(st => { st.username = u; });
  tagQueue(u);
  track('login', { restored: !!(r.backup && r.backup.setup) });
  if (S().setup) {
    reportWeeks();
    enterApp('home');
    showToast('Welcome back', `Everything from @${u} is back on this phone.`);
  } else {
    startSetup(false);   // they never finished setup: start it, with the username already theirs
  }
}

function finishSetup() {
  const now = store.now();
  const a = answers();
  const r = B.computeWeekly(a, now);
  const gross = grossWeekly();            // weekly money before the goal and − / +
  const planned = saveWeekly();           // what the goal asks for each week
  const weekly = spendWeekly();           // what they spend: Home's ring and the split
  const save = actualSave();              // what really goes to the goal after − / +
  const wk = B.weekKey(now);
  const order = draft.order.slice();
  const cats = Object.fromEntries(order.map(id => [id, Number(draft.cats[id]) || 0]));
  const categories = draft.categories.map(c => ({ id: c.id, name: c.name, color: c.color, ...(order.includes(c.id) ? {} : { off: true }) }));
  // a goal keeps its progress unless what it is changes
  const g = draftGoal();
  const prevGoal = S().setup && S().setup.goal;
  const same = g && prevGoal && JSON.stringify({ ...g, since: 0 }) === JSON.stringify({ ...B.goalFields(prevGoal), since: 0 });
  const goal = g ? { ...g, perWeek: planned, since: same ? prevGoal.since : wk } : null;
  store.update(st => {
    st.setup = {
      ...a,
      order,
      cats,
      categories,
      goal,
      startDate: st.setup && st.setup.startDate ? st.setup.startDate : B.dateKey(now),
      completedAt: now.toISOString(),
      suggested: r.weekly,
      weekly,
      baselineStress: draft.redo ? (st.setup && st.setup.baselineStress) : draft.stress
    };
    st.budgetHistory = (st.budgetHistory || []).filter(b => b.from !== wk);
    st.budgetHistory.push({ from: wk, weekly, gross, save, order, cats });
    st.budgetHistory.sort((x, y) => (x.from < y.from ? -1 : 1));
  });
  track(draft.redo ? 'setup_redo_complete' : 'setup_complete', {
    sources: a.sources.map(x => x.type),
    freqs: a.sources.map(x => x.freq),
    bills: a.bills.map(x => x.type),
    bill_freqs: a.bills.map(x => x.freq),
    has_money_now: a.onHand > 0,
    cat_order: order,
    custom_cats: categories.filter(c => !c.off && !CATEGORIES.some(b => b.id === c.id)).map(c => c.name),
    cat_split: cats,
    cat_split_edited: draft.splitEdited,
    cushion: a.cushion,
    suggested: r.weekly,
    weekly,
    goal: goal ? { name: goal.name, kind: goal.kind, freq: goal.freq, pct: goal.pct, per_week: planned, actual_per_week: save } : null,
    adjusted: draft.adjust !== 0,
    adjust: draft.adjust,
    pace: g ? paceName(save) : null,
    weeks_left: Math.round(r.weeksLeft * 10) / 10,
    seconds: Math.round((Date.now() - setupStarted) / 1000),
    baseline_stress: draft.redo ? undefined : draft.stress
  });
  if (g && !same) track('goal_set', { name: g.name, kind: g.kind, freq: g.freq, pct: g.pct, per_week: planned, has_date: !!g.date });
  if (!g && prevGoal) track('goal_removed', {});
  if (draft.redo) {
    enterApp('home');
    showToast('New plan saved', `${money(weekly)} a week to spend${save ? `, ${money(save)} to ${goal.name}` : ''}, starting this week.`);
  }
}

/* ================= App views ================= */
function vhead(eyebrow, title, right) {
  return `<div class="vhead">
    <div class="vhead-l">
      <span class="mark" aria-hidden="true">${miniRing(16)}</span>
      <div><span class="s-mono when">${eyebrow}</span><h3>${title}</h3></div>
    </div>
    <div class="vhead-r">${right || ''}<button class="icon-btn" data-sheet="settings" aria-label="Settings">${gearIcon}</button></div>
  </div>`;
}
// The line at the bottom of every tab: where to send feedback or look for answers.
const feedbackNote = () => `<button class="view-note" data-sheet="settings">Questions or ideas? <b>Settings</b> → <b>Send feedback</b></button>`;
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
  const spentBy = w.spentBy;
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
    ${vhead(`<span class="only-portrait">${streakLabel().short} &middot; </span>${weekRange(wk)}`, greeting(now))}
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
        ${stressCardHTML()}
        ${goalCardHTML()}
        <div class="card">
          ${split ? `<div class="card-head"><b>By category</b><span class="s-mono">left to spend</span></div>
          <div class="cats" style="${catCols(split.order.length)}">${B.categoryLeft(split, w.budget, spentBy).map(r => {
            const c = catOf(r.id);
            // the ring fills as the category gets used up, including money it gave to cover another one
            const used = r.budget > 0 ? 1 - r.left / r.budget : (r.spent > 0 ? 1 : 0);
            const note = r.over >= 0.5 ? `${money(r.over)} over` : r.covered >= 0.5 ? `−${money(r.covered)} to cover` : `of ${money(r.budget)}`;
            return `<div class="cat${r.over >= 0.5 ? ' over' : ''}"><div class="cat-ring">${catRing('cat-' + c.id, c.color, Math.min(1, used))}<span>${money(r.left)}</span></div><b>${esc(c.name)}</b><em>${note}</em></div>`;
          }).join('')}</div>`
          : `<div class="card-head"><b>By category</b><span class="s-mono">of ${money(w.budget)}</span></div>
          <div class="cats" style="${catCols(activeCats().length)}">${activeCats().map(c => {
            const spent = spentBy[c.id] || 0;
            const pct = w.budget > 0 ? spent / w.budget : 0;
            return `<div class="cat"><div class="cat-ring">${catRing('cat-' + c.id, c.color, Math.min(1, pct))}<span>${Math.round(pct * 100)}%</span></div><b>${esc(c.name)}</b><em>${money(spent)}</em></div>`;
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
    ${feedbackNote()}
  </section>`;
}
let stressEdit = false;   // "Change" on the one-line stress card opens the slider again

// Columns for the category rings: up to 6 in one row on wide screens (--n), up to 5 on phones (--np);
// more wrap into two even rows.
const catCols = n => `--n:${n <= 6 ? Math.max(1, n) : Math.ceil(n / 2)};--np:${n <= 5 ? Math.max(1, n) : Math.ceil(n / 2)}`;

// The savings goal on Home: a ring that fills as on-track weeks add up, and a line that cheers them on.
// "Every" and percent goals fill per month; "by a date" goals fill toward the total.
function goalCardHTML() {
  const s = S(), goal = s.setup && s.setup.goal;
  if (!goal) return '';
  const now = store.now();
  const g = B.goalProgress(s, now);
  const byDate = goal.kind === 'by';
  const have = byDate ? g.total + g.pending : g.month;
  const target = byDate ? goal.target : (goal.kind === 'every' && goal.freq === 'monthly' ? goal.amount : Math.round(goal.perWeek * 52 / 12));
  const pct = target > 0 ? Math.min(1, have / target) : 0;
  const cheer = pct >= 1 ? "Goal hit! Let's go 🎉" : pct >= 0.75 ? 'Almost there!' : pct >= 0.5 ? 'Halfway there, keep it up' : pct >= 0.25 ? 'Building up, keep going' : have > 0 ? 'Off to a good start' : "Let's get it started";
  const when = byDate ? `by ${MONTHS[B.parseKey(goal.date).getMonth()]} ${B.parseKey(goal.date).getDate()}` : 'this month';
  return `<div class="card goal-card${pct >= 1 ? ' hit' : ''}">
    <div class="cat-ring">${catRing('goal', '#3BCFBF', pct)}<span>${Math.round(pct * 100)}%</span></div>
    <div class="goal-text">
      <span class="s-mono">Saving for</span>
      <b>${esc(goal.name)} <span class="goal-cheer">· ${cheer}</span></b>
      <span class="s-soft">${money(have)} of ${money(target)} ${when}${g.pending > 0 && pct < 1 ? ` · +${money(g.pending)} this week<span class="long"> if you stay on track</span>` : ''}</span>
    </div>
  </div>`;
}

// Once a day: how stressed about money are they, 0 to 100%. When it's high, a reminder of where they're headed.
function stressCardHTML() {
  const s = S();
  if (!s.setup) return '';
  const today = B.dateKey(store.now());
  const v = (s.stressDaily || {})[today];
  const answered = v != null;
  // once answered it shrinks to one line, so Home keeps room for the week's purchases
  if (answered && !stressEdit) {
    return `<div class="card stress-card mini">
      <span>Money stress today</span><b class="${v >= 60 ? 'high' : ''}">${v}%</b>
      <button class="link" data-stress-edit>Change</button>
    </div>`;
  }
  return `<div class="card stress-card">
    <div class="card-head"><b>Money stress today</b><span class="row"><span class="s-mono">${answered ? v + '%' : 'Chill → stressed'}</span><button class="chip sel stress-save" data-stress-save>Save</button></span></div>
    <input type="range" class="stress-range${answered ? ' set' : ''}" min="0" max="100" step="1" value="${answered ? v : 50}" data-stressday aria-label="How stressed about money are you today, 0 to 100" style="--v:${answered ? v : 50}%">
    <div class="scale-ends"><span>Chill</span><span>Super stressed</span></div>
  </div>`;
}
// The "take a breath" note for a high stress answer: where they're headed if they keep going.
function easeMessage() {
  const s = S(), now = store.now(), setup = s.setup;
  const end = setup.semesterEnd;
  const endText = `${MONTHS[B.parseKey(end).getMonth()]} ${B.parseKey(end).getDate()}`;
  if (setup.goal) {
    const g = B.goalProgress(s, now);
    const until = setup.goal.kind === 'by' ? setup.goal.date : end;
    const untilText = `${MONTHS[B.parseKey(until).getMonth()]} ${B.parseKey(until).getDate()}`;
    return `If you keep this up, you'll have ${money(g.projected(until))} saved for ${setup.goal.name} by ${untilText}.`;
  }
  const w = weekStats(B.weekKey(now));
  return `You've still got ${money(Math.max(0, w.left))} this week, and sticking to ${money(setup.weekly)} a week gets you all the way to ${endText}.`;
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
    ${vhead(`${DAYS[today]} &middot; Oxford`, 'Student deals')}
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
    ${feedbackNote()}
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
// "Your recap is ready": once per week, the first time the app is open after it's ready (Sunday 6 pm, or the
// next time they open it). Skipped if they're already on Recap; opening Recap counts as seeing it.
let lastRecap = '';
function checkRecapReady() {
  if (mode !== 'app') return;
  const r = recapWeek();
  // at 6 pm Sunday the Recap switches to the week that's ending: redraw it if they're looking at it
  if (lastRecap && lastRecap !== r.wk + r.kind && tab === 'recap' && !sheet) renderApp(false);
  lastRecap = r.wk + r.kind;
  if (r.kind === 'first' || (S().recapSeen || {})[r.wk]) return;
  store.update(st => { st.recapSeen = { ...(st.recapSeen || {}), [r.wk]: true }; });
  if (tab === 'recap') return;
  showToast('Your recap is ready', r.kind === 'closing' ? 'See how this week went and close it out.' : 'See how last week went.', 'recap');
  track('recap_ready_shown', { week: r.wk, kind: r.kind });
}
function dueSurvey() {
  const s = S();
  const d = daysSinceStart();
  if (d >= 27 && !s.surveys.final) return 'final';
  if (d >= 13 && !s.surveys.midpoint && !s.surveys.final) return 'midpoint';
  return null;
}
// Recap's "Where your money's headed": money left to spend this semester if they stick to the plan (dashed)
// vs at the pace they're actually spending (solid), from today to the semester end, plus one plain sentence.
function projectionHTML() {
  const s = S(), now = store.now();
  const p = B.projection(s, now);
  if (!p || p.weeks < 1) return '';
  const end = dateText(s.setup.semesterEnd);
  const head = `<div class="card-head"><b>Where your money's headed</b><span class="s-mono">Today → ${end}</span></div>`;
  if (p.pace == null) return `<div class="card proj">${head}<p class="s-soft">Log purchases for a few days and we'll show where your money's headed by ${end}.</p></div>`;
  const W = 300, H = 110, L = 4, R = 4, T = 8, Bm = 8;
  const lo = Math.min(0, ...p.points.map(x => x.pace)), hi = Math.max(p.start, 1);
  const X = t => L + (t / p.weeks) * (W - L - R), Y = v => T + (hi - v) / (hi - lo) * (H - T - Bm);
  const line = key => p.points.map(x => `${X(x.t).toFixed(1)},${Y(x[key]).toFixed(1)}`).join(' ');
  const short = p.runOut != null;
  const diff = Math.round(p.pace - p.plan);
  const sentence = short
    ? `At about ${money(p.pace)} a week you'd run out around ${dateText(B.dateKey(p.runOut))}, ${daysText(B.daysBetween(p.runOut, B.parseKey(s.setup.semesterEnd)))} early. ${money(Math.ceil(p.pace - p.start / p.weeks))} less a week gets you there.`
    : diff > 0
      ? `At about ${money(p.pace)} a week you'll make it to ${end} with ${money(p.endLeft)} to spare.`
      : `At about ${money(p.pace)} a week you'll finish ${end} with about ${money(p.endLeft)} extra. Nice.`;
  return `<div class="card proj">${head}
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      ${lo < 0 ? `<line x1="${L}" x2="${W - R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="proj-zero"/>` : ''}
      <polyline points="${line('plan')}" class="proj-plan"/>
      <polyline points="${line('pace')}" class="proj-pace${short ? ' short' : ''}"/>
    </svg>
    <div class="proj-key"><span><i class="k-pace${short ? ' short' : ''}"></i>Your pace</span><span><i class="k-plan"></i>Plan ${money(p.plan)}/wk</span><span class="proj-end">${money(p.start)} today</span></div>
    <p class="proj-say${short ? ' short' : ''}">${esc(sentence)}</p>
  </div>`;
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
  // the student's categories, plus any removed one that still has spending this week
  const shownCats = [...activeCats(), ...allCats().filter(c => c.off && w.spentBy[c.id] > 0)];
  const quote = QUOTES[Math.abs(Math.floor(B.startOfDay(now) / 864e5)) % QUOTES.length];
  const survey = dueSurvey();
  // the week's daily stress answers, their average, and the change from the week before
  const weekStress = key => {
    const start = B.parseKey(key);
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => { const d = B.addDays(start, i); return { label: DAYS[d.getDay()].slice(0, 1), v: (s.stressDaily || {})[B.dateKey(d)] }; });
    const vals = days.filter(d => d.v != null).map(d => d.v);
    return { days, avg: vals.length ? Math.round(vals.reduce((t, v) => t + v, 0) / vals.length) : null };
  };
  const stress = weekStress(wk);
  const before = weekStress(B.dateKey(B.addDays(B.parseKey(wk), -7)));
  stress.change = stress.avg != null && before.avg != null ? stress.avg - before.avg : null;
  return `<section class="view" data-view="recap" aria-label="Recap">
    ${vhead(`${kind === 'first' ? 'This week' : kind === 'closing' ? 'Tonight' : 'Last week'} &middot; ${weekRange(wk)}`, 'Your week, recapped')}
    <div class="grid2">
      <div class="lcol">
      <div class="card recap-hero">
        <div class="recap-rings">
          ${ringSVG('recap-' + wk, Math.min(1, w.pct), seal)}
          <div class="check"><span class="s-mono">Spent</span><strong>${money(w.spent)}</strong><span class="s-soft">of ${money(w.budget)}</span></div>
          ${sealed ? [0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => `<span class="spark" style="--a:${a}deg;background:${['#6474FF', '#3BCFBF', '#FF9FBD'][i % 3]}"></span>`).join('') : ''}
        </div>
        <div><h4>${head}</h4><span class="s-soft">${sub}</span>
          ${kind === 'closing' ? '' : `<span class="recap-next">${kind === 'first' ? "It's ready Sunday at 6 pm, and you'll get a notification in the app when it is." : "Next recap: Sunday at 6 pm. You'll get a notification in the app when it's ready."}</span>`}
          <div class="only-portrait-block" style="margin-top:.6em">${streakPill()}</div></div>
      </div>
      ${projectionHTML()}
      </div>
      <div class="stack">
        <div class="card streak-card">
          <div class="card-head"><b>Streak</b><span class="s-mono">${n} ${n === 1 ? 'week' : 'weeks'} in a row</span></div>
          <div class="weeks">${closed.map(c => (B.counts(c) ? miniRing(0) : faintRing)).join('')}${kind === 'closing' ? (under && w.items.length ? miniRing(0) : faintRing) : dashedRing}</div>
        </div>
        <div class="card">
          <div class="card-head"><b>Where it went</b><span class="s-mono">${money(total)} total</span></div>
          <div class="bar">${total > 0 ? shownCats.map(c => w.spentBy[c.id] > 0 ? `<span style="width:${(w.spentBy[c.id] / total * 100).toFixed(1)}%;background:${c.color}"></span>` : '').join('') : ''}</div>
          <div class="legend">${shownCats.map(c => `<div><i style="background:${c.color}"></i>${esc(c.name)}<b>${money(w.spentBy[c.id] || 0)}</b></div>`).join('')}</div>
        </div>
        <div class="card">
          <div class="card-head"><b>Money stress</b><span class="s-mono">${stress.avg == null ? 'Answer on Home each day' : `${stress.avg}% average`}${stress.change != null && stress.change !== 0 ? ` · ${stress.change < 0 ? 'down' : 'up'} ${Math.abs(stress.change)} from the week before` : ''}</span></div>
          <div class="stress-week">${stress.days.map(d => `<div><i style="--v:${d.v == null ? 0 : d.v}%" class="${d.v == null ? 'none' : ''}"></i><span>${d.label}</span></div>`).join('')}</div>
        </div>
        ${survey ? `<button class="nudge" data-sheet="survey"><span><b>Got 30 seconds?</b><br><span class="s-soft">Tell us how the app is going.</span></span><span aria-hidden="true">&rarr;</span></button>`
        : `<div class="card tip"><div class="card-head"><b>Quote of the day</b></div><p>“${esc(quote.text)}”</p><span class="s-soft quote-by">${esc(quote.by)}</span></div>`}
      </div>
    </div>
    ${feedbackNote()}
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
  if (t === 'recap') {
    const r = recapWeek();
    track('recap_view', { week: r.wk, kind: r.kind });
    if (r.kind !== 'first' && !(S().recapSeen || {})[r.wk]) store.update(st => { st.recapSeen = { ...(st.recapSeen || {}), [r.wk]: true }; });
  }
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
    const active = activeCats();
    logDraft = { amount: '', cat: last && active.some(c => c.id === last.cat) ? last.cat : active[0].id, note: '', day: 'today' };
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
      <div class="chips" style="justify-content:center">${activeCats().map(c => `<button class="chip${logDraft.cat === c.id ? ' sel' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('')}</div>
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
          ${s.setup ? `<div class="set-row"><div><span>Category split</span><small>${activeCats().map(c => esc(c.name)).join(' › ')}</small></div><button class="chip" data-resplit-open>Change split</button></div>` : ''}
          ${s.setup ? `<div class="set-row"><div><span>Savings goal</span><small>${s.setup.goal ? `${esc(s.setup.goal.name)} · ${money(s.setup.goal.perWeek)} a week` : 'Nothing yet. Pick something to save for'}</small></div><button class="chip" data-goal-open>${s.setup.goal ? 'Change goal' : 'Set a goal'}</button></div>` : ''}
          <div class="set-row"><div><span>Show 21+ deals</span><small>Drink specials at Uptown bars</small></div><button class="switch" role="switch" aria-checked="${s.prefs.show21}" data-toggle21><i aria-hidden="true"></i></button></div>
          ${s.username ? `<div class="set-row"><div><span>@${esc(s.username)}</span><small>Log in with this username on any phone. No password.</small></div></div>
          <div class="set-row"><div><span>Back up to your username</span><small>So logging in brings your budget back. Purchase notes stay on this phone.</small></div><button class="switch" role="switch" aria-checked="${account.backupOn(s)}" data-backup><i aria-hidden="true"></i></button></div>` : ''}
          <div class="set-row"><div><span>Share usage with the ESP201 team</span><small>Random ID ${esc(s.anonId.slice(0, 8))}${n ? ` · ${n} waiting to send` : ''}</small></div><button class="switch" role="switch" aria-checked="${!!(s.consent && s.sharing)}" data-sharing><i aria-hidden="true"></i></button></div>
          <div class="set-row"><div><span>What we collect</span><small>${s.consent && s.sharing ? `Sharing ${TRACKING.filter(g => groupOn(s, g.id)).length} of ${TRACKING.length}. See why and turn any of it off` : 'See what it is and why we want it'}</small></div><button class="chip" data-sheet="data">See</button></div>
          <div class="set-row"><div><span>Send feedback</span><small>Anything that's confusing, broken or missing</small></div><button class="chip" data-sheet="feedback">Write</button></div>
          ${!isStandalone() ? `<div class="set-row"><div><span>Add to Home Screen</span><small>Keeps your data safe and opens like an app</small></div>${installPrompt ? '<button class="chip" data-install>Install</button>' : ''}</div>` : ''}
          <div class="set-row"><div><span class="danger">Erase everything on this phone</span><small>Purchases, setup and settings</small></div><button class="chip danger" data-reset>${confirmReset ? 'Tap again' : 'Erase'}</button></div>
        </div>
        <p class="s-mono" style="text-align:center">${esc(APP_NAME)} ${APP_VERSION} &middot; ESP201 pilot</p>
      </div>`;
  } else if (sheet === 'data') {
    // before setup's consent step the student can already pick; after "Use it without sharing" nothing is sent
    const off = !s.sharing;
    html = `${sheetHead('What we collect')}
      <div class="sheet-body">
        <p class="s-soft">All of it is tied to your username, never your real name. Turn off anything you don't want to share and the app works exactly the same.</p>
        ${off ? `<p class="note">Sharing is off, so none of this gets sent right now. You can turn it back on in Settings.</p>` : ''}
        <div>${TRACKING.map(g => `<div class="track-item">
          <div class="row"><b>${esc(g.name)}</b><button class="switch" role="switch" aria-label="Share ${esc(g.name.toLowerCase())}" aria-checked="${!off && groupOn(s, g.id)}" data-sharepref="${g.id}" ${off ? 'disabled' : ''}><i aria-hidden="true"></i></button></div>
          <p class="s-soft">${esc(g.what)}</p>
          <p class="why"><span class="s-mono">Why we want it</span>${esc(g.why)}</p>
        </div>`).join('')}</div>
        <p class="s-soft">A few things always come through while sharing is on: check-in surveys and feedback (only when you hit send), and a heads-up when you change these switches or log in.</p>
        <p class="s-soft">Separate from all this, your setup and purchases (not your notes) are backed up under your username so you can log back in on another phone. You can turn that off in Settings.</p>
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
// goTo: a tab the notification opens, with a "See it" button.
function showToast(title, body, goTo) {
  toastEl.innerHTML = `<div class="row between">
      <span class="row"><span class="app-ico">${miniRing(13)}</span><b style="font-size:1em">${esc(APP_NAME)}</b></span>
      <span class="row"><span class="s-soft">now</span><button class="x" data-dismiss aria-label="Close notification">${xIcon}</button></span>
    </div>
    <b>${esc(title)}</b>
    <p>${esc(body)}</p>
    ${goTo ? `<button class="link toast-go" data-toast-go="${goTo}">See it &rarr;</button>` : ''}`;
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
  if (d.toastGo) { toastEl.classList.remove('on'); closeSheet(); go(d.toastGo); return; }
  if ('close' in d) { closeSheet(); return; }

  // setup
  if ('agree' in d) { store.update(st => { st.consent = { at: new Date().toISOString(), version: CONSENT.version }; st.sharing = true; }); track('consent_given', { version: CONSENT.version }); track('setup_start', {}); nextStep(); return; }
  if ('noshare' in d) { store.update(st => { st.consent = null; st.sharing = false; }); nextStep(); return; }
  if ('next' in d) { nextStep(); return; }
  if ('back' in d) { step = Math.max(0, step - 1); if (draft.login && step === 0) { draft.login = false; draft.userMsg = ''; } renderSetup(true); return; }
  if ('loginOpen' in d) { draft.login = true; draft.username = ''; draft.userMsg = ''; step = 1; renderSetup(true); return; }
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
  if ('stressEdit' in d) { stressEdit = true; renderApp(false); return; }
  if ('stressSave' in d) { saveStress(); return; }
  if (d.goalpick) { draft.goal.name = d.goalpick; draft.noGoal = false; draft.goalTouched = true; draft.adjust = 0; renderSetup(false); return; }
  if (d.goalkind) { draft.goal.kind = d.goalkind; draft.noGoal = false; draft.goalTouched = true; draft.adjust = 0; renderSetup(false); return; }
  if (d.goalfreq) { draft.goal.freq = d.goalfreq; draft.goalTouched = true; draft.adjust = 0; renderSetup(false); return; }
  if (d.goalpct) { draft.goal.pct = d.goalpct; draft.goalTouched = true; draft.adjust = 0; renderSetup(false); return; }
  if ('goalSkip' in d) { draft.noGoal = true; draft.adjust = 0; nextStep(); return; }
  if (d.catRm) {
    if (draft.order.length <= 1) return;
    draft.order = draft.order.filter(id => id !== d.catRm);
    delete draft.cats[d.catRm];
    afterCatChange();
    return;
  }
  if (d.catAdd) { draft.order.push(d.catAdd); draft.cats[d.catAdd] = 0; afterCatChange(); return; }
  if ('newcatOpen' in d) { draft.newCat = ''; renderSetup(false); const i = document.getElementById('newcat'); if (i) i.focus(); return; }
  if ('newcatSave' in d) { addNewCat(); return; }
  if ('resplit' in d) { draft.cats = B.suggestSplit(draft.order, draft.splitBase); draft.splitEdited = false; renderSetup(false); return; }
  if ('cushion' in d) { draft.cushion = !draft.cushion; renderSetup(false); return; }
  if (d.pace) { draft.adjust = saveWeekly() - Number(d.paceV); renderSetup(false); return; }
  if ('gotoGoal' in d) { draft.noGoal = false; step = steps().indexOf('goal'); renderSetup(true); return; }
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
  if ('goalOpen' in d) { closeSheet(); startSetup(true, 'goal'); return; }
  if ('sharing' in d) {
    const on = !(s.consent && s.sharing);
    if (!on) track('sharing_off', {});
    store.update(st => { if (on && !st.consent) st.consent = { at: new Date().toISOString(), version: CONSENT.version }; st.sharing = on; });
    if (on) track('sharing_on', {});
    renderSheet();
    return;
  }
  if ('backup' in d) {
    const on = !account.backupOn(s);
    store.update(st => { st.prefs.backup = on; });
    track('backup_pref', { on });
    renderSheet();
    return;
  }
  if (d.sharepref) {
    const id = d.sharepref, on = !groupOn(s, id);
    store.update(st => { st.prefs.share = { ...(st.prefs.share || {}), [id]: on }; });
    if (!on) dropGroup(id);
    track('share_pref', { group: id, on });
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

// The daily stress slider saves when they tap Save, then Home redraws (with the reminder if it's high).
function saveStress() {
  const t = viewsEl.querySelector('[data-stressday]');
  if (!t) return;
  const v = Number(t.value), day = B.dateKey(store.now());
  const first = S().stressDaily == null || S().stressDaily[day] == null;
  store.update(st => { st.stressDaily = { ...(st.stressDaily || {}), [day]: v }; });
  track('stress_daily', { day, pct: v, first_today: first });
  stressEdit = false;
  renderApp(false);
  if (v >= 60) showToast('Take a breath', easeMessage());
}

app.addEventListener('input', e => {
  const t = e.target;
  const d = t.dataset;
  const clean = v => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').replace(/^(\d{0,6})\d*/, '$1').replace(/(\.\d{0,2})\d*/, '$1');
  if ('newcat' in d) { draft.newCat = t.value; return; }
  if ('save' in d) { draft.adjust = saveWeekly() - Number(t.value); refreshResult(); return; }
  // stress sliders: the fill and the % follow the thumb; the answer is saved when they let go ('change' below)
  if ('sstress' in d || 'stressday' in d) {
    t.style.setProperty('--v', t.value + '%');
    t.classList.add('set');
    if ('sstress' in d) {
      draft.stress = Number(t.value);
      const label = viewsEl.querySelector('[data-stress-label]');
      if (label) label.textContent = t.value + '%';
      refreshSetupFoot();
    } else {
      const label = t.closest('.stress-card').querySelector('.card-head .s-mono');
      if (label) label.textContent = t.value + '%';
    }
    return;
  }
  if ('goalname' in d) { draft.goal.name = t.value; draft.noGoal = false; draft.goalTouched = true; draft.adjust = 0; refreshGoalPreview(); return; }
  if (d.goalf) { t.value = d.goalf === 'pct' ? t.value.replace(/[^0-9.]/g, '').slice(0, 4) : clean(t.value); draft.goal[d.goalf] = t.value; draft.noGoal = false; draft.goalTouched = true; draft.adjust = 0; refreshGoalPreview(); return; }
  if ('goaldate' in d) { draft.goal.date = t.value; draft.goalTouched = true; draft.adjust = 0; renderSetup(false); return; }
  if ('username' in d) { t.value = account.cleanUsername(t.value); draft.username = t.value; draft.userMsg = ''; refreshSetupFoot(); return; }
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
  if (e.key === 'Enter' && mode === 'setup' && e.target.matches && e.target.matches('[data-newcat]')) { e.preventDefault(); addNewCat(); return; }
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
  checkRecapReady();
});
setInterval(() => { refreshIfNewDay(); checkRecapReady(); }, 60000);
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
    if (s.username) { enterApp('home'); account.backupSoon(); setTimeout(checkRecapReady, 900); }
    else startSetup(false, null, true);   // set up before usernames existed: pick one, then straight to Home
  } else {
    startSetup(false);
  }
  flush();
})();
