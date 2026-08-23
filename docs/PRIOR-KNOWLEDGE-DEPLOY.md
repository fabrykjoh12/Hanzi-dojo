# Deploying the prior-knowledge model (B2)

The order matters more here than in any change this repo has shipped, because of
one asymmetry established by inspecting how this repository actually deploys:

| Artifact | Trigger | Automated? |
|---|---|---|
| Frontend → Vercel Production | push to `main` (Vercel Git integration) | **Yes — minutes, unstoppable** |
| Supabase migration | a human runs `apply_migration`, or pastes into the dashboard SQL editor | **No — fully manual** |
| Android / iOS release | `workflow_dispatch` | No |

There is no CI path that applies SQL — no `supabase db push` in any workflow and
no `supabase/config.toml` at all. CI (`ci.yml`) gates the merge; it does not
deploy. E2E runs against a **mocked** Supabase, so it cannot catch a missing
column either.

**Therefore: schema first, code second.** The usual "deploy code, then migrate"
instinct is exactly backwards here, because merging is the deploy.

This is not hypothetical. `docs/BACKLOG.md` records the same failure twice — the
`writing_stats` incident (a migration sat unapplied while the RPC that needed it
shipped, and writing practice silently discarded its results for ~7 weeks), and
the HSK 3–6 readings migration that was written but not applied for ~10 days.

## Why this change is unusually order-sensitive

The frontend selects `prior_known_at` in seven card queries. PostgREST answers a
request for an unknown column with `42703` and the query **fails outright** —
this is not one of the "fails quietly by design" paths. Merge before applying and
Home, Study, Stories, Dictionary and the level test all break at once.

In the other direction, applying the schema early is safe: the columns are
nullable, every existing row has them NULL, and an old client that knows nothing
about them writes exactly what it always did.

## The sequence

### 1. Apply BOTH migrations, together

```
supabase/migrations/20260822160000_prior_knowledge_columns.sql
supabase/migrations/20260822170000_grade_card_verifies_claims.sql
```

**They must go together.** `…160000` adds `cards_unverified_claim_is_inert`,
which forbids an unverified claim from carrying scheduler state. A claim's first
calibration grade changes exactly those fields, and `grade_card`'s column
whitelist does not include `verified_at` — so with `…160000` alone, the first
check on any claimed word is rejected by the database. `…170000` teaches
`grade_card` to stamp `verified_at` in the same statement.

Verified against the live database inside a rolled-back transaction: the
whitelist update was REJECTED by the constraint; the identical update with
`verified_at` was accepted.

Applying `…170000` on its own is harmless (the CASE is a no-op while no row has
`prior_known_at`), so if they must go one at a time, apply `…170000` FIRST.

### 2. Verify against `information_schema`, not the migration ledger

The production ledger is **not trustworthy** for this repo: it holds 18 entries
against 57 migration files, its versions are apply-time stamps rather than
filename versions, and it contains at least one entry
(`20260820201330 stories_generation_meta`) with no file in the repo. Migrations
applied through the dashboard SQL editor never reach it at all.

```sql
select column_name from information_schema.columns
 where table_schema='public' and table_name='cards'
   and column_name in ('prior_known_at','prior_source','verified_at');
-- expect 3 rows

select conname from pg_constraint where conrelid='public.cards'::regclass
   and conname in ('cards_prior_source_check','cards_unverified_claim_is_inert',
                   'cards_prior_claim_has_source','cards_verified_requires_claim');
-- expect 4 rows

select count(*) as must_be_zero from pg_constraint
 where conrelid='public.cards'::regclass and conname='cards_verified_after_claim';
-- expect 0 — see "The two timestamps are not ordered" below

select pg_get_functiondef(p.oid) like '%verified_at%' as grade_card_stamps_verified
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='grade_card';
-- expect true
```

Then run the database integration test, which writes nothing:

```
supabase/tests/prior_knowledge_verification.sql   -- ends in ROLLBACK
```

