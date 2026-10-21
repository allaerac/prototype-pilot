// Usernames with no password (supabase/schema.sql: pilot_users and the pilot_* functions).
// A username links a student's events across phones, and the phone keeps a backup under it,
// so logging in on a wiped phone brings their setup and purchases back.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=26';
import * as store from './store.js?v=26';

export const USERNAME_OK = /^[a-z0-9_.]{3,20}$/;
export const cleanUsername = v => v.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);
export const backupOn = s => !(s.prefs && s.prefs.backup === false);

async function rpc(fn, args, keepalive = false) {
  const res = await fetch(SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    keepalive,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY
    },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(fn + ' failed: ' + res.status);
  return res.json();
}

// true if the username is now theirs, false if someone already has it. Throws when offline.
export const signup = username => rpc('pilot_signup', { p_username: username });
// {backup, backup_at}, or null if the username doesn't exist. Throws when offline.
export const login = username => rpc('pilot_login', { p_username: username });

// Everything except purchase notes, which never leave the phone ("What we collect" promises that).
function snapshot(s) {
  const { anonId, ...rest } = s;
  return { ...rest, tx: (s.tx || []).map(({ note, ...t }) => t) };
}

let timer = 0;
let dirty = false;
let sending = false;
export function backupSoon() {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(() => backupNow(), 3000);
}
export async function backupNow(keepalive = false) {
  const s = store.get();
  if (!dirty || sending || !s.username || !backupOn(s) || !navigator.onLine) return;
  dirty = false;
  sending = true;
  try { await rpc('pilot_backup', { p_username: s.username, p_backup: snapshot(s) }, keepalive); }
  catch (e) { dirty = true; }   // offline or blocked: tried again on the next change, close or reconnect
  finally { sending = false; }
}

store.onSave(backupSoon);
addEventListener('online', () => backupNow());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') backupNow(true); });
