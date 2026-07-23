# Dojo HQ ↔ Claude Code

Dojo HQ can use a local loopback bridge to synchronize its task list with
`ROADMAP.md` or `TASKS.md`, then open one selected task in Claude Code.

## Start

From the repository root:

```powershell
npm run dojo
```

This starts both the HQ development site and the bridge. Open:

```text
http://127.0.0.1:5176/hq.html
```

If the site is already running, start only the bridge:

```powershell
npm run dojo:bridge
```

## Workflow

1. Open **Claude** in the HQ top bar.
2. Choose `ROADMAP.md` or `TASKS.md`.
3. Select **Skriv HQ til planen**. Only the block between
   `DOJO-HQ:START` and `DOJO-HQ:END` is replaced.
4. Open a task and select **Åpne oppgaven**.
5. Claude Code opens in a new terminal, reads the plan, and works with manual
   permission prompts.
6. When Claude checks an item in the managed Markdown block, select
   **Hent ferdig-status** to mark it complete in HQ.

## Safety boundaries

- The bridge listens only on `127.0.0.1`.
- Only local browser origins are allowed.
- Only `ROADMAP.md` and `TASKS.md` can be read or written.
- The browser sends structured task data, never a shell command.
- Claude starts in manual permission mode.
- Its task prompt forbids commit, push, deployment, unrelated deletion, and
  permission bypass.
- The generated one-task prompt is stored under ignored `.dojo/`.
