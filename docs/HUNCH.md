# Hunch in wishscene

Hunch is pinned to **@davesheffer/hunch 1.42.0**. We use it to retain engineering decisions and track observed checks, alongside the normal source, tests, and PR review.

## First use

`pnpm install` installs the CLI. `.mcp.json` and assistant-specific configs point to the same exact version. Supporting tools may need a restart before exposing Hunch MCP. Automatic assistant lifecycle hooks were **not installed** for this scaffold; do not assume context injection or enforcement is active. Committed project memory is advisory.

```sh
pnpm hunch doctor
pnpm hunch task start "Short task title"
# Copy the returned task ID, then:
pnpm hunch context packages/domain/src/index.ts --profile builder --task TASK_ID
pnpm hunch escalations
pnpm hunch findings
```

Follow the generated `AGENTS.md` guidance with MCP when available, or use CLI equivalents. Reuse one task ID throughout the work. If an actual escalation exists, resolve it with its owner; a clean Hunch check is not permission to bypass project PR rules.

## While working

```sh
pnpm hunch why packages/domain/src/index.ts
pnpm hunch capture-comments
pnpm hunch index --no-auto-commit
pnpm hunch impact origin/main
pnpm hunch check --working
pnpm hunch task verify TASK_ID --label "Quality checks" -- pnpm check
pnpm hunch task verify TASK_ID --label "HTTP smoke" -- pnpm test:smoke
pnpm hunch task finish TASK_ID
```

Use `hunch-why:` comments for scoped design rationale and `hunch-rule:` for invariants, then capture them. Review resulting records in the PR. Task histories and verification receipts are local Hunch state, not claims that tests passed in another machine or that a provider's output quality has been measured. Show the returned contribution card when finishing a Hunch-assisted task.

The scaffold was implemented with explicit Hunch task/context calls and checks through its verification launcher. Initial context was empty because this was the first code implementation. Hunch's own index must be refreshed as code evolves. The generated instruction blocks belong to Hunch; use `pnpm hunch grounding --refresh` to update them.

Do not commit local SQLite caches, private overlays, user images, API keys, or machine-specific paths. Do not turn on automatic commits or restrictive policies as an incidental setup step. Feature work reaches `main` through PRs.
