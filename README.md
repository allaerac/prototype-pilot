# Prototype: pilot app

A phone web app (PWA) for the ESP201 student pilot. It's plain HTML, CSS and JavaScript with no build step, so any free static host can serve it.

| File | What it is |
|---|---|
| `index.html`, `styles.css` | The page and the design system (rules in `../design/DESIGN.md`; two color schemes) |
| `js/app.js` | Screens: setup, Home, Deals, Recap, sheets, alerts |
| `js/budget.js` | The weekly-number formula, category split, savings goal, weeks, streaks (tested) |
| `js/content.js` | **Team-editable:** semester end date, deals, quotes, consent wording, what-we-collect reasons |
| `js/store.js` | The student's data, saved on their phone |
| `js/account.js` | Username login (no password) and the backup that brings a student's data back on a new phone |
| `js/track.js` | Pilot usage events, queued on the phone and sent to Supabase |
| `js/config.js` | Supabase URL + public (anon) key |
| `supabase/schema.sql` | The `events` table, usernames and backups, and the `student_events` view. Already applied to the project |
| `sw.js`, `manifest.webmanifest`, `icons/` | Install to Home Screen + offline |

## Run it locally
```bash
python -m http.server 8770 --directory app
```
Then open http://localhost:8770. To test a different day, add `?now=2026-10-25T19:00` to the URL.

Run the formula tests:
```bash
node app/test/budget.test.mjs
```

## Before students get the link
1. **Supabase:** done. `supabase/schema.sql` is applied and the anon key is in `js/config.js`. Delete the test rows before launch (test usernames start with `zz_` or `test.`). Free projects **pause after about 7 days with no activity**: the app then can't sign anyone up. Restore it from the Supabase dashboard if that happens.
2. **Semester end:** confirm Miami's last day of finals and update `SEMESTER_END_DEFAULT` in `js/content.js` (currently Dec 11, 2026).
3. **Deals:** call or visit each venue in `DEALS` (`js/content.js`), delete anything that's wrong, and fill in `checked` with the date. The research and sources are in `pilot/deals-research.md`.
4. **Copy review:** the team reads the consent text (`CONSENT`) and Recap's quotes (`QUOTES`, stand-ins for money tips for now) for tone and legal framing. Ask the instructor whether collecting this data needs approval.
5. **Phones:** students must **add it to their Home Screen**. On iPhone, Safari can erase a website's saved data after 7 days without a visit, but not an installed app's.

## Color scheme, and going back to the old design
- **Switch colors:** set `THEME` in `js/content.js` to `'classic'` (navy with the violet-mint-blush ring, the default) or `'graphite'` (neutral, color only for warnings). To try one without changing anything, add `?theme=graphite` or `?theme=classic` to the link.
- **Go back to the old design entirely:** the version from before the redesign is saved as the git tag `classic`. To put it back live, in the `app` folder run:
  ```bash
  git checkout main && git reset --hard classic && git push --force origin main
  ```
  GitHub Pages republishes in a minute or two. Students' data is unaffected (it lives on their phones and in Supabase).

## Deploy for free (GitHub Pages)
1. Put the contents of `app/` in a **public** GitHub repo.
2. In the repo, go to Settings → Pages → Deploy from branch → `main` / root.
3. Share the `https://<user>.github.io/<repo>/` link.

**Every time you deploy a change:** bump the `?v=` number in `index.html` (two places) and in the `import` lines of `js/app.js`, `js/track.js` and `js/account.js`, so phones don't mix old and new files.

## Usernames and backups
In setup, students type their **first name, last name and any 2 numbers**, and the username is made from them: `austin.allaer27` (letters only, accents dropped). The server rejects a username someone already has, so two people with the same name just pick different numbers. There's no password.

The username is on every event, so a student who clears their browser or switches phones stays one person in the data: they tap **Already signed up? Log in** on the first screen, type the same name and numbers, and their setup, purchases, goal and stress answers come back. The phone backs up to `pilot_users` a few seconds after each change, without purchase notes. Students can turn the backup off in Settings.

