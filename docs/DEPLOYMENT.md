# Deploy wishscene with Neon and Vercel

This deploys the **developer demo**, including shared feedback. GitHub sign-in identifies feedback contributors, but it is not the product ownership/auth model. Face uploads, image-provider calls and video rendering remain disabled. Neon supplies durable Postgres state; Vercel serves Next.js. Render can use the same Postgres adapter.

## Vercel setup

1. Import `coders-clan/wishscene` into the intended Vercel account/team. Production branch: `main`. Use GitHub integration so PRs receive previews.
2. Set **Root Directory: `apps/web`**, **Framework: Next.js**, **Node: 24.x**. Allow files outside the root directory (workspace packages are in `../../packages`). `apps/web/vercel.json` explicitly runs pnpm 11.25.0 through npx for install/build; it does not rely on Vercel’s older default pnpm detection. Do not select a static export or set an output directory manually.
3. Create a dedicated **Neon Postgres project/database for wishscene** in a region close to the Vercel functions. Use the pooled connection string with TLS and certificate verification enabled. Keep credentials server-side.
4. Add the following environment variables to the appropriate deployment environments:

| Variable                         | Value                                                             |
| -------------------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`                   | Neon pooled Postgres connection string (secret)                   |
| `WISHSCENE_MOCK`                 | `1`                                                               |
| `WISHSCENE_FEEDBACK`             | `1`                                                               |
| `WISHSCENE_GITHUB_CLIENT_ID`     | GitHub OAuth App client ID                                        |
| `WISHSCENE_GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret (secret)                           |
| `WISHSCENE_SESSION_SECRET`       | Random string, 32+ chars, e.g. `openssl rand -base64 48` (secret) |

`WISHSCENE_DATABASE_URL` overrides `DATABASE_URL`; the default lets the Neon/Vercel integration work directly. `WISHSCENE_FEEDBACK_DATABASE_URL` is optional when feedback needs a separate database. Do not use `NEXT_PUBLIC_` for connection strings. Never paste database credentials into issues, PRs, screenshots, chat, or repository files.

5. Use a separate Neon branch/database for preview deployments so PR testing does not mutate production demo data. Configure its URL in Preview, and the main Neon branch URL in Production. Do not share a production database with untrusted PR code.
6. Deploy. The application creates the three additive tables at first use: `wishscene_demo_workspaces`, `wishscene_feedback`, `wishscene_feedback_limits`. The role needs CREATE for initial setup; provision tables ahead of time if your database policy requires a restricted runtime role.
7. Verify: load the studio without signing in; edit and save a social caption; reload; open the feedback board signed out; then sign in with GitHub, submit feedback, reply and vote. Confirm only the creating account can edit that report's status, priority or assignee, while another signed-in account can still reply and vote. Confirm a signed-out browser can read the shared result but cannot write. Redeploy and confirm the saved caption and feedback remain. Inspect Vercel build/runtime logs if the API reports a storage setup error.

## GitHub sign-in

The studio and feedback board remain publicly readable. Adding feedback, replying and voting require GitHub sign-in. Only the report creator can change status, priority or assignee. Any GitHub account may sign in — this proves identity, not team membership; it is not an org or allowlist check and it does not make anonymous demo workspaces into cross-device accounts.

1. Create a GitHub OAuth App: GitHub → Settings → Developer settings → OAuth Apps (or the org's own settings, if this deployment should only be usable by an org's members using their GitHub accounts).
2. Homepage URL: `https://project-rxuus.vercel.app`. Authorization callback URL: `https://project-rxuus.vercel.app/api/auth/github/callback`.
3. Set `WISHSCENE_GITHUB_CLIENT_ID`, `WISHSCENE_GITHUB_CLIENT_SECRET` and `WISHSCENE_SESSION_SECRET` (see the table above) on Production. Preview deployments need the same variables and stay behind Vercel Deployment Protection in addition to GitHub sign-in.
4. On Vercel and Render, feedback writes and sign-in fail closed (503, "Sign-in is not configured.") if these variables are missing. Public studio and feedback reads continue to work; deployed feedback never silently falls back to unverified display names.
5. Rotating `WISHSCENE_SESSION_SECRET` invalidates every signed-in session; everyone is signed out and must sign in again.
6. Local development keeps sign-in off (open access, today's behavior) unless `WISHSCENE_GITHUB_CLIENT_ID` is set. Use a separate OAuth App for local testing with callback URL `http://localhost:3000/api/auth/github/callback`.

## What is durable

Each browser's demo workspace uses an opaque HttpOnly cookie. With Postgres, workspaces are stored for **30 days of inactivity**, then replaced by seeded data on the next request. A transaction locks the session row, restores the domain state, applies the action, saves the new state and commits. Approvals and story/social revision checks remain intact across concurrent Vercel instances. The JSON workspace schema is versioned; incompatible versions fail explicitly rather than silently resetting.

Jobs remain simulated and advance on reads. No Redis worker is introduced here. Clearing browser cookies loses access to that browser's previous anonymous workspace; this is not account login or cross-device recovery. Feedback is deployment-wide and independent of workspace expiry/reset. It has no automatic expiry in this version.

Local development without a database preserves the existing one-hour in-memory workspace and SQLite feedback; no credentials or Docker required. On Vercel both services fail clearly if database configuration is missing, instead of pretending an in-memory fallback is durable.

## Existing Render demo

Set the same three variables and redeploy to use Neon on Render. Existing in-memory workspaces cannot be migrated automatically after their process exits; export any demo pack you want before switching. Feedback saved in a local SQLite file is not automatically copied into Postgres. Back up that file before switching stores and use an explicit migration if it contains real reports.

Alternatively, Render can retain only feedback on an attached persistent disk with `WISHSCENE_FEEDBACK_DB=/YOUR_MOUNT/wishscene.feedback.sqlite`. Studio workspace state is still volatile unless `DATABASE_URL` is configured. Do not point SQLite into the ordinary ephemeral filesystem for durable team feedback.

## Operations and rollback

- Keep the database independent of the deployment. Rolling the application back must not delete tables or reset the Neon branch.
- This change is additive and table names are scoped to wishscene. Future workspace/report schema changes require a reviewed forward migration and compatible rollback strategy.
- Set database backups/retention through the chosen Neon plan; connection success is not proof of backup coverage.
- App-level caps: 1,000 durable demo sessions; 1,000 feedback reports. Review database size and close/archive old reports through a deliberate maintenance change; do not silently purge feedback.
- On Vercel/Render, author names are GitHub logins, votes are per GitHub account, and creator ownership is bound to the immutable numeric GitHub account ID. Local keyless development retains display names and a per-browser creator identity for convenience. Put confidential developer work behind deployment access controls either way — GitHub sign-in proves identity, not team membership, and signed-out visitors can read the board.
- Future generation/video workers stay separate from Next.js request handlers. This deployment does not change that boundary.

## References

- Vercel monorepos: https://vercel.com/docs/monorepos
- Neon integration: https://vercel.com/marketplace/neon/neon
- Vercel persistent state guidance: https://vercel.com/docs/frameworks/backend
- Render persistent disk behavior: https://render.com/docs/disks
