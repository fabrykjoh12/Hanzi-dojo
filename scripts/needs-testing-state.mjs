// The Discord thread-id map for #needs-testing — merge and validation.
//
// WHY THIS EXISTS AS A SEPARATE THING
//
// needs-testing-sync.yml has to remember which Discord forum thread belongs to
// which TESTING.md item, or every run would post duplicate threads. That map is
// mutable automation state: it changes without anyone editing the repository,
// and it changes on a schedule nobody controls.
//
// It used to be committed to `main` with `git push origin HEAD:main` — the last
// workflow write-path into the canonical branch, and the one thing standing
// between this repository and a ruleset that forbids direct pushes to `main`.
//
// So the map moved to its own orphan branch, and the two kinds of data are now
// separated by which ref they live on:
//
//   main                              canonical: docs/TESTING.md, this script
//   automation/needs-testing-state    mutable: the id map, and nothing else
//
// Nothing reads source from the state branch and nothing writes source to it.
// The workflow builds that branch's tree with `git mktree` from exactly one
// blob, so "only automation state" is structural rather than a rule someone
// has to remember.
//
// CONCURRENCY
//
// Two runs can race: both read the map, both create threads for different new
// items, both try to push. A blind overwrite would lose one run's threads and
// leak orphaned Discord threads that nothing points at any more. So the push is
// compare-and-swap — on rejection the workflow re-reads the remote map, merges
// through `mergeIdMaps` below, and retries. Never force-push: the losing side
// has real thread ids in it.

/** A Discord snowflake: 17–20 digits. */
const SNOWFLAKE = /^[0-9]{17,20}$/

export function isValidRecord(rec) {
  return !!rec &&
    typeof rec === 'object' &&
    !Array.isArray(rec) &&
    SNOWFLAKE.test(String(rec.messageId ?? '')) &&
    SNOWFLAKE.test(String(rec.threadId ?? ''))
}

/**
 * Parse an id map, rejecting anything malformed.
 *
 * Loud rather than lenient: a corrupted map that silently parses to `{}` would
 * make the next run re-post every thread, which is spam that cannot be undone.
 */
export function parseIdMap(text, label = 'id map') {
  let data
  try {
    data = JSON.parse(text || '{}')
  } catch (err) {
    throw new Error(label + ' is not valid JSON: ' + err.message)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(label + ' must be a JSON object of { itemId: {messageId, threadId} }')
  }
  const bad = Object.entries(data).filter(([, rec]) => !isValidRecord(rec)).map(([id]) => id)
  if (bad.length) {
    throw new Error(label + ' has malformed entries: ' + bad.join(', ') +
      ' — every entry needs a snowflake messageId and threadId')
  }
  return data
}

/**
 * Merge the remote map with what this run produced.
 *
 * REMOTE WINS for any id both sides know. That direction is deliberate: a
 * record on the state branch means a thread already exists in Discord, and
 * overwriting it with a locally-created one would abandon the original thread
 * along with whatever testers had already replied to it. Local only ever
 * CONTRIBUTES ids the remote has never seen.
 *
 * Keys are sorted so the committed file is a function of its content alone —
 * two runs that reach the same state produce the same blob, and the diff shows
 * only what actually changed.
 */
export function mergeIdMaps(remote, local) {
  const merged = {}
  for (const key of [...new Set([...Object.keys(remote || {}), ...Object.keys(local || {})])].sort()) {
    const pick = (remote && remote[key]) || (local && local[key])
    merged[key] = { messageId: String(pick.messageId), threadId: String(pick.threadId) }
  }
  return merged
}

export function serializeIdMap(map) {
  return JSON.stringify(map, null, 2) + '\n'
}

// CLI: merge <remote.json> <local.json> <out.json>
// Used by needs-testing-sync.yml between a rejected push and its retry.
if (process.argv[1] && process.argv[1].endsWith('needs-testing-state.mjs')) {
  const { readFile, writeFile } = await import('node:fs/promises')
  const [cmd, remotePath, localPath, outPath] = process.argv.slice(2)
  if (cmd !== 'merge' || !remotePath || !localPath || !outPath) {
    process.stderr.write('usage: needs-testing-state.mjs merge <remote.json> <local.json> <out.json>\n')
    process.exit(2)
  }
  const read = async (p) => parseIdMap(await readFile(p, 'utf8').catch(() => '{}'), p)
  const merged = mergeIdMaps(await read(remotePath), await read(localPath))
  await writeFile(outPath, serializeIdMap(merged))
  process.stdout.write('merged id map: ' + Object.keys(merged).length + ' entries\n')
}
