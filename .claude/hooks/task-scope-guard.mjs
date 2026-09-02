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
 * FAIL CLOSED. Unreadable stdin, unparseable JSON, or an exception anywhere in
 * the policy all produce a deny. A guard that allows when it breaks is not a
 * guard — and the cost of that choice is a stuck producer, which is loud, rather
 * than an unauthorized write, which is silent.
 */

import process from 'node:process'
import { decide } from './task-scope-policy.mjs'

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
  let event
  try {
    const raw = await readStdin()
    event = JSON.parse(raw)
  } catch {
    // No event means no way to tell whose call this is or what it touches.
    emitDeny('the hook event could not be read or parsed')
    return
  }

  const verdict = decide(event, {
    root: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    env: process.env,
  })

  if (verdict.allow) emitAllow()
  else emitDeny(verdict.reason)
}

main().catch((err) => {
  emitDeny('the guard threw while deciding: ' + (err?.message || String(err)))
})