**Privacy:** without a password, anyone who knows a classmate's name and 2 numbers (only 100 combinations) can log in as them and see their budget. Tell students to pick numbers nobody would guess.

## What gets collected
Every event has a random ID per phone (`anon_id`), the student's `username` once they've picked one, a name, small `props`, and a time. There are no real names, emails or bank data. To count people, use the `student_events` view: its `student` column is the username, filled in for the few events a phone sent before the student picked it.

| Event | When | Props |
|---|---|---|
| `consent_given` | Student agrees in setup | version |
| `setup_start`, `setup_step`, `setup_complete` | Setup | step (`username`, `onhand`, `income`, `bills`, `end`, `stress`, `result`, `goal`, `split`, `ready`); income types and frequencies (a type can repeat), bill types and frequencies, whether they have money now (true/false, never the amount), category priority order, any categories they added, the split per week, whether they changed the suggested split, savings goal (name, kind, dollars a week at our pick and at the level they chose), `pace` (`conservative`, `middle`, `aggressive` or `custom` from the slider), cushion, suggested vs final number, seconds taken, baseline stress (0–100) |
| `setup_redo_start`, `setup_redo_complete` | Settings → Redo setup, Money coming in, Change split or Change goal | same as `setup_complete`, without baseline stress, plus `edit` (`income`, `split`, `goal`, or null for a full redo) |
| `goal_set`, `goal_removed` | A goal is set or changed, or taken away | name, kind (`every`, `by`, `percent`), freq, pct, per_week |
| `login` | Logged in with a username on this phone | whether a backup came back |
| `backup_pref` | Settings → Back up to your username | on |
| `stress_daily` | Home's money stress slider, once a day (can be changed) | day, pct (0–100), first_today |
| `app_open` | Every open or return to the app | standalone (installed?), days since start |
| `screen_view` | Tab change | screen |
| `recap_ready_shown` | The in-app "Your recap is ready" banner, once per week (Sunday 6 pm or the next open) | week, kind |
| `log_open`, `tx_add`, `tx_delete` | Logging | amount, category, today/yesterday, % of week used |
| `alert_shown` | 75% / 100% alert | threshold |
| `week_closed` | Once per finished week | budget, spent, under, purchases logged, goal_saved (what landed in the goal) |
| `stress_checkin` | Old 1–5 recap question (replaced by `stress_daily`) | week, score |
| `deal_open`, `deal_source`, `deals_21_toggle` | Deals | deal id |
| `survey_response` | Day 14 and day 28 check-ins | satisfaction, keep using, would pay, comments |
| `feedback` | Settings → Send feedback | text |
| `sharing_off`, `sharing_on`, `reset` | Settings | none |
| `share_pref` | Settings → What we collect | group, on |

### Students choose what they share
Settings → **What we collect** (also linked from the consent card in setup) lists six groups. Each has what it covers, why we want it, and its own switch. The wording lives in `TRACKING` in `js/content.js`, so the team can edit it.

| Group | Events |
|---|---|
| `setup` Your setup answers | `setup_start`, `setup_step`, `setup_complete`, `setup_redo_start`, `setup_redo_complete`, `goal_set`, `goal_removed` |
| `purchases` Purchases you log | `log_open`, `tx_add`, `tx_delete` |
| `weeks` How your weeks go | `week_closed`, `alert_shown` |
| `stress` Money stress check-ins | `stress_daily`, `stress_checkin`, plus `baseline_stress` inside `setup_complete` |
| `usage` When and how you use the app | `app_open`, `screen_view`, `recap_view`, `survey_open`, `install_prompt`, `installed` |
| `deals` Deals you check out | `deal_open`, `deal_source`, `deals_21_toggle` |

