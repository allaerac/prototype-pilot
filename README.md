# Prototype: pilot app

A phone web app (PWA) for the ESP201 student pilot. It's plain HTML, CSS and JavaScript with no build step, so any free static host can serve it.

| File | What it is |
|---|---|
| `index.html`, `styles.css` | The page and the design system (same look as the class demo) |
| `js/app.js` | Screens: setup, Home, Deals, Recap, sheets, alerts |
| `js/budget.js` | The weekly-number formula, weeks, streaks (tested) |
| `js/content.js` | **Team-editable:** semester end date, deals, tips, consent wording |
| `js/store.js` | The student's data, saved on their phone |
| `js/track.js` | Pilot usage events, queued on the phone and sent to Supabase |
| `js/config.js` | Supabase URL + public (anon) key |
| `supabase/schema.sql` | The `events` table. Run once in Supabase |
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
1. **Supabase:** open the SQL Editor, run `supabase/schema.sql`, then paste the project's **anon public** key into `js/config.js`. Until then, events wait on each phone and send once the key is set.
2. **Semester end:** confirm Miami's last day of finals and update `SEMESTER_END_DEFAULT` in `js/content.js` (currently Dec 11, 2026).
3. **Deals:** call or visit each venue in `DEALS` (`js/content.js`), delete anything that's wrong, and fill in `checked` with the date. The research and sources are in `pilot/deals-research.md`.
4. **Copy review:** the team reads the consent text (`CONSENT`) and tips (`TIPS`) for tone and legal framing. Ask the instructor whether collecting this data needs approval.
5. **Phones:** students must **add it to their Home Screen**. On iPhone, Safari can erase a website's saved data after 7 days without a visit, but not an installed app's.

## Deploy for free (GitHub Pages)
1. Put the contents of `app/` in a **public** GitHub repo.
2. In the repo, go to Settings → Pages → Deploy from branch → `main` / root.
3. Share the `https://<user>.github.io/<repo>/` link.

**Every time you deploy a change:** bump the `?v=` number in `index.html` (two places) and in the `import` lines of `js/app.js` and `js/track.js`, so phones don't mix old and new files.

## What gets collected
Every event has a random ID per phone (`anon_id`), a name, small `props`, and a time. There are no names, emails or bank data.

| Event | When | Props |
|---|---|---|
| `consent_given` | Student agrees in setup | version |
| `setup_start`, `setup_step`, `setup_complete` | Setup | step; sources, bills, cushion, suggested vs final number, seconds taken, baseline stress |
| `app_open` | Every open or return to the app | standalone (installed?), days since start |
| `screen_view` | Tab change | screen |
| `log_open`, `tx_add`, `tx_delete` | Logging | amount, category, today/yesterday, % of week used |
| `alert_shown` | 75% / 100% alert | threshold |
| `week_closed` | Once per finished week | budget, spent, under, purchases logged |
| `stress_checkin` | Recap 1–5 | week, score |
| `deal_open`, `deal_source`, `deals_21_toggle` | Deals | deal id |
| `survey_response` | Day 14 and day 28 check-ins | satisfaction, keep using, would pay, comments |
| `feedback` | Settings → Send feedback | text |
| `sharing_off`, `sharing_on`, `reset` | Settings | none |

## Reading the results (Supabase SQL Editor)
```sql
-- Setup completion (PRD target ≥ 70%)
select count(distinct anon_id) filter (where name = 'consent_given') as agreed,
       count(distinct anon_id) filter (where name = 'setup_complete') as finished
from events;

-- Week-4 retention (target ≥ 50%): opened the app 21–28 days after setup
with s as (select anon_id, min(at) t0 from events where name = 'setup_complete' group by anon_id)
select count(*) as students,
       count(*) filter (where exists (
         select 1 from events e where e.anon_id = s.anon_id and e.name = 'app_open'
           and e.at >= s.t0 + interval '21 days' and e.at < s.t0 + interval '28 days')) as opened_week_4
from s;

-- Weeks under budget (target ≥ 60%), counting only weeks with something logged
select count(*) filter (where (props->>'under')::boolean) as under, count(*) as weeks
from events where name = 'week_closed' and (props->>'logged')::int > 0;

-- Money stress: baseline vs latest check-in (target: down ≥ 1 point)
with b as (select anon_id, (props->>'baseline_stress')::int s0 from events where name = 'setup_complete'),
     l as (select distinct on (anon_id) anon_id, (props->>'score')::int s1
           from events where name = 'stress_checkin' order by anon_id, at desc)
select round(avg(s0), 2) baseline, round(avg(s1), 2) latest, round(avg(s1 - s0), 2) change
from b join l using (anon_id);

-- Deals use per week (target ≥ 30% of active students)
select date_trunc('week', at) as week,
       count(distinct anon_id) filter (where name = 'screen_view' and props->>'screen' = 'deals') as opened_deals,
       count(distinct anon_id) as active
from events group by 1 order by 1;

-- Satisfaction and willingness to pay
select props->>'survey' as survey, round(avg((props->>'satisfaction')::int), 2) as satisfaction, count(*)
from events where name = 'survey_response' group by 1;
select props->>'pay' as pay, count(*) from events
where name = 'survey_response' and props->>'survey' = 'final' group by 1;
```
