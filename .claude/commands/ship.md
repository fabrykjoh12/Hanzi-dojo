Verify the build and ship the current changes to GitHub.

Steps, in order:
1. Run npm run build and show me the full output.
2. If the build FAILS, stop. Do not commit. Show me the errors and fix them first.
3. If the build PASSES, ask me for a short commit message (or suggest one based on what changed).
4. Then run: git add . && git commit -m "MESSAGE" && git push
5. Confirm the push succeeded.

Rules:
- Never commit without a passing build first.
- Keep the commit message short and specific.
- If there are no changes to commit, tell me instead of running an empty commit.
- After shipping, remind me to update CLAUDE.md if a feature was added or an issue fixed.
