// Pilot usage events. Each one is queued on the phone and sent in batches to the Supabase "events" table.
// Nothing is queued before the student agrees in setup, or after they stop sharing.
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_VERSION } from './config.js?v=16';
import * as store from './store.js?v=16';
import { TRACKING } from './content.js?v=16';

const QKEY = 'prototype.queue';
const MAX_QUEUE = 2000;
const GROUP = {};
TRACKING.forEach(g => g.events.forEach(n => { GROUP[n] = g.id; }));
// Groups the student switched off in Settings → What we collect. A missing entry means on.
export const groupOn = (s, id) => !(s.prefs && s.prefs.share && s.prefs.share[id] === false);
let queue = [];
try { queue = JSON.parse(localStorage.getItem(QKEY)) || []; } catch (e) { queue = []; }
let sending = false;
let timer = 0;

function persist() {
  try { localStorage.setItem(QKEY, JSON.stringify(queue.slice(-MAX_QUEUE))); } catch (e) { }
}

export function track(name, props = {}) {
  const s = store.get();
  if (!s.consent || !s.sharing) return;
  if (GROUP[name] && !groupOn(s, GROUP[name])) return;
  // the setup stress answer belongs to the stress group even though it rides on the setup event
  if ('baseline_stress' in props && !groupOn(s, 'stress')) { props = { ...props }; delete props.baseline_stress; }
  queue.push({
    id: store.newId(),
    anon_id: s.anonId,
    username: s.username || null,
    name,
    props,
    at: store.now().toISOString(),
    app_version: APP_VERSION
  });
  persist();
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

export function pending() { return queue.length; }

// No "resolution=ignore-duplicates": under row-level security that needs SELECT, which the anon key doesn't have.
function post(rows, keepalive) {
  return fetch(SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/events', {
    method: 'POST',
    keepalive,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(rows)
  });
}

export function clear() { queue = []; persist(); }

// Events this phone queued before the student picked a username get it too.
export function tagQueue(username) {
  queue.forEach(e => { if (!e.username) e.username = username; });
  persist();
}

// When a group is switched off, events from it that are still waiting on the phone are dropped too.
export function dropGroup(id) {
  queue = queue.filter(e => GROUP[e.name] !== id);
  queue.forEach(e => { if (id === 'stress' && e.props && 'baseline_stress' in e.props) delete e.props.baseline_stress; });
  persist();
}

export async function flush(keepalive = false) {
  if (sending || !queue.length || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  if (!navigator.onLine) return;
  const s = store.get();
  if (!s.consent || !s.sharing) return;
  sending = true;
  const batch = queue.slice(0, 100);
  try {
    const res = await post(batch, keepalive);
    let sent = [];
    if (res.ok) sent = batch;
    else if (res.status === 409) {
      // ids are generated on the phone, so an event re-sent after a dropped response is rejected as a duplicate
      // and fails its whole batch: send that batch one at a time and count the duplicates as already sent
      for (const e of batch) {
        const r = await post([e], keepalive);
        if (r.ok || r.status === 409) sent.push(e);
      }
    }
    if (sent.length) {
      const ids = new Set(sent.map(e => e.id));
      queue = queue.filter(e => !ids.has(e.id));
      persist();
    }
  } catch (e) {
    // offline or blocked: the queue stays and is retried later
  } finally {
    sending = false;
  }
  if (queue.length && !keepalive) timer = setTimeout(flush, 5000);
}

addEventListener('online', () => flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
setInterval(() => flush(), 30000);