Expect `ALL PASS` (35 assertions). It asserts that a claim's first grade is
atomic for BOTH outcomes, that `reps` becomes 1, that `verified_at` is set, that
provenance survives, that exactly one review log exists, and that a failure
partway leaves the card at reps 0 with `verified_at` still NULL. Sections 5 and
7 cover clock skew in both directions — including a claim dated two hours in the
server's future, which must still calibrate cleanly.

### 3. Merge the application code

Vercel builds from `main` within minutes. Nothing else is required.

### 4. Verify the live behaviour before touching legacy data

- A NEW account starting above HSK 1 writes inert claims:
  ```sql
  select count(*), min(state), bool_and(stability is null), bool_and(reps = 0)
    from cards where prior_known_at is not null and verified_at is null;
  -- state 'new', both bools true
  ```
- A calibration check completes and stamps verification:
  ```sql
  select count(*) from cards where prior_known_at is not null and verified_at is not null and reps >= 1;
  -- grows as checks are answered
  ```
- Nothing impossible exists (these should both return 0):
  ```sql
  select count(*) from cards where (prior_known_at is null) <> (prior_source is null);
  select count(*) from cards where verified_at is not null and prior_known_at is null;
  ```
  `verified_at < prior_known_at` is deliberately **not** on that list — it is
  expected, not impossible. See below.

### The two timestamps are not ordered

