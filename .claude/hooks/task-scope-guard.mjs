#!/usr/bin/env node
/**
 * THE PreToolUse ADAPTER — protected control plane, Tier 1.
 *
 * Deliberately thin, and deliberately dull. It reads the hook event from stdin,
 * hands it to the policy, and turns the answer into the shape Claude Code
 * expects. It holds no authorization logic of its own: every rule about who may
 * write what lives in `task-scope-policy.mjs`, so there is exactly one place to
 * read, review and test the decision.
 *
 * NOT REGISTERED. Nothing invokes this file today — registering it in
 * `.claude/settings.json` is a separate task under a different grant. Until then
 * this is inert code with proofs attached, and no claim is made that Tier 0 is
 * enforced at runtime.
 *
 * FAIL CLOSED, INCLUDING BEFORE THE POLICY EXISTS. Unreadable stdin,
 * unparseable JSON, a policy module that will not load, an exception inside the
 * policy, and a policy that returns nothing recognisable all produce a deny. A
 * guard that allows when it breaks is not a guard — and the cost of that choice
 * is a stuck producer, which is loud, rather than an unauthorized write, which
 * is silent.
 */

import process from 'node:process'

/**
 * The policy is loaded INSIDE the caught path, not as a top-level import.
 *
 * A static `import { decide } from './task-scope-policy.mjs'` runs before any
 * of this file's code exists, so a missing or unparseable policy module throws
 * where no catch can reach it: Node exits non-zero, and only exit code 2 blocks
 * a PreToolUse call — every other non-zero exit is non-blocking and the write
 * proceeds. The one failure this file's header calls impossible would have been
 * the one that failed open. Now it denies like anything else.
 */
async function loadPolicy() {
  const mod = await import('./task-scope-policy.mjs')
  if (typeof mod.decide !== 'function') throw new Error('the policy module exports no decide()')
  return mod.decide
}

/**
 * The PreToolUse deny shape.
 *
 * Exits by SETTING exitCode and letting the event loop drain, never by calling
 * process.exit(). stdout to a pipe is asynchronous in Node, and process.exit
 * does not flush a pending write — so a truncated or lost payload would reach
 * Claude Code as "exit 0, no decision", which is precisely the allow path. A
 * guard whose failure mode is an allow is not a guard, and this one is small
 * enough that the bug would almost never show up in testing and would matter
 * every time it did.
 */
function emitDeny(reason) {
  process.exitCode = 0
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'task-scope-guard: ' + reason,
    },
  }))
}

/** Silence is the allow. Emitting no decision leaves the normal flow alone. */
function emitAllow() {
  process.exitCode = 0
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function main() {
  let decide
  try {
    decide = await loadPolicy()
  } catch (err) {
    emitDeny('the policy module could not be loaded: ' + (err?.message || String(err)))
    return
  }

  let event
  try {
    const raw = await readStdin()
    event = JSON.parse(raw)
  } catch {
    // No event means no way to tell whose call this is or what it touches.
    emitDeny('the hook event could not be read or parsed')
    return
  }

  let verdict
  try {
    verdict = decide(event, {
      root: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      env: process.env,
    })
  } catch (err) {
    emitDeny('the policy threw while deciding: ' + (err?.message || String(err)))
    return
  }

  if (verdict && verdict.allow === true) emitAllow()
  else emitDeny(verdict?.reason || 'the policy returned no decision')
}

main().catch((err) => {
  emitDeny('the guard threw while deciding: ' + (err?.message || String(err)))
})
