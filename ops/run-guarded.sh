#!/usr/bin/env bash
# run-guarded.sh — run a command that touches production, and let its output
# reach a PUBLIC Actions log only after the leak guard has cleared it.
#
#   ops/run-guarded.sh <logfile> -- <command> [args...]
#
# Hanzi-dojo's repository is public, so job logs are readable by anyone on the
# internet and a leaked identifier cannot be un-published. The unsafe pattern is
#
#     node migrate-legacy-claims.mjs --redact | tee out.log
#
# because `tee` streams to the log as the command runs: by the time any scanner
# looks, the damage is done. One unhandled exception, one Postgres error string
# echoing a row, one future console.log, and a real UUID is public.
#
# So: capture everything first, scan, and only then print.
#
# On a guard failure the raw log is DESTROYED immediately, before this script
# returns. That is deliberate — it means no later step can upload, summarize or
# cat it even by mistake, because there is nothing left to read.
#
# Exit status is the command's own status when the guard passes, so a failing
# migration still fails the job.

set -uo pipefail

LOGFILE="${1:?usage: run-guarded.sh <logfile> -- <command...>}"
shift
if [ "${1:-}" = "--" ]; then shift; fi
if [ "$#" -eq 0 ]; then
  echo "::error::run-guarded.sh: no command given" >&2
  exit 2
fi

GUARD="${LEAK_GUARD:-${GITHUB_WORKSPACE:-.}/ops/leakGuard.mjs}"
if [ ! -s "$GUARD" ]; then
  echo "::error::leak guard not found at $GUARD — refusing to run a production command unguarded" >&2
  exit 2
fi

mkdir -p "$(dirname "$LOGFILE")"

# Everything — stdout and stderr — into the file. Nothing on the console yet.
"$@" > "$LOGFILE" 2>&1
CMD_STATUS=$?

if ! node "$GUARD" "$LOGFILE"; then
  # Destroy it before anything else can touch it.
  shred -u "$LOGFILE" 2>/dev/null || rm -f "$LOGFILE"
  echo "::error::Sensitive-looking output detected; raw log withheld" >&2
  echo "::error::The command's output was destroyed rather than printed. Re-run" >&2
  echo "::error::locally with the same flags to see it." >&2
  exit 1
fi

# Cleared. Safe to show.
cat "$LOGFILE"
exit $CMD_STATUS