Always sent while sharing is on: `consent_given`, `sharing_on`/`sharing_off`, `share_pref`, `backup_pref`, `login`, `reset`, and the surveys and feedback a student chooses to send. Switching a group off also drops that group's events still waiting on the phone. A student who turns a group off won't show up in the metrics below that use it, so check `share_pref` before reading low numbers as low usage.

## Logins: who opens the app and when
Four views in Supabase (Table Editor, or `select * from …` in the SQL Editor). Times are Oxford time. Every open counts, including switching back to the app; a **visit** is an open at least 30 minutes after that student's previous one.

| View | One row per | Use it for |
|---|---|---|
| `metric_daily_active` | Day | Students who opened the app that day, visits, raw opens. The daily-active chart for the pitch |
| `metric_open_times` | Weekday × hour | When students open it (visits and students). A heat map |
| `metric_students` | Student | First seen, setup finished, last open, opens, days active, purchases logged. Spot who stopped using it |
| `metric_opens` | Open | Every open with its time and whether it came from the Home Screen app |

To chart one in Google Sheets: run `select * from metric_daily_active` in the SQL Editor, click **Download CSV**, then import it. Students who switched off "When and how you use the app" in Settings don't send opens.

## Reading the results (Supabase SQL Editor)
```sql
-- Every query counts people by `student` (their username), so a student who switched phones counts once.

-- Setup completion (PRD target ≥ 70%)
select count(distinct student) filter (where name = 'consent_given') as agreed,
       count(distinct student) filter (where name = 'setup_complete') as finished
from student_events;

-- Week-4 retention (target ≥ 50%): opened the app 21–28 days after setup
with s as (select student, min(at) t0 from student_events where name = 'setup_complete' group by student)
select count(*) as students,
       count(*) filter (where exists (
         select 1 from student_events e where e.student = s.student and e.name = 'app_open'
           and e.at >= s.t0 + interval '21 days' and e.at < s.t0 + interval '28 days')) as opened_week_4
from s;

-- Weeks under budget (target ≥ 60%), counting only weeks with something logged.
-- One row per student and week, in case a backup brought a week back on a second phone.
select count(*) filter (where under) as under, count(*) as weeks
from (select distinct on (student, props->>'week') (props->>'under')::boolean as under
      from student_events where name = 'week_closed' and (props->>'logged')::int > 0
      order by student, props->>'week', at) w;

-- Money stress (0–100 slider): setup vs the last 7 days of daily answers.
-- The PRD's target was "down ≥ 1 point" on a 1–5 scale, which is about 25 points here.
with b as (select distinct on (student) student, (props->>'baseline_stress')::int s0
           from student_events where name = 'setup_complete' order by student, at),
     l as (select student, avg((props->>'pct')::int) s1 from student_events
           where name = 'stress_daily' and at > now() - interval '7 days' group by student)
select round(avg(s0)) baseline, round(avg(s1)) last_7_days, round(avg(s1 - s0)) change, count(*) students
from b join l using (student);

-- Savings goals: who has one, what for, and how much landed in it
select g.student, g.props->>'name' as goal, g.props->>'kind' as kind, (g.props->>'per_week')::int as per_week,
       coalesce(sum((w.props->>'goal_saved')::numeric), 0) as saved_so_far
from (select distinct on (student) * from student_events where name = 'goal_set' order by student, at desc) g
left join student_events w on w.student = g.student and w.name = 'week_closed' and w.at > g.at
group by 1, 2, 3, 4;

-- Deals use per week (target ≥ 30% of active students)
select date_trunc('week', at) as week,
       count(distinct student) filter (where name = 'screen_view' and props->>'screen' = 'deals') as opened_deals,
       count(distinct student) as active
from student_events group by 1 order by 1;

-- Satisfaction and willingness to pay
select props->>'survey' as survey, round(avg((props->>'satisfaction')::int), 2) as satisfaction, count(*)
from student_events where name = 'survey_response' group by 1;
select props->>'pay' as pay, count(*) from student_events
where name = 'survey_response' and props->>'survey' = 'final' group by 1;
```
