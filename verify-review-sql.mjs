// Real SQL execution in disposable PGlite; never connects to production.
// npm install --prefix /tmp/hanzi-review-sql --no-save @electric-sql/pglite@0.5.8
// node verify-review-sql.mjs --pglite /tmp/hanzi-review-sql/node_modules/@electric-sql/pglite/dist/index.js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'vite'

const option = name => process.argv[process.argv.indexOf(name) + 1]
const pgliteModule = process.argv.includes('--pglite') ? pathToFileURL(resolve(option('--pglite'))).href : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()
const migrationPath = 'supabase/migrations/20260928120000_durable_review_operations.sql'
const migration = await readFile(migrationPath, 'utf8')
const sourcePath = process.argv.includes('--intent-module') ? resolve(option('--intent-module')) : resolve('src/studyGradeIntent.js')
const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
const { createStudyGradeIntent } = await vite.ssrLoadModule(sourcePath)
const { schedule } = await vite.ssrLoadModule(resolve('src/srs.js'))
let sortOrder = 0
let count = 0
const results = []

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to public;
    alter default privileges in schema public grant all on tables to authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `)
  // PGlite includes core gen_random_uuid; only the unavailable extension-loader
  // statement is omitted. Every table, RLS policy and SQL body is repo source.
  await db.exec((await readFile('supabase/schema.sql', 'utf8')).replace('create extension if not exists "pgcrypto";', ''))
  for (const file of [
    '20260606120000_add_fsrs_columns.sql',
    '20260702120000_add_story_reads.sql',
    '20260718160000_add_card_source_sentence.sql',
    '20260727120000_add_card_source_story.sql',
    '20260809090000_story_chapter_rewards.sql',
    '20260822160000_prior_knowledge_columns.sql',
    '20260822170000_grade_card_verifies_claims.sql',
    '20260822180000_scheduler_state_requires_observation.sql',
  ]) await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'))
  await db.exec(migration)
  await db.exec(migration)

  async function as(owner, sql, params = [], role = 'authenticated') {
    return db.transaction(async tx => {
      await tx.exec(`set local role ${role}`)
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [owner || ''])
      return tx.query(sql, params)
    })
  }
  async function fixture() {
    const owner = randomUUID()
    await db.query('insert into auth.users(id) values ($1)', [owner])
    await db.query('insert into public.profiles(id) values ($1)', [owner])
    await db.query("insert into public.language_tracks(user_id,language,system,current_level) values ($1,'chinese','hsk_3',1)", [owner])
    const vocab = []
    for (let i = 0; i < 4; i++) {
      const id = randomUUID()
      await db.query("insert into public.vocabulary(id,language,system,level,sort_order,word,meaning) values ($1,'chinese','hsk_3',1,$2,'好','good')", [id, ++sortOrder])
      vocab.push(id)
    }
    return { owner, vocab }
  }
  async function intent(f, idx = 0, { card = null, generation = 0, day = '2026-09-28', grade = 2 } = {}) {
    const input = card || { vocab_id: f.vocab[idx], state: 'new', interval_days: 0, vocab: { level: 1 } }
    return createStudyGradeIntent({ card: input, result: schedule(input, grade), grade,
      userId: f.owner, track: { language: 'chinese', system: 'hsk_3' }, generation, day, opId: randomUUID() })
  }
  async function grade(i, owner = i.userId, role = 'authenticated') {
    const result = await as(owner, 'select public.grade_card_v2($1,$2,$3::jsonb,$4::jsonb,$5::date,$6,$7::jsonb,$8,$9) as result', [
      i.vocabId, i.cardId, JSON.stringify(i.updates), JSON.stringify(i.log), i.day,
      i.opId, i.expected && JSON.stringify(i.expected), i.userId, i.generation,
    ], role)
    return result.rows[0].result
  }
  async function undo(i, owner = i.userId) {
    return (await as(owner, 'select public.undo_grade_v2($1,$2) as result', [i.opId, i.userId])).rows[0].result
  }
  async function row(table, owner) {
    return (await db.query(`select * from public.${table} where ${table === 'profiles' ? 'id' : 'user_id'}=$1`, [owner])).rows
  }
  async function legacy(i, activity = { date: i.day, mode: 'set', studied: 999, new: 999 }) {
    return (await as(i.userId, 'select public.grade_card($1,$2::jsonb,$3,$4::jsonb,$5::jsonb,$6) as result', [
      i.vocabId, JSON.stringify(i.updates), i.cardId, JSON.stringify(i.log), JSON.stringify(activity), i.opId,
    ])).rows[0].result
  }
  async function rejectsCode(call, code) {
    await assert.rejects(call, e => e.code === code, `Expected SQLSTATE ${code}`)
  }
  async function check(name, run) {
    const f = await fixture()
    await run(f)
    count++
    results.push({ name, pass: true })
    console.log(`PASS ${name}`)
  }

  await check('real FSRS producer: one atomic grade, duplicate replay, immutable payload', async f => {
    const i = await intent(f)
    const first = await grade(i)
    assert.equal(first.status, 'applied')
    assert.equal(first.card.reps, i.updates.reps)
    assert.equal(Number(first.card.revision), 1)
    assert.equal(new Date(first.card.first_reviewed_at).getTime(), new Date(i.updates.last_review).getTime())
    const replay = await grade(i)
    assert.equal(replay.already_applied, true)
    assert.equal(replay.card_id, first.card_id)
    await rejectsCode(() => grade({ ...i, updates: { ...i.updates, learned: !i.updates.learned } }), '40001')
    assert.equal((await row('cards', f.owner)).length, 1)
    assert.equal((await row('review_logs', f.owner)).length, 1)
    assert.equal((await row('grade_operations', f.owner)).length, 1)
    assert.equal((await row('daily_activity', f.owner))[0].studied_cards, 1)
    await db.exec(migration)
    assert.equal((await row('grade_operations', f.owner)).length, 1)
    assert.equal(Number((await row('cards', f.owner))[0].revision), 1)
  })
  await check('Undo preserves inert first card, receipt and duplicate tombstone', async f => {
    const i = await intent(f)
    const first = await grade(i)
    const undone = await undo(i)
    assert.equal(undone.card_id, first.card_id)
    assert.equal(undone.card.state, 'new')
    assert.equal(undone.card.reps, 0)
    assert.equal(undone.card.first_reviewed_at, null)
    assert.equal(Number(undone.card.revision), 2)
    assert.equal((await row('review_logs', f.owner)).length, 0)
    assert.equal((await row('daily_activity', f.owner))[0].studied_cards, 0)
    assert.equal((await grade(i)).status, 'undone')
    assert.equal((await undo(i)).already_applied, true)
  })
  await check('two sessions add independently; Undo subtracts only own original day', async f => {
    const a = await intent(f, 0, { day: '2026-09-27' })
    const b = await intent(f, 1, { day: '2026-09-27' })
    const c = await intent(f, 2, { day: '2026-09-28' })
    await grade(a); await grade(b); await grade(c); await undo(a)
    const days = await row('daily_activity', f.owner)
    assert.deepEqual(days.map(d => [new Date(d.activity_date).toISOString().slice(0, 10), d.studied_cards]).sort(), [['2026-09-27', 1], ['2026-09-28', 1]])
    assert.equal((await row('review_logs', f.owner)).length, 2)
  })
  await check('stale snapshot and stale revision fail before any mutation', async f => {
    const first = await grade(await intent(f))
    const a = await intent(f, 0, { card: first.card })
    const b = await intent(f, 0, { card: first.card })
    await grade(a)
    await rejectsCode(() => grade(b), '40001')
    assert.equal((await row('review_logs', f.owner)).length, 2)
    assert.equal((await row('daily_activity', f.owner))[0].studied_cards, 2)
  })
  await check('duplicate returns CURRENT card after a later grade', async f => {
    const a = await intent(f, 0, { grade: 0 })
    const first = await grade(a)
    const second = await grade(await intent(f, 0, { card: first.card, grade: 3 }))
    const replay = await grade(a)
    assert.deepEqual(replay.card, second.card)
    await rejectsCode(() => undo(a), '40001')
  })
  await check('reset rejects queued absent intent; receipts cannot resurrect deleted cards', async f => {
    const applied = await intent(f)
    const queued = await intent(f, 1)
    await grade(applied)
    await as(f.owner, "select public.reset_language_progress('chinese','hsk_3',false)")
    assert.equal(Number((await row('profiles', f.owner))[0].review_generation), 1)
    assert.equal((await row('cards', f.owner)).length, 0)
    assert.equal((await grade(applied)).card, null)
    await rejectsCode(() => grade(queued), '40001')
    await rejectsCode(() => undo(applied), '40001')
    const fresh = await grade(await intent(f, 0, { generation: 1 }))
    assert.ok(fresh.card_id)
    assert.equal((await grade(applied)).card, null)
    assert.equal((await row('cards', f.owner)).length, 1)
  })
  await check('compatibility reset alias increments generation and clears requested history', async f => {
    await grade(await intent(f))
    await as(f.owner, "select public.reset_current_language_progress('chinese','hsk_3',true)")
    assert.equal(Number((await row('profiles', f.owner))[0].review_generation), 1)
    assert.equal((await row('daily_activity', f.owner)).length, 0)
    assert.equal((await row('grade_operations', f.owner)).length, 1)
  })
  await check('prior-knowledge calibration verifies on server and Undo restores inert claim', async f => {
    const claim = (await db.query(`insert into public.cards(user_id,vocab_id,state,stability,difficulty,prior_known_at,prior_source)
      values($1,$2,'new',null,null,'2026-09-30T12:00:00Z','placement') returning *`, [f.owner, f.vocab[0]])).rows[0]
    const i = await intent(f, 0, { card: claim })
    const applied = await grade(i)
    assert.ok(applied.card.verified_at)
    assert.equal(applied.card.prior_source, 'placement')
    assert.equal((await row('daily_activity', f.owner))[0].new_cards, 0)
    const undone = await undo(i)
    assert.equal(undone.card.verified_at, null)
    assert.equal(undone.card.stability, null)
    assert.equal(undone.card.state, 'new')
    assert.equal(undone.card.prior_source, 'placement')
  })
  await check('partial failure rolls back card, log, activity and receipt', async f => {
    await db.exec(`create function public.test_reject_receipt() returns trigger language plpgsql as $$ begin raise exception 'injected receipt failure'; end $$;
      create trigger test_reject_receipt before insert on public.grade_operations for each row execute function public.test_reject_receipt();`)
    const failedIntent = await intent(f)
    await assert.rejects(() => grade(failedIntent), /injected receipt failure/)
    assert.equal((await row('cards', f.owner)).length, 0)
    assert.equal((await row('review_logs', f.owner)).length, 0)
    assert.equal((await row('daily_activity', f.owner)).length, 0)
    assert.equal((await row('grade_operations', f.owner)).length, 0)
    await db.exec('drop trigger test_reject_receipt on public.grade_operations; drop function public.test_reject_receipt()')
  })
  await check('Undo refuses damaged aggregate and leaves full grade intact', async f => {
    const i = await intent(f)
    const applied = await grade(i)
    await db.query('update public.daily_activity set studied_cards=0 where user_id=$1', [f.owner])
    await rejectsCode(() => undo(i), '40001')
    assert.equal(Number((await row('cards', f.owner))[0].revision), Number(applied.card.revision))
    assert.equal((await row('review_logs', f.owner)).length, 1)
    assert.equal((await row('grade_operations', f.owner))[0].status, 'applied')
  })
  await check('legacy RPC remains transactional/additive and preserves tombstones', async f => {
    const a = await intent(f)
    const b = await intent(f, 1)
    await legacy(a); await legacy(b)
    assert.equal((await row('daily_activity', f.owner))[0].studied_cards, 2)
    assert.equal((await legacy(a)).already_applied, true)
    await undo(a)
    assert.equal((await legacy(a)).status, 'undone')
    assert.equal((await row('daily_activity', f.owner))[0].studied_cards, 1)
    await as(f.owner, "select public.reset_language_progress('chinese','hsk_3',false)")
    assert.equal((await legacy(a)).card, null)
    const queued = await intent(f, 2)
    await rejectsCode(() => legacy(queued), '40001')
  })
  await check('v2 operation cannot be replayed through legacy endpoint after Undo', async f => {
    const i = await intent(f)
    await grade(i); await undo(i)
    await rejectsCode(() => legacy(i), '40001')
    assert.equal((await row('review_logs', f.owner)).length, 0)
  })
  await check('owner identity, ledger RLS, and direct mutation grants are enforced', async f => {
    const other = await fixture()
    const i = await intent(f)
    await grade(i)
    await rejectsCode(() => grade(i, other.owner), '42501')
    await rejectsCode(() => undo(i, other.owner), '42501')
    assert.equal((await as(other.owner, 'select * from public.grade_operations where user_id=$1', [f.owner])).rows.length, 0)
    assert.equal((await as(f.owner, 'select * from public.grade_operations where user_id=$1', [f.owner])).rows.length, 1)
    await rejectsCode(() => as(f.owner, "update public.grade_operations set status='undone' where user_id=$1", [f.owner]), '42501')
    await rejectsCode(() => as(f.owner, 'delete from public.grade_operations where user_id=$1', [f.owner]), '42501')
    await rejectsCode(() => as(f.owner, 'update public.profiles set review_generation=10 where id=$1', [f.owner]), '42501')
    await rejectsCode(() => as(f.owner, 'update public.cards set revision=100 where user_id=$1', [f.owner]), '42501')
    await rejectsCode(() => as(f.owner, "update public.cards set first_reviewed_at=now() where user_id=$1", [f.owner]), '42501')
  })
  await check('anonymous and helper execution denied including inherited default grants', async f => {
    const i = await intent(f)
    await rejectsCode(() => grade(i, '', 'anon'), '42501')
    await rejectsCode(() => as(f.owner, 'select public.review_learner_lock($1)', [f.owner]), '42501')
    await rejectsCode(() => as(f.owner, "select public.review_card_snapshot('{}'::jsonb)"), '42501')
    await rejectsCode(() => as('', "select public.reset_language_progress('chinese','hsk_3',false)", [], 'anon'), '42501')
  })
  await check('direct card edits advance server revision and invalidate pending grades', async f => {
    const applied = await grade(await intent(f))
    const pending = await intent(f, 0, { card: applied.card })
    await as(f.owner, "update public.cards set due_at=due_at+interval '1 day' where id=$1", [applied.card_id])
    assert.equal(Number((await row('cards', f.owner))[0].revision), 2)
    await rejectsCode(() => grade(pending), '40001')
  })
  await check('late Undo failure rolls back restored card, deleted log, and activity subtraction', async f => {
    const i = await intent(f)
    const applied = await grade(i)
    await db.exec(`create function public.test_reject_undo() returns trigger language plpgsql as $$ begin raise exception 'injected undo receipt failure'; end $$;
      create trigger test_reject_undo before update on public.grade_operations for each row execute function public.test_reject_undo();`)
    await assert.rejects(() => undo(i), /injected undo receipt failure/)
    const card = (await row('cards', f.owner))[0]
    assert.equal(Number(card.revision), Number(applied.card.revision))
    assert.equal(card.reps, applied.card.reps)
    assert.equal((await row('review_logs', f.owner)).length, 1)
    assert.equal((await row('daily_activity', f.owner))[0].studied_cards, 1)
    assert.equal((await row('grade_operations', f.owner))[0].status, 'applied')
    await db.exec('drop trigger test_reject_undo on public.grade_operations; drop function public.test_reject_undo()')
  })
  await check('malformed intent, missing updates, and inconsistent log cannot write partially', async f => {
    const i = await intent(f)
    for (const changes of [
      { updates: [] }, { log: [] }, { updates: {} }, { expected: [] },
      { log: { ...i.log, previous_state: 'review' } },
      { updates: { ...i.updates, reps: 5 } }, { generation: -1 },
    ]) await rejectsCode(() => grade({ ...i, ...changes }), '22023')
    assert.equal((await row('cards', f.owner)).length, 0)
    assert.equal((await row('review_logs', f.owner)).length, 0)
    assert.equal((await row('daily_activity', f.owner)).length, 0)
    assert.equal((await row('grade_operations', f.owner)).length, 0)
  })
  await check('legacy and v2 sessions share additive totals without accepting stale observations', async f => {
    const a = await intent(f)
    const b = await intent(f, 1)
    const first = await legacy(a)
    await grade(b)
    const c = await intent(f, 0, { card: first.card })
    await grade(c)
    await rejectsCode(() => legacy({ ...a, opId: randomUUID(), cardId: first.card_id }), '22023')
    assert.equal((await row('daily_activity', f.owner))[0].studied_cards, 3)
    assert.equal((await row('daily_activity', f.owner))[0].new_cards, 2)
    assert.equal((await row('review_logs', f.owner)).length, 3)
  })
  await check('repeated reset/replacement never returns a newer identity through an old receipt', async f => {
    const ids = []
    const intents = []
    for (let generation = 0; generation < 3; generation++) {
      const i = await intent(f, 0, { generation })
      const saved = await grade(i)
      ids.push(saved.card_id); intents.push(i)
      for (const old of intents.slice(0, -1)) assert.equal((await grade(old)).card, null)
      if (generation < 2) await as(f.owner, "select public.reset_language_progress('chinese','hsk_3',false)")
    }
    assert.equal(new Set(ids).size, 3)
    assert.equal((await row('cards', f.owner)).length, 1)
    assert.equal((await row('grade_operations', f.owner)).length, 3)
  })
  await check('protected columns reject hostile INSERT and catalog grants remain least privilege', async f => {
    const newOwner = randomUUID()
    await db.query('insert into auth.users(id) values($1)', [newOwner])
    await rejectsCode(() => as(newOwner, 'insert into public.profiles(id,review_generation) values($1,5)', [newOwner]), '42501')
    await rejectsCode(() => as(f.owner, 'insert into public.cards(user_id,vocab_id,revision) values($1,$2,5)', [f.owner, f.vocab[0]]), '42501')
    await rejectsCode(() => as(f.owner, "insert into public.cards(user_id,vocab_id,first_reviewed_at) values($1,$2,now())", [f.owner, f.vocab[0]]), '42501')
    const functions = (await db.query(`select proname, has_function_privilege('anon',p.oid,'EXECUTE') as anonymous,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and proname in ('grade_card_v2','undo_grade_v2','review_card_snapshot','review_learner_lock')`)).rows
    assert.equal(functions.length, 4)
    for (const fn of functions) {
      assert.equal(fn.anonymous, false)
      assert.equal(fn.authenticated, ['grade_card_v2', 'undo_grade_v2'].includes(fn.proname))
    }
    assert.equal((await row('profiles', newOwner)).length, 0)
    assert.equal((await row('cards', f.owner)).length, 0)
  })
  await check('pre-migration log cannot be reused as a new v2 operation', async f => {
    const i = await intent(f)
    await db.query(`insert into public.review_logs(user_id,vocab_id,grade,client_op_id)
      values($1,$2,$3,$4)`, [f.owner, f.vocab[0], i.log.grade, i.opId])
    await rejectsCode(() => grade(i), '40001')
    assert.equal((await row('cards', f.owner)).length, 0)
    assert.equal((await row('grade_operations', f.owner)).length, 0)
    assert.equal((await row('review_logs', f.owner)).length, 1)
  })
  await check('story reward wrapper binds queued owner and preserves claim idempotency', async f => {
    const other = await fixture()
    const claimSql = 'select public.claim_story_reward_v2($1,$2,$3::date,$4,$5) as result'
    const args = ['chinese', 'hsk_3', '2026-09-28', null, f.owner]
    await rejectsCode(() => as(other.owner, claimSql, args), '42501')
    await rejectsCode(() => as('', claimSql, args, 'anon'), '42501')
    await rejectsCode(() => as(f.owner, claimSql, [...args.slice(0, 4), null]), '42501')
    assert.equal((await row('story_reward_claims', f.owner)).length, 0)
    assert.equal((await row('story_reward_claims', other.owner)).length, 0)
    const first = (await as(f.owner, claimSql, args)).rows[0].result
    const duplicate = (await as(f.owner, claimSql, args)).rows[0].result
    assert.deepEqual(duplicate, first)
    assert.equal(first.redeemed, false)
    assert.equal((await row('story_reward_claims', f.owner)).length, 1)
    assert.equal((await row('story_reward_claims', other.owner)).length, 0)
  })
  await check('both reset aliases clear latest story rewards and active series only for owner', async f => {
    const other = await fixture()
    const story = randomUUID()
    await db.query(`insert into public.stories(id,language,system,level,story_number,title,content,is_published)
      values($1,'chinese','hsk_3',1,1,'A real fixture story','你好',true)`, [story])
    const claimSql = "select public.claim_story_reward_v2('chinese','hsk_3','2026-09-28',$1,$2)"
    await as(other.owner, claimSql, [story, other.owner])
    await db.query("update public.language_tracks set active_series='fixture-series' where user_id=$1", [other.owner])
    for (const rpc of ['reset_language_progress', 'reset_current_language_progress']) {
      await as(f.owner, claimSql, [story, f.owner])
      await db.query("update public.language_tracks set active_series='fixture-series' where user_id=$1", [f.owner])
      assert.equal((await row('story_unlocks', f.owner)).length, 1)
      assert.equal((await row('story_reward_claims', f.owner)).length, 1)
      await as(f.owner, `select public.${rpc}('chinese','hsk_3',false)`)
      assert.equal((await row('story_unlocks', f.owner)).length, 0)
      assert.equal((await row('story_reward_claims', f.owner)).length, 0)
      assert.equal((await row('language_tracks', f.owner))[0].active_series, null)
      assert.equal((await row('story_unlocks', other.owner)).length, 1)
      assert.equal((await row('story_reward_claims', other.owner)).length, 1)
      assert.equal((await row('language_tracks', other.owner))[0].active_series, 'fixture-series')
    }
    assert.equal(Number((await row('profiles', f.owner))[0].review_generation), 2)
  })
  await check('account deletion cascades owned receipts while reset does not', async f => {
    await grade(await intent(f))
    await db.query('delete from auth.users where id=$1', [f.owner])
    assert.equal((await row('grade_operations', f.owner)).length, 0)
  })
  console.log(JSON.stringify({ engine: 'PGlite 0.5.8 (single connection)', migration: migrationPath,
    postgres: (await db.query('select version() as version')).rows[0].version,
    capturedAt: new Date().toISOString(),
    migrationSha256: createHash('sha256').update(migration).digest('hex'),
    producerSha256: createHash('sha256').update(await readFile(sourcePath)).digest('hex'),
    schedulerSha256: createHash('sha256').update(await readFile('src/srs.js')).digest('hex'),
    producer: sourcePath, tests: count, passed: count, results,
    limitations: ['No live Supabase apply', 'No separate-connection advisory-lock/concurrency proof', 'No installed native/offline lifecycle proof'] }, null, 2))
} finally {
  await vite.close()
  await db.close()
}
