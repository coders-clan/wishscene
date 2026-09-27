# Contributing to wishscene

Start with [Developer setup](docs/DEVELOPMENT.md), the [stack](docs/STACK.md), and the [open issues](https://github.com/coders-clan/wishscene/issues).

1. Pick an unassigned, unblocked issue. Coordinate ownership in that issue.
2. Create a feature branch from `main`.
3. Use the [Hunch workflow](docs/HUNCH.md) to retrieve relevant context and record decisions.
4. Keep the no-credentials mock environment working. Add behavior checks when changing domain rules or API contracts.
5. Run `pnpm check`. For flow changes, run the HTTP and browser journeys described in the developer guide.
6. Open a PR and link the issue. Attach visual evidence for UI work and explain remaining limitations.

`main` requires a pull request; direct pushes, deletion and force pushes are blocked. The CI workflow checks the scaffold and browser journeys. No real personal photos, provider credentials or private memory overlays belong in the repo.
