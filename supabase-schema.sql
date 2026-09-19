-- ─────────────────────────────────────────────────────────────────────────────
-- Orkest Todo — focus sync schema
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query →
-- paste → Run). Re-run it after pulling a version that changes this file: it
-- only ever adds. The desktop app and the mobile page talk to these tables
-- through the anon key, gated by the `x-sync-code` request header.
--
-- There is no account system: a 24-character sync code *is* the identity and
-- the data space. Every row carries `owner_code`, and every policy compares it
-- against the header PostgREST exposes to the database as
--   current_setting('request.headers', true)::json->>'x-sync-code'
-- (header names are lowercased by PostgREST). A request without the header
-- reads NULL and matches nothing, so the anon key alone sees no rows.
--
-- Note: Supabase Realtime connects over WebSocket and cannot carry this
-- header, so both clients poll instead of subscribing (desktop 5 s, phone
-- 10 s). A poll does not read the table every time: each side first reads the
-- newest row plus the exact row count — the two things every change moves —
-- and reads the table in full only when one of them disagrees with what it
-- already holds. A failed poll backs off (doubling, capped at 5 min).
--
-- `focus_spans` is a rolling window and NOT the archive. The desktop keeps the
-- whole log locally and mirrors only the last two days of it up here — enough
-- for the phone's running clock and today's total, which is all this page ever
-- reads — so the table stays small and a leaked sync code exposes days of
-- history rather than years. The desktop prunes rows as they age out, and it
-- is the only client that prunes: it may only drop a row it has already merged
-- into the local log, which only the desktop can know.
--
-- `app_settings` is also the space's existence. A row is admitted into
-- `focus_spans`, `focus_state` or `lists` only when the same code already owns
-- an `app_settings` row, and only the desktop ever writes that marker (it
-- pushes it first in every cycle). So a code no desktop has enabled is a code
-- nothing can be written to — which is what stops a mistyped code from
-- quietly becoming a data space of its own, the phone from filling it with
-- sessions no desktop will ever read or prune, and the page from reporting a
-- connection it did not make. Without the clause the guard is absent: reads
-- that match nothing are not errors, and a write whose `owner_code` equals the
-- header it arrived with satisfies `with check` trivially, because the caller
-- supplies both sides of that comparison.
--
-- Nothing here is permanent, and no client is relied on to make it so. While a
-- desktop runs it is the sweeper: it prunes the window, it purges a space when
-- sync is turned off, and it is the only one that may — it drops only rows it
-- has already merged into the local log, which only it can know. But a space
-- whose desktop never comes back (uninstalled without turning sync off, or a
-- code the phone once wrote into by mistake) would otherwise sit here forever.
-- The `pg_cron` jobs at the foot of this file are the floor under that, and
-- `app_settings.updated_at` is the heartbeat they read.
--
-- This file is safe to run again: tables are `if not exists`, columns are
-- `add column if not exists`, and every policy and cron job is dropped before
-- being created.
-- ─────────────────────────────────────────────────────────────────────────────

-- One focus stretch. `start_ms` is the primary key alongside the code (epoch
-- milliseconds, same numbers the desktop log stores). `end_ms` is NULL while
-- the stretch is still running; `min_ms` is the frozen floor a close judged it
-- against, NULL while it runs; `list_id` is the list it is filed under.
create table if not exists public.focus_spans (
  owner_code text  not null,
  start_ms   bigint not null,
  end_ms     bigint,
  list_id    text,
  min_ms     bigint,
  primary key (owner_code, start_ms)
);

-- The switch, one row per sync code ("idle" | "useful"). Kept as a cache for
-- the phone's quick read; both sides also derive the state from the log's
-- open tail, and every write moves the two together.
create table if not exists public.focus_state (
  owner_code text not null primary key,
  state      text not null
);

-- List names, so the phone can offer the same filing choices the desktop
-- shows. The desktop is the source of truth and pushes snapshots; the phone
-- only reads. `position` preserves the desktop's sidebar order.
create table if not exists public.lists (
  owner_code text  not null,
  id         text  not null,
  name       text  not null,
  position   int   not null default 0,
  updated_at bigint not null,
  primary key (owner_code, id)
);

