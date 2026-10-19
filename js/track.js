// Pilot usage events. Each one is queued on the phone and sent in batches to the Supabase "events" table.
// Nothing is queued before the student agrees in setup, or after they stop sharing.
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_VERSION } from './config.js?v=3';
import * as store from './store.js?v=3';

const QKEY = 'prototype.queue';
const MAX_QUEUE = 2000;
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
  queue.push({
    id: store.newId(),
    anon_id: s.anonId,
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