`prior_known_at` is stamped by the **device** clock (`priorKnownCardRow` builds
the claim row client-side); `verified_at` is stamped by the **server** clock
(`grade_card`'s `now()`), specifically so a client cannot choose it. They come
from different clock domains, so neither order is guaranteed:

- device behind the server → `verified_at` well after the claim (ordinary);
- device **ahead** of the server → a phone two hours fast writes a claim dated
  in the server's future, and an immediate, entirely genuine calibration grade
  stamps `verified_at` *before* it.

An earlier draft carried `cards_verified_after_claim` asserting
`verified_at >= prior_known_at`. That constraint would reject the second case —
a real review, refused by the database — so it was removed before any apply. Do
not reintroduce it, and do not "fix" the ordering with
`greatest(now(), prior_known_at)`: that hands the device the ability to push a
server-authoritative timestamp into the future, which is exactly what
server-derivation exists to prevent.

Nothing depends on the ordering. "Claimed, still unproven" is `verified_at is
null`, and the fact that a genuine observation happened is carried by
`reps >= 1`, which no clock can fake. Section 7 of the DB test proves a
future-dated claim still calibrates cleanly, for both outcomes.

### 5. Legacy data migration — manifest-based, and only after step 4 looks right

Apply never re-derives what to do. It acts on an approved manifest and re-reads
every row first, because a dry run is a photograph: between taking it and acting
on it a learner can grade one of the very rows it describes, and the photographed
action would then erase a real review.

```
# a. snapshot first — a LOCAL file, the only safety net (see below)
node --env-file=.env.script migrate-legacy-claims.mjs --snapshot

# b. FRESH dry run, emitting the manifest. Never reuse an old one.
node --env-file=.env.script migrate-legacy-claims.mjs --manifest /tmp/kb-manifest.json

# c. read it, then apply THAT manifest
node --env-file=.env.script migrate-legacy-claims.mjs --apply --manifest /tmp/kb-manifest.json
```

The counts recorded in any earlier review are **not** an apply plan. The
fingerprint decays continuously: every calibration answered moves a row out of
the convert class. Regenerate immediately before applying and minimise the gap
between step 3 (frontend live) and this step.

**The staleness gate.** Before touching each row the script re-reads it and
compares against the manifest's recorded precondition — every field the
classifier read, plus `created_at`. Outcomes:

| status | meaning | action |
|---|---|---|
| `ok` | unchanged since the manifest | apply |
| `ALREADY_APPLIED` | already in its expected post state | no-op (this is what makes it resumable) |
| `STALE_ROW` | a recorded field moved | **skip and report**, with the exact drift |
| `STALE_REPLAY_INPUT` | the review history behind a replay changed | **skip and report** |
| `MISSING_ROW` | the card is gone | skip and report |

For replays the gate also compares a deterministic digest of the exact
`(grade, reviewed_at)` sequence the replay consumes, so an added, re-graded or
re-timestamped review is caught.

Stale rows are never folded into the success count and never re-classified on the
fly. A later fresh dry run reclassifies them correctly.

**The write itself is a compare-and-swap.** The pre-check above exists so the
report can name what drifted; it is NOT what makes the write safe. Every UPDATE
carries its own precondition in its WHERE clause, so inspection and write are one
statement and nothing can change in between. A conditional update that matches
zero rows is reported as `STALE_ROW` — never as applied, never as failed.

The predicate uses only exactly-comparable columns — `state`, `reps`, `lapses`,
`elapsed_days`, `learned`, `is_easy`, and NULL checks on `prior_known_at` /
`verified_at`. Floats and timestamps are deliberately excluded, because they are
lossy between Postgres and JSON and would make the CAS fail on every row:

* `extra_float_digits = 0`, so a `real` column does not round-trip. PostgREST
  reports `difficulty` as `6.666` while the stored value is `6.66599559783936`;
  `difficulty = 6.666::real` matches **0 of the 51** replay rows.
* every `created_at` carries microsecond precision (`…10.003419+00`) that an
  ISO-millisecond normalisation truncates.

That is sufficient because **`reps` is the canary**: every genuine grade goes
through `grade_card`, which always increments `reps` and rewrites `state` in the
same transaction as the review log. A concurrent review cannot slip past the
predicate whatever it does to the floats. Proven in
`supabase/tests/prior_knowledge_verification.sql` (assertions 21–23): a grade
landing between the read and the write leaves the CAS matching zero rows and the
learner's grade intact, while the same CAS applies normally on an unchanged row.

**Ambiguous rows never enter the manifest at all** — only their count is carried,
so post-apply verification can confirm the same number is still sitting there
untouched. The apply path cannot reach them even in principle.

### 6. Post-migration verification

The script prints its own report and will not hide a skip inside a success:

```
planned / applied / already applied (no-op) / stale-skipped / failed / ambiguous untouched
```

followed by five invariant checks against a fresh read — no actionable legacy
rows unexpectedly remain (stale skips are subtracted and named), no inert claim
carries fabricated scheduler state, no verified card violates the knowledge
invariants, no card sits in review state with zero reps, and the ambiguous count
is unchanged.

Then confirm by hand:

```sql
-- No fabricated shape survives.
select count(*) from cards where state='review' and coalesce(reps,0)=0;   -- expect 0

-- The two ambiguous rows are untouched.
select id, state, reps, stability, prior_known_at from cards
 where id in ('7a621063-92e4-48ad-b141-e108412f3738','e52fab1c-daa7-4f59-b8c4-8ef202ec41f6');
-- expect state 'review', reps 2..3, stability 21, prior_known_at NULL
```

Then re-run `migrate-legacy-claims.mjs` (no `--apply`): it must plan **0**
conversions and **0** replays. That is the idempotency proof.

### 7. LAST: make the fabricated shape unrepresentable

```
supabase/migrations/20260822180000_scheduler_state_requires_observation.sql
```

Enforces `state in ('learning','relearning','review') ⟹ reps >= 1`. **Apply only
after step 6 passes** — production currently holds 594 rows in exactly the shape
it forbids, and applying it earlier would correctly fail on all of them.

This is the protection against stale TestFlight and old web clients. Store apps
bundle a frozen build and there is no minimum-version gate anywhere, so an old
client can keep attempting the legacy seed shape indefinitely. With this
constraint that write is rejected — and an old client failing a bad legacy write
is strictly better than it silently re-corrupting the knowledge model. The
failure is confined to that one write, because `seedClaim` is already
best-effort and never blocks onboarding.

Re-run this immediately before applying; both numbers must be 0:

```sql
select count(*) filter (where state in ('learning','relearning','review')
                          and coalesce(reps,0) = 0) as violations,
       count(*) filter (where state = 'review' and coalesce(reps,0) = 0
                          and stability = 21 and difficulty = 5
                          and elapsed_days = 0) as of_which_legacy_seed
  from cards;
```

## Backup, resume, rollback

**There is no rollback tooling in this repo** — no down migrations, no `pg_dump`
anywhere, no backup script. Rollback means Supabase's own PITR/daily backups, or
rolling forward with a new idempotent migration. Plan accordingly.

**Pre-apply snapshot (do this, it is the only real safety net).** `--snapshot`
writes a LOCAL file — `legacy-claim-snapshot-<UTC>.json`, mode 0600, gitignored
— containing the complete original row for every card the migration could
touch, plus `generated_at`, `row_count` and a SHA-256 of the canonical contents.

It is deliberately NOT a table in `public`. A copy of user card rows in a
PostgREST-exposed schema is one forgotten RLS policy away from being readable;
a file on the operator's machine has no such surface. `review_logs` are not
copied at all — they are the evidence the replay derives from, they are never
mutated, and duplicating them would be another copy of user data for no
restorative benefit.

Restoration uses those exact rows. Nothing reconstructs state heuristically.

<details><summary>Superseded: the in-database variant</summary>

```sql
create table if not exists public.cards_prekb_backup_20260822 as
select * from public.cards
 where (state='review' and coalesce(reps,0)=0)
    or (stability = 21 and coalesce(reps,0) >= 1);
select count(*) from public.cards_prekb_backup_20260822;   -- expect 647
```

This was the earlier design and is kept only to explain why it was rejected: it
places user data in a PostgREST-reachable schema. If an in-database snapshot is
ever genuinely needed, it must live in a private (non-exposed) schema with
access explicitly revoked, and that reasoning must be written down.
</details>

**Resumable after partial failure.** The script updates one row at a time and
re-classifies from a fresh read at the end. A run that dies halfway leaves some
rows converted and some not; simply re-running it plans only the remainder,
because a converted row no longer matches either fingerprint. This is asserted by
a unit test (`legacyClaimMigration.test.js` — "re-running over already-converted
rows plans nothing").

**Rolling one row back** (from the snapshot file, using its exact stored row):

```sql
update public.cards c
   set state=b.state, learned=b.learned, is_easy=b.is_easy, stability=b.stability,
       difficulty=b.difficulty, reps=b.reps, lapses=b.lapses, last_review=b.last_review,
       scheduled_days=b.scheduled_days, elapsed_days=b.elapsed_days,
       interval_days=b.interval_days, learning_step=b.learning_step,
       due_at=b.due_at, prior_known_at=null, prior_source=null, verified_at=null
  from public.cards_prekb_backup_20260822 b
 where b.id = c.id and c.id = '<card id>';
```

Note `prior_known_at`/`prior_source`/`verified_at` are cleared rather than
restored: the backup predates the columns' use, so their pre-migration value was
NULL by definition.

## The native-app consideration

Store-released apps bundle a frozen web build (`capacitor.config.json` sets
`webDir` with no `server.url`), releases are `workflow_dispatch`-only, and there
is **no minimum-version gate anywhere** — `app_version` is recorded in analytics
and never checked. So an arbitrarily old client can talk to the new schema
indefinitely.

That is safe here, and deliberately so:

- Old clients never write `prior_known_at`, so `cards_unverified_claim_is_inert`
  never applies to anything they create. Their claims are the old fabricated
  shape, which the constraint ignores.
- Old clients grade through `grade_card`, which is server-side and therefore
  already the NEW version — so a claim created on the web and graded from an old
  phone is still stamped correctly.
- Old clients reading a claim see an ordinary unstarted card and treat the word
  as unknown: they under-claim, which is the safe direction.

The one residual: an old client that falls back to its legacy multi-write path
(only when it believes `grade_card` is absent) would attempt an update without
`verified_at` and be rejected. That path is only reached when the RPC genuinely
cannot be found, which applying step 1 does not cause.
