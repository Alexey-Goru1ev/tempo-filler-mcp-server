# Tempo Filler MCP Server (Atlassian Cloud Fork)

Fork of [TRANZACT/tempo-filler-mcp-server](https://github.com/TRANZACT/tempo-filler-mcp-server) with full **Atlassian Cloud support** for [Tempo Timesheets](https://marketplace.atlassian.com/apps/6572/tempo-timesheets) — a time-tracking Jira application.

The upstream version only supports Jira Server/Data Center deployments. This fork adds automatic detection and routing for **Atlassian Cloud** instances where Tempo operates as a Jira Cloud app with its own REST API at `api.tempo.io`, separate from the Jira REST API.

## Why This Fork Exists

Tempo Timesheets on Atlassian Cloud is a **Jira Cloud application** with its own separate REST API (`api.tempo.io`). This creates several incompatibilities that the upstream server doesn't handle:

1. **Separate API surface** — Cloud uses Tempo REST API v4 (`/4/worklogs`, `/4/user-schedule`), not the legacy Server/DC Jira paths (`/rest/tempo-timesheets/4/`, `/rest/tempo-core/2/`).
2. **Separate authentication** — Tempo Cloud PATs can't call Jira REST APIs, and vice versa. This fork introduces `TEMPO_ACCOUNT_ID` for direct user identification.
3. **Numeric issue IDs required** — Cloud `POST /4/worklogs` requires a numeric `issueId`, not a Jira issue key like `PROJ-1234`. This fork adds **Jira Cloud REST API integration** to resolve issue keys automatically.
4. **Different payload formats** — Cloud requires `issueId` (numeric) + `authorAccountId`, not the legacy `originTaskId` + `worker` fields.

### Changes from Upstream

| File | What Changed |
|------|-------------|
| `src/tempo-client.ts` | Cloud API routing, `TEMPO_ACCOUNT_ID` support, Jira Cloud REST API client for issue key → numeric ID resolution, dual-format issue cache |
| `src/index.ts` | Reads and passes Jira Cloud API credentials (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) |
| `src/types/mcp.ts` | Added `TEMPO_ACCOUNT_ID` and Jira API env var constants |
| `src/types/tempo.ts` | Added `TempoV4WorklogCreatePayload` interface, optional Jira config fields on `TempoClientConfig` |

**Backward compatibility**: Fully preserved. Existing Server/DC setups continue to work unchanged — routing is automatic based on `TEMPO_BASE_URL`.

## How It Works

### Architecture

```
MCP Client (Claude Code, VS Code, etc.)
    |
    v
index.ts (StdioServerTransport)
    |
    v
Tool Handler (get_worklogs, post_worklog, etc.)
    |
    v
TempoClient
    |
    +-- isTempoCloudApi()? ------+
    |                            |
    v                            v
  Cloud (api.tempo.io)        Server/DC (jira.example.com)
  GET /4/worklogs/...         POST /rest/tempo-timesheets/4/...
  GET /4/user-schedule/       POST /rest/tempo-core/2/...
  POST /4/worklogs            POST /rest/tempo-timesheets/4/worklogs/
  DELETE /4/worklogs/{id}     DELETE /rest/tempo-timesheets/4/worklogs/{id}
    |
    v (issue key resolution)
  Jira Cloud REST API (your-site.atlassian.net)
  GET /rest/api/3/issue/{key} → numeric issueId
```

### API Routing

The server detects the deployment type from `TEMPO_BASE_URL`:

- **Cloud**: URL contains `api.tempo.io` — uses Tempo REST API v4 endpoints
- **Server/DC**: Any other URL — uses legacy Tempo endpoints via Jira base URL

### Authentication Flow

**Cloud:**
1. Uses `TEMPO_ACCOUNT_ID` environment variable (your Jira account ID)
2. Authenticates with `Authorization: Bearer {TEMPO_PAT}` against `api.tempo.io`

**Server/DC:**
1. Calls `GET /rest/api/latest/myself` on Jira to resolve current user
2. Caches the result for all subsequent API calls
3. Authenticates with `Authorization: Bearer {TEMPO_PAT}` against Jira instance

### Issue Key Resolution (Cloud)

Tempo Cloud's `POST /4/worklogs` requires a numeric `issueId` — it does not accept Jira issue keys like `DVPSS-3513`. Since Tempo PATs can't call the Jira REST API, a separate Jira API integration is needed.

When `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` are configured:
1. `getIssueById()` calls Jira Cloud REST API (`GET /rest/api/3/issue/{key}?fields=summary`)
2. Resolves issue key → numeric ID (e.g., `DVPSS-3513` → `116120`)
3. Caches the result under both `DVPSS-3513` and `ISSUE-116120` keys (5-minute TTL)
4. `createWorklogPayload()` uses the resolved numeric ID for `POST /4/worklogs`

Without Jira API credentials, worklog creation will fail with a clear error message explaining the required configuration.

## Installation

### Prerequisites

- **Node.js** 18+
- **Tempo Timesheets** configured in your Jira instance
- **Tempo Personal Access Token** (PAT)

### From Source (This Fork)

```bash
git clone https://github.com/Alexey-Goru1ev/tempo-filler-mcp-server.git
cd tempo-filler-mcp-server
npm install && npm run build
```

Then configure your MCP client to run the built server:

```json
{
  "mcpServers": {
    "tempo-filler": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/tempo-filler-mcp-server/dist/index.js"],
      "env": {
        "TEMPO_BASE_URL": "https://api.tempo.io",
        "TEMPO_PAT": "your-tempo-personal-access-token",
        "TEMPO_ACCOUNT_ID": "your-jira-account-id",
        "JIRA_BASE_URL": "https://your-site.atlassian.net",
        "JIRA_EMAIL": "you@company.com",
        "JIRA_API_TOKEN": "your-jira-api-token"
      }
    }
  }
}
```

### Claude Code Configuration

Add to your project's MCP servers via `claude mcp add` or edit `.claude/external/.claude.json`:

```json
{
  "mcpServers": {
    "tempo-filler": {
      "type": "stdio",
      "command": "node",
      "args": ["/home/user/tempo-filler-mcp-server/dist/index.js"],
      "env": {
        "TEMPO_BASE_URL": "https://api.tempo.io",
        "TEMPO_PAT": "your-tempo-pat",
        "TEMPO_ACCOUNT_ID": "your-jira-account-id",
        "JIRA_BASE_URL": "https://your-site.atlassian.net",
        "JIRA_EMAIL": "you@company.com",
        "JIRA_API_TOKEN": "your-jira-api-token"
      }
    }
  }
}
```

### From NPM (Upstream Only — No Cloud Support)

The npm package `@tranzact/tempo-filler-mcp-server` is the upstream version without Cloud support:

```bash
npx @tranzact/tempo-filler-mcp-server
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TEMPO_BASE_URL` | Yes | `https://api.tempo.io` for Cloud, or `https://jira.example.com` for Server/DC |
| `TEMPO_PAT` | Yes | Tempo Personal Access Token |
| `TEMPO_ACCOUNT_ID` | Cloud only | Your Jira account ID (required for Cloud, ignored on Server/DC) |
| `TEMPO_DEFAULT_HOURS` | No | Default hours per workday (default: 8) |
| `JIRA_BASE_URL` | Cloud only | Jira Cloud site URL (e.g., `https://your-site.atlassian.net`) — needed for issue key resolution |
| `JIRA_EMAIL` | Cloud only | Jira Cloud user email — used with `JIRA_API_TOKEN` for basic auth |
| `JIRA_API_TOKEN` | Cloud only | Jira Cloud API token — generate at [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |

> **Note**: Without `JIRA_*` credentials on Cloud, `get_worklogs` and `get_schedule` work fine (they only use the Tempo API), but `post_worklog` and `bulk_post_worklogs` will fail because the Tempo v4 API requires a numeric `issueId` that can only be resolved via the Jira REST API.

### Getting Your Tempo PAT

**Atlassian Cloud:**
1. Go to [Tempo > Settings > API Integration](https://app.tempo.io/settings/api-integration)
2. Click **New Token**
3. Copy the generated token

**Jira Server/DC:**
1. Go to your Jira profile > **Personal Access Tokens**
2. Click **Create token**
3. Copy the generated token

### Finding Your Account ID (Cloud)

Your Jira account ID is needed for Cloud deployments. To find it:
1. Go to your Jira profile page
2. The URL will contain your account ID: `https://your-domain.atlassian.net/jira/people/<account-id>`
3. Or use the Jira REST API: `GET /rest/api/3/myself` returns your `accountId`

## Available Tools

### get_schedule

Retrieve work schedule (working days, holidays, required hours).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | string | Yes | Start date (YYYY-MM-DD) |
| `endDate` | string | No | End date (defaults to startDate) |

### get_worklogs

Retrieve worklogs for authenticated user.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | string | Yes | Start date (YYYY-MM-DD) |
| `endDate` | string | No | End date (defaults to startDate) |
| `issueKey` | string | No | Filter by issue key (e.g., PROJ-1234) |

### post_worklog

Create a single worklog entry.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | string | Yes | Jira issue key |
| `hours` | number | Yes | Hours worked (0.1-24) |
| `startDate` | string | Yes | Date (YYYY-MM-DD) |
| `endDate` | string | No | End date for multi-day entries |
| `billable` | boolean | No | Billable flag (default: true) |
| `description` | string | No | Work description |

### bulk_post_worklogs

Create multiple worklog entries (max 100 per request).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `worklogs` | array | Yes | Array of `{issueKey, hours, date, description?}` |
| `billable` | boolean | No | Billable flag for all entries (default: true) |

### delete_worklog

Delete a worklog entry by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `worklogId` | string | Yes | Tempo worklog ID |

## Recommended Workflow

The server includes built-in instructions for AI assistants:

1. **Always `get_schedule` first** — check which days are working days
2. **Then create worklogs** — only on working days from the schedule
3. **After modifications** — always `get_worklogs` so the user sees results

```
"Fill my March hours with PROJ-1234"

AI workflow:
  1. get_schedule(2026-03-01, 2026-03-31) → 22 working days
  2. bulk_post_worklogs([...22 entries...])
  3. get_worklogs(2026-03-01, 2026-03-31) → visual confirmation
```

## Development

```bash
npm run build        # Compile TypeScript + build UI
npm run dev          # Build and run stdio server
npm run dev:http     # Build and run HTTP server (port 3001)
npm run typecheck    # Type checking only
```

### Project Structure

```
src/
├── index.ts           # MCP server entry point (stdio transport)
├── http-server.ts     # Alternative HTTP transport
├── tempo-client.ts    # Tempo API client (Cloud + Server/DC)
├── tools/             # Tool implementations
│   ├── get-worklogs.ts
│   ├── post-worklog.ts
│   ├── bulk-post.ts
│   ├── delete-worklog.ts
│   └── get-schedule.ts
├── types/             # TypeScript types and Zod schemas
│   ├── mcp.ts
│   ├── tempo.ts
│   └── responses.ts
└── ui/                # MCP Apps visual components (Vite)
    ├── get-schedule/  # Calendar view
    └── get-worklogs/  # Timesheet grid view
```

## Keeping Up with Upstream

To pull updates from the upstream repo:

```bash
git remote add upstream https://github.com/TRANZACT/tempo-filler-mcp-server.git
git fetch upstream
git merge upstream/main
# Resolve any conflicts in tempo-client.ts, rebuild
npm run build
```

## License

ISC License — see [LICENSE](LICENSE) for details.
