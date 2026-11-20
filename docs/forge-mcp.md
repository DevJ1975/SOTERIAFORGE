# Forge MCP server (Claude, ChatGPT)

The Forge API serves a remote [MCP](https://modelcontextprotocol.io) server at
`https://<api host>/mcp`. Add it to Claude or ChatGPT as a custom connector and
the assistant can author courseware (courses, quizzes, card games, media), read an
organization's members and audit log, and (for platform admins) check deployments
and propose releases and code changes, all as the signed-in user.

This is separate from the in-browser WebMCP tools in Forge admin
(`docs/webmcp.md`), which only work inside an open admin page.

Code: `backend/apps/mcp/` (server, sign-in, tools), `backend/forge/asgi.py`
(routing). The tools validate input with the same serializers as the REST API
(`apps/learning`, `apps/assessments`, `apps/games`, `apps/assets`).

## Connect

Staging URL: `https://api-staging-12cc.up.railway.app/mcp`

- **Claude** (claude.ai, Desktop): Settings → Connectors → Add custom connector →
  paste the URL → Connect. **Claude Code:** `claude mcp add --transport http forge <URL>`,
  then `/mcp` to sign in.
- **ChatGPT**: Settings → Apps & Connectors → Advanced → turn on Developer mode →
  Create → paste the URL, authentication **OAuth**.

The connector opens the Forge sign-in page. Enter your **organization ID** (e.g.
`lakewood`; blank for platform admins), sign in, and approve. The grant is tied to
that one membership; to act in another organization, connect again.

## How sign-in works

1. The client reads `/.well-known/oauth-protected-resource/mcp` (served by the MCP
   app) and `/.well-known/oauth-authorization-server` (django-oauth-toolkit).
2. It registers itself: dynamic client registration (`/oauth/register/`, used by
   ChatGPT) or a client ID metadata document (Claude). **Only redirect URIs on
   `claude.ai`, `claude.com`, `chatgpt.com`, `chat.openai.com` (https) or loopback
   (http, for desktop clients) are accepted** (`MCP_REDIRECT_HOSTS`), and only the
   authorization-code grant.
3. `/oauth/authorize/` (PKCE S256 required) sends the browser to `/oauth/login/`,
   which checks the email and password exactly like `/api/auth/login` (same
   lockout after repeated failures). The consent page shows the account, role and
   organization the app will act as.
4. `/oauth/token/` issues a 1-hour access token and a 30-day rotating refresh
   token; a replayed refresh token revokes the whole family. Tokens are stored
   only as SHA-256 hashes.

Each OAuth grant belongs to a shadow Django user `mcp:<member id>:<tenant id>`.
**Every tool call re-reads the member and tenant**, so deactivating someone,
changing their role or suspending the tenant takes effect on the next call. To
cut off an app entirely, delete its tokens in Django admin (OAuth2 Provider →
Access tokens).

## Tools

Every write runs in one transaction, with the tenant set for row-level security,
and is written to the audit log. Unknown arguments are rejected, so an
assistant can't believe it changed something it didn't.

| Tool                                                | Who               | Notes                                                        |
| --------------------------------------------------- | ----------------- | ------------------------------------------------------------ |
| `forge_list_courses`, `forge_get_course`            | instructor, admin | Full tree: modules → lessons → key points, tags, transcript  |
| `forge_list_framework_tags`                         | instructor, admin | Standards in use, e.g. `OSHA 1910.147`                       |
| `forge_create_course_draft`                         | instructor, admin | Always `draft`                                               |
| `forge_update_course`                               | instructor, admin | No status changes                                            |
| `forge_add_module` / `_update_` / `_reorder_`       | instructor, admin | Live if the course is published                              |
| `forge_add_lesson` / `_update_` / `_reorder_`       | instructor, admin | Asset or https URL, key points, tags, transcript, quiz       |
| `forge_remove_module`, `forge_remove_lesson`        | instructor, admin | **Draft courses only**                                       |
| `forge_list_quizzes`, `forge_get_quiz`              | instructor, admin | Includes the answer key                                      |
| `forge_create_quiz`, `forge_update_quiz`            | instructor, admin | Must be answerable; no edits once a published course uses it |
| `forge_list_games`, `forge_get_game`                | instructor, admin |                                                              |
| `forge_create_game`, `forge_update_game`            | instructor, admin | Four card-game kinds, same rules as `validateCardGameConfig` |
| `forge_list_assets`                                 | instructor, admin | Files in the private bucket                                  |
| `forge_import_media`                                | instructor, admin | Server-side fetch from an allowlisted host; see below        |
| `forge_get_organization`                            | tenant admin      | Read-only                                                    |
| `forge_list_members`                                | tenant admin      | Read-only                                                    |
| `forge_audit_log`                                   | tenant admin      | This organization only                                       |
| `forge_deploy_status`, `forge_deploy_logs`          | platform admin    | The API service on Railway                                   |
| `forge_redeploy`                                    | platform admin    | Production needs `confirm=true`                              |
| `forge_open_release_pr`                             | platform admin    | PR staging branch → `main`; a person merges                  |
| `forge_code_read`                                   | platform admin    | Files and directories on GitHub                              |
| `forge_code_propose_change`                         | platform admin    | New `mcp/...` branch + PR; never merges                      |
| `forge_code_list_proposals`, `forge_code_pr_status` | platform admin    | Open proposals; mergeability and CI checks                   |

### Media import

`forge_import_media(url)` copies a generated file (for example an ElevenLabs result)
into the private bucket and returns an `assetRef` for a lesson. The URL comes from a
model, so the fetch is locked down (`backend/apps/assets/importer.py`):

- https only, default port, no credentials in the URL;
- the host must be listed in `MCP_MEDIA_IMPORT_HOSTS` (empty = the tool is off);
- every address the host resolves to must be public, and the connection goes to
  the checked address, so a second DNS answer can't redirect it inwards;
- redirects are not followed; 100 MB limit; the same file-type rules as an upload
  (no HTML, SVG or scripts).

### Guardrails that are deliberate

- **No publish, unpublish, archive or course delete.** A person does those in
  Forge admin (same rule as the WebMCP tools). New courses are always drafts.
- **A quiz or game that a published course uses can't be changed here**, because
  that would change what enrolled learners are graded on without anyone reviewing it.
- **Member changes stay in the admin app** (invite, role, deactivate), where the
  invite email and session revocation are handled.
- **Production only changes by a reviewed merge.** Release and code tools open
  pull requests; nothing pushes to an existing branch or merges. Code proposals
  can't touch `.github/`, `.railway/`, `.env*` or key files, because a PR branch
  in this repo runs CI with its secrets.
- **Tool output is data.** Course text, file contents and logs are written by
  people; the server instructions tell the model not to follow instructions in
  them. This lowers, not removes, prompt-injection risk, which is why
  consequential steps stay with people.

## Configuration (API service variables)

| Variable                                                         | Needed for                 | Notes                                                                                           |
| ---------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| `FORGE_PUBLIC_URL`                                               | OAuth issuer, resource URL | Defaults to `https://$RAILWAY_PUBLIC_DOMAIN`; set it when a custom domain is primary            |
| `MCP_REDIRECT_HOSTS`                                             | Client registration        | Comma-separated https hosts                                                                     |
| `MCP_MEDIA_IMPORT_HOSTS`                                         | `forge_import_media`       | Comma-separated hosts (`.example.com` = its subdomains). Empty turns the tool off               |
| `STANDARDS_S3_*`                                                 | `forge_import_media`       | The private bucket uploads already use                                                          |
| `RAILWAY_API_TOKEN`                                              | Release tools              | Account or workspace token with access to the project                                           |
| `GITHUB_TOKEN`                                                   | Release PRs, code tools    | Fine-grained, this repo only: Contents + Pull requests read/write. **No Workflows permission.** |
| `GITHUB_REPO`, `FORGE_STAGING_BRANCH`, `FORGE_PRODUCTION_BRANCH` | Code/release               | Default `DevJ1975/SOTERIAFORGE`, `feat/angular-22-upgrade`, `main`                              |

Without `RAILWAY_API_TOKEN` or `GITHUB_TOKEN` the platform tools return a clear
"tools are off" error; everything else works.

After deploying, run `manage.py migrate` and `manage.py ensure_app_role` (the
pre-deploy step already does) so the runtime role can use the new OAuth tables.

## Not yet

- **Member administration tools** (invite, change role, deactivate). The earlier
  Firebase-based versions were not ported; use the admin app.
- **Direct file upload from the assistant.** Files arrive by `forge_import_media`
  or through the admin app's upload.
- **Frontend deploys** (Vercel) aren't covered by the release tools; they act on
  the API service.