-- The focus rules the phone should judge a close by (mirrors the desktop's
-- min/max settings; see `settings.ts`). One row per sync code — and that row
-- is also what makes the space exist: the three tables above admit a write
-- only while this one is here. The desktop pushes it first in every cycle, so
-- it is up before the log it belongs to; the phone never writes it, which is
-- why a code no desktop has enabled cannot be written to at all.
--
-- `updated_at` is not decoration: it is the space's heartbeat. The desktop
-- re-asserts this row on every launch and then once a day even when nothing
-- about the rules changed, and the `orkest-expire-spaces` job at the foot of
-- this file deletes markers that have not moved in a month. Losing a space
-- that way costs nothing — the archive is local and the desktop rebuilds the
-- window on its next cycle — but deleting a space whose desktop is merely
-- quiet would be a page that lies, so the heartbeat is what keeps a month of
-- silence distinguishable from an owner that is never coming back.
create table if not exists public.app_settings (
  owner_code       text not null primary key,
  min_span_minutes int  not null default 5,
  max_span_hours   int  not null default 8,
  updated_at       bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- The same column on a database made before it existed: `if not exists` above
-- only covers a fresh install. The default is evaluated as the column lands,
-- so a space that is already here gets its full month to prove itself rather
-- than being swept on the first run.
alter table public.app_settings
  add column if not exists updated_at bigint not null
  default (extract(epoch from now()) * 1000)::bigint;

alter table public.focus_spans    enable row level security;
alter table public.focus_state   enable row level security;
alter table public.lists         enable row level security;
alter table public.app_settings  enable row level security;

-- One policy per table, all four verbs: the caller's header must name the row.
-- `missing_ok` (the second argument) makes current_setting return NULL when
-- the GUC is absent, and NULL = owner_code is not true, so header-less calls
-- (plain anon-key pokes, Realtime, the SQL Editor) see and change nothing.
--
-- The three data tables carry one more clause, on the write side only, spelled
-- out identically in each:
--
--   and exists (
--     select 1 from public.app_settings
--     where app_settings.owner_code = <this table>.owner_code
--   )
--
-- i.e. a row is writable only into a space that exists, and a space exists
-- only once a desktop has pushed its marker. The subquery needs no elevated
-- privileges: it runs under RLS like anything else, and `app_settings`' own
-- policy admits the row precisely because the header and the outer row's
-- `owner_code` are the same code — the same equality, read the other way, and
-- the reason this is not circular.
--
-- It sits in `with check` and deliberately NOT in `using`: `using` also
-- governs DELETE, and the purge that empties a space removes the marker in the
-- same breath as the rows. A delete filtered by the marker's absence would
-- leave behind exactly the rows it was there to remove.
--
-- `app_settings` itself is the exception and stays ungated — it is the
-- bootstrap. Something has to be able to create a space in the first place,
-- and the only thing standing between a stranger and this table is the code's
-- entropy (32^24 ≈ 2^120), the same thing that has always stood in front of
-- every other table here. Gating it would not add a secret; it would only make
-- the first desktop write fail.

drop policy if exists "focus_spans by sync code" on public.focus_spans;
create policy "focus_spans by sync code"
  on public.focus_spans for all
  using      (current_setting('request.headers', true)::json->>'x-sync-code' = owner_code)
  with check (
    current_setting('request.headers', true)::json->>'x-sync-code' = owner_code
    and exists (
      select 1 from public.app_settings
      where app_settings.owner_code = focus_spans.owner_code
    )
  );

drop policy if exists "focus_state by sync code" on public.focus_state;
create policy "focus_state by sync code"
  on public.focus_state for all
  using      (current_setting('request.headers', true)::json->>'x-sync-code' = owner_code)
  with check (
    current_setting('request.headers', true)::json->>'x-sync-code' = owner_code
    and exists (
      select 1 from public.app_settings
      where app_settings.owner_code = focus_state.owner_code
    )
  );

drop policy if exists "lists by sync code" on public.lists;
create policy "lists by sync code"
  on public.lists for all
  using      (current_setting('request.headers', true)::json->>'x-sync-code' = owner_code)
  with check (
    current_setting('request.headers', true)::json->>'x-sync-code' = owner_code
    and exists (
      select 1 from public.app_settings
      where app_settings.owner_code = lists.owner_code
    )
  );

drop policy if exists "app_settings by sync code" on public.app_settings;
create policy "app_settings by sync code"
  on public.app_settings for all
  using      (current_setting('request.headers', true)::json->>'x-sync-code' = owner_code)
  with check (current_setting('request.headers', true)::json->>'x-sync-code' = owner_code);

-- ─────────────────────────────────────────────────────────────────────────────
-- The sweep: three weekly jobs, and the floor under everything above
--
-- Written for the case no client can cover — a space whose desktop never comes
-- back. They run on Sundays in UTC, a week apart in effect, and they are
-- ordered so that one run is self-contained: ① orphans the rows of a space it
-- just expired, ② clears exactly those ten minutes later, ③ catches up on the
-- log underneath both.
--
-- A cron job runs as the table owner (`postgres`), which is the reason these
-- work at all: every policy above reads the request header, a job has no
-- header, and a `using` clause that matches nothing filters a DELETE down to
-- zero rows *without error* — the job would report success every week and
-- delete nothing. So do NOT put `force row level security` on these four
-- tables: the owner's exemption is not a loophole here, it is the mechanism.
--
-- `pg_cron` is available on every Supabase plan including Free, and a Free
-- project paused for a week of inactivity simply skips a run — harmless, since
-- a project with no desktop running has nothing new to sweep. If the extension
-- line fails, enable pg_cron under Dashboard → Database → Extensions and re-run
-- from that line down. What has run, and what it deleted:
--   select * from cron.job_run_details order by start_time desc limit 20;
-- Each DELETE is one statement over a table that is small by design; if a
-- single-run table ever grew past a few hundred thousand rows, chunk it.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;

-- Re-runnable: pg_cron keeps one job per name, and these are dropped first so
-- a re-run replaces the schedule rather than keeping a stale one.
do $$
declare job_name text;
begin
  foreach job_name in array array[
    'orkest-expire-spaces', 'orkest-sweep-orphans', 'orkest-floor-spans'
  ] loop
    if exists (select 1 from cron.job where jobname = job_name) then
      perform cron.unschedule(job_name);
    end if;
  end loop;
end $$;

-- ① Spaces nobody has touched for a month. The marker is the heartbeat (see
--    its comment above): the desktop re-asserts it daily while it runs, so a
--    month of stillness means no desktop is coming, not a quiet user. Deleting
--    such a space loses nothing — the archive is on that machine, and if it
--    ever starts again its very first cycle re-mints the marker and rebuilds
--    the window from the local log.
select cron.schedule('orkest-expire-spaces', '10 4 * * 0', $$
  delete from public.app_settings
  where updated_at < (extract(epoch from now() - interval '30 days') * 1000)::bigint;
$$);

-- ② Rows with no marker to belong to. The write gate above already makes these
--    unreachable and unwritable, so they are pure storage cost — the residue
--    of the phone writing into a mistyped code before that gate existed, plus
--    whatever job ① orphaned ten minutes ago. Nothing here is readable by
--    anyone, which is why this one carries no risk at all.
select cron.schedule('orkest-sweep-orphans', '20 4 * * 0', $$
  delete from public.focus_spans where owner_code not in (select owner_code from public.app_settings);
  delete from public.focus_state where owner_code not in (select owner_code from public.app_settings);
  delete from public.lists       where owner_code not in (select owner_code from public.app_settings);
$$);

-- ③ The floor under the archive: no span survives seven days, ever. Seven and
--    not two, because the desktop's pull deliberately does not filter by the
--    window — it has to see every row it owns before it may drop one, and a
--    row the phone wrote with a wrong clock can only be deleted after the
--    desktop has merged it into the log it keeps. Two days here would be a
--    second pruner racing the one that knows what it is doing. The desktop is
--    still the pruner; this only catches up after one that stopped running.
select cron.schedule('orkest-floor-spans', '30 4 * * 0', $$
  delete from public.focus_spans
  where coalesce(end_ms, start_ms) < (extract(epoch from now() - interval '7 days') * 1000)::bigint;
$$);
