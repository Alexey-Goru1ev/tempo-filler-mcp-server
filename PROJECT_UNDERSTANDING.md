# TempoFiller MCP Server - Project Understanding

## Overview

TempoFiller is a production-ready Model Context Protocol (MCP) server that bridges AI assistants with Tempo (JIRA's time tracking plugin), enabling automated worklog management. Built in TypeScript using modern ES modules, it provides comprehensive tools for retrieving, creating, and managing time entries through AI interfaces like Claude, GitHub Copilot, and other MCP-compatible assistants.

**Current Status**: Published as `@tranzact/tempo-filler-mcp-server` v2.0.0 on NPM registry with full npx support for zero-friction installation, Claude Desktop bundle distribution, and MCP Apps visual UI support.

## Specifications & Documentation

The project follows a specification-driven development approach with comprehensive documentation:

### Specification Files

1. **`specs/tempo-filler-mcp-v1.md`**: Original comprehensive specification
   - Defines all core MCP server components (tools, resources, prompts)
   - Documents Tempo API integration patterns and authentication
   - Establishes TypeScript architecture and type system
   - Provides API endpoint reference and error handling strategies
   - Details implementation phases and success criteria

2. **`specs/npm-publishing.md`**: NPM publication and automation specification
   - Package configuration for `@tranzact/tempo-filler-mcp-server`
   - NPX compatibility requirements and executable binary setup
   - GitHub Actions automation for release-triggered publishing
   - Quality gates, security standards, and documentation requirements
   - Success metrics and cross-platform validation criteria

3. **`specs/get-schedule.md`**: GET Schedule tool product specification
   - Purpose, scope, and intended outcomes for schedule retrieval
   - Functional and non-functional requirements
   - Technical constraints and API integration details
   - Acceptance criteria and usage examples
   - Integration with existing worklog creation workflows

4. **`specs/version-automation.md`**: Automated version management specification
   - Defines version synchronization across package.json, src/index.ts, README.md, and bundle/manifest.json
   - GitHub Actions workflow for automatic release creation on tag push
   - MCP bundle packaging and attachment to GitHub releases
   - Integration with npm version lifecycle hooks

5. **`specs/json-tool-responses.md`**: JSON response format specification
   - Converts tool responses from markdown to structured JSON
   - Defines response schemas for all tools
   - Enables programmatic consumption while maintaining AI formatting flexibility
   - Type definitions in `src/types/responses.ts`

6. **`specs/mcp-apps-visual-aids.md`**: MCP Apps visual UI specification
   - Calendar view for `get_schedule` tool
   - Timesheet grid view for `get_worklogs` tool with coverage-aware coloring
   - Zoom toggle functionality (Days/Weeks/Months)
   - Integration with `@modelcontextprotocol/ext-apps` SDK
   - Self-contained HTML bundles via Vite

### Specification Benefits

The specification-first approach enabled:
- **Clear Implementation Targets**: Detailed requirements before coding
- **AI-Assisted Development**: Specs provided clear context for AI tools
- **Consistent Architecture**: All features follow established patterns
- **Quality Assurance**: Acceptance criteria guide testing and validation
- **Documentation**: Specs serve as comprehensive reference documentation

## Architecture & Components

### Core Architecture

- **Language**: TypeScript 5.9.2+ with ES modules
- **Runtime**: Node.js 18+ (specified in engine requirements)
- **MCP Framework**: `@modelcontextprotocol/sdk` v1.25.2
- **MCP Apps Extension**: `@modelcontextprotocol/ext-apps` v1.0.0
- **Transport**: stdio (primary), HTTP (development/testing)
- **Authentication**: Personal Access Token (PAT) with Bearer token authentication
- **API Integration**: Tempo Timesheets API v4, Tempo Core API v2, and JIRA REST API v3

### Key Dependencies

**Production Dependencies:**
- `@modelcontextprotocol/sdk` ^1.25.2 - Model Context Protocol implementation
- `@modelcontextprotocol/ext-apps` ^1.0.0 - MCP Apps extension for visual UIs
- `axios` ^1.6.0 - HTTP client for API requests with interceptors
- `date-fns` ^3.0.0 - Date formatting and manipulation utilities
- `zod` ^3.25.76 - Runtime type validation and schema definitions
- `express` ^5.2.1 - Web server for HTTP transport mode
- `cors` ^2.8.6 - CORS middleware for HTTP transport
- `dotenv` ^17.2.3 - Environment variable loading

**Development Dependencies:**
- `typescript` ^5.9.2 - TypeScript compiler and type system
- `@types/node` ^24.1.0 - Node.js type definitions
- `@types/express` ^5.0.6 - Express type definitions
- `vite` ^6.0.0 - Build tool for UI bundles
- `vite-plugin-singlefile` ^2.0.0 - Single-file HTML bundle generation

**Bundling & Distribution:**
- `@anthropic-ai/mcpb` - MCP bundler for creating `.mcpb`/`.dxt` distribution files

### TypeScript Configuration

The project uses modern TypeScript with strict settings:
- **Target**: ES2022 (modern JavaScript features)
- **Module System**: Node16 (native ES modules support)
- **Module Resolution**: Node16 (proper .js imports for ES modules)
- **Strict Mode**: Enabled for maximum type safety
- **Declaration Files**: Generated for TypeScript consumers
- **Source Maps**: Enabled for debugging
- **Output**: `dist/` directory with compiled JavaScript

### Project Structure

```
src/
├── index.ts              # MCP server entry point (stdio transport, production)
├── http-server.ts        # HTTP transport server (development/testing)
├── tempo-client.ts       # Tempo/JIRA API client with authentication & caching
├── tools/                # MCP tool implementations
│   ├── get-worklogs.ts   # Retrieve worklogs with filtering & formatting
│   ├── post-worklog.ts   # Create single worklog entry
│   ├── bulk-post.ts      # Create multiple worklogs concurrently
│   ├── delete-worklog.ts # Remove worklog entries
│   ├── get-schedule.ts   # Retrieve work schedule information
│   └── index.ts          # Tool exports
├── types/                # TypeScript definitions
│   ├── tempo.ts          # Tempo API response structures
│   ├── mcp.ts            # MCP validation schemas with Zod
│   ├── responses.ts      # JSON response types for tool outputs
│   └── index.ts          # Type exports
└── ui/                   # MCP Apps visual UI components
    ├── get-schedule/     # Calendar view for schedule data
    │   ├── index.html    # HTML template
    │   ├── index.ts      # MCP Apps client logic
    │   └── styles.css    # Calendar styling
    ├── get-worklogs/     # Timesheet grid view for worklogs
    │   ├── index.html    # HTML template
    │   ├── index.ts      # MCP Apps client logic + aggregation
    │   └── styles.css    # Grid styling
    └── test/             # Test harness for MCP Apps
        └── index.html    # Minimal test component

scripts/
└── update-version.js     # Version synchronization script

.github/workflows/
├── release.yml           # Creates GitHub release on tag push
└── publish.yml           # Publishes to NPM on release

bundle/
└── manifest.json         # MCP bundle metadata
```

## Key Features & Capabilities

### 1. **Worklog Retrieval** (`get_worklogs`)

- Fetch worklogs for authenticated user by date range
- Optional filtering by specific JIRA issue
- Automatic user authentication and server-side filtering
- Returns structured JSON with worklogs, issue aggregation, and summary
- Includes schedule data for coverage-aware UI coloring
- Visual timesheet grid UI via MCP Apps

### 2. **Single Worklog Creation** (`post_worklog`)

- Create individual worklog entries with automatic issue resolution
- Convert JIRA issue keys (PROJ-1234) to numerical IDs for Tempo API
- Automatic worker assignment using authenticated user
- Support for billable/non-billable time tracking
- Returns JSON confirmation with created worklog details

### 3. **Bulk Worklog Operations** (`bulk_post_worklogs`)

- Concurrent creation of multiple worklog entries using Promise.all()
- Intelligent issue caching to minimize API calls
- Maximum 100 entries per bulk operation
- Per-entry success/failure tracking
- Returns comprehensive results with summary statistics

### 4. **Worklog Management** (`delete_worklog`)

- Remove existing worklog entries by Tempo worklog ID
- Confirmation messages with deletion timestamps
- Appropriate error handling for missing or unauthorized entries

### 5. **Work Schedule Retrieval** (`get_schedule`)

- Retrieve work schedule information for authenticated user
- Display working days vs non-working days with expected hours per day
- Support for date range queries with period summary
- Integration with Tempo Core API v2 schedule search endpoint
- Visual calendar UI via MCP Apps

### 6. **Resource Providers**

- Recent issues access for quick reference
- Schedule UI resource (`ui://get-schedule.html`)
- Worklogs UI resource (`ui://get-worklogs.html`)
- JSON-formatted data suitable for AI analysis

### 7. **Prompt Templates**

- `worklog_summary`: Worklog analysis prompts for time tracking insights
- `schedule_aware_bulk_entry`: Guide AI assistants through schedule-first bulk worklog creation workflow

### 8. **Visual UI Components (MCP Apps)**

- **Schedule Calendar**: Month grid view with working/non-working day color coding
- **Worklogs Timesheet**: Pivot table with issues × time periods, coverage-aware coloring
- **Zoom Toggle**: Days/Weeks/Months views for different time ranges
- **Coverage Indicators**: Green (full), Yellow (under), Red (gap), Blue (over), Gray (non-working)

## Technical Implementation Details

### Entry Points

#### stdio Transport (Production) - `src/index.ts`
- Main MCP server for Claude Desktop, VS Code, and other MCP clients
- Uses `StdioServerTransport` from MCP SDK
- Preloads UI HTML files at startup for performance
- Registers tools with UI metadata for MCP Apps support
- Version: 2.0.0

#### HTTP Transport (Development) - `src/http-server.ts`
- Express-based HTTP server for testing MCP Apps
- Uses `StreamableHTTPServerTransport` for stateless per-request handling
- Serves static files for UI testing
- Port: 3001 (default)

### Authentication System

- **PAT-based Authentication**: Uses JIRA Personal Access Tokens for secure API access
- **Current User Detection**: Automatic resolution of authenticated user identity via `/rest/api/latest/myself`
- **Token Validation**: Built-in connectivity testing and error handling
- **Environment Variables**: `TEMPO_BASE_URL` and `TEMPO_PAT` for configuration
- **User Caching**: Current user identity cached to avoid repeated API calls

### API Integration Patterns

1. **Issue Resolution**: JIRA issue keys → numerical IDs for Tempo API compatibility
2. **Issue Caching**: 5-minute TTL cache for frequently accessed issues
3. **Concurrent Processing**: Promise.all() for bulk operations (matches C# Task.WhenAll pattern)
4. **Fallback Strategies**: Multiple API endpoints for worklog retrieval
5. **Rate Limiting**: Proper error handling for API rate limits (429 responses)
6. **Request Debugging**: Comprehensive request/response logging via axios interceptors

### Data Flow Architecture

```
AI Assistant → MCP Server → TempoClient → [JIRA API + Tempo API] → Response Formatting → AI Assistant
                   ↓
              UI Resources → MCP Apps Host → Visual Rendering
```

### Error Handling Strategy

- **Authentication Errors**: Clear PAT validation messages
- **Permission Errors**: Specific guidance for Tempo/JIRA permissions
- **API Errors**: Structured error responses with troubleshooting tips
- **Rate Limiting**: Graceful handling with retry suggestions
- **Data Validation**: Zod schema validation for all inputs
- **Issue Resolution Failures**: Proper 404 handling with helpful messages

## Type System

### Type Files Overview

#### `src/types/tempo.ts` - API Layer Types
- **JiraIssue**: JIRA issue structure with id, key, fields
- **TempoWorklogResponse**: Raw API response from Tempo worklog endpoints
- **TempoWorklog**: Processed/simplified worklog for MCP responses
- **TempoWorklogCreatePayload**: Payload structure for creating new worklogs
- **TempoApiError**: Error response structure from Tempo API
- **TempoScheduleResponse**: Work schedule API response structure
- **GetWorklogsParams/Response**: Request/response for fetching worklogs
- **PostWorklogParams**: Parameters for creating single worklog
- **BulkPostWorklogsParams/Response**: Bulk operation types
- **TempoClientConfig**: Configuration for API client
- **IssueCache**: Performance optimization for issue resolution

#### `src/types/mcp.ts` - Protocol Layer Types
- **Zod Schemas**: Input validation for all tools (GetWorklogsInputSchema, etc.)
- **Type Inference**: TypeScript types derived from Zod schemas
- **Constants**: TOOL_NAMES, PROMPT_NAMES, RESOURCE_NAMES, ENV_VARS
- **Defaults**: DEFAULTS object with hours per day, timeout, cache TTL, max bulk entries

#### `src/types/responses.ts` - Presentation Layer Types
- **GetScheduleJsonResponse**: Structured schedule response with days array and summary
- **GetWorklogsJsonResponse**: Worklogs with byIssue aggregation, summary, and schedule
- **PostWorklogJsonResponse**: Success confirmation with created worklog details
- **BulkPostWorklogsJsonResponse**: Per-entry results with summary statistics
- **DeleteWorklogJsonResponse**: Deletion confirmation

## UI Components

### Schedule Calendar (`src/ui/get-schedule/`)
- Month calendar grid with correct day-of-week alignment
- Color-coded cells: green for working days, gray for non-working
- Today's date highlighted with border
- Locale-aware first day of week (Sunday vs Monday)
- Summary showing working day count and total required hours

### Worklogs Timesheet (`src/ui/get-worklogs/`)
- Pivot table: issues as rows, time periods as columns
- Sticky left columns (Issue, Logged) for horizontal scrolling
- Zoom toggle: Days (default), Weeks, Months
- Coverage-aware total row with logged/required format
- Color coding: green=full, yellow=under, red=gap, blue=over, gray=non-working
- Two-line issue cells: summary (truncated ~30 chars) and key (smaller text)

### MCP Apps Integration Pattern
1. Create App instance with name and version
2. Register handlers (ontoolresult, onhostcontextchanged, etc.)
3. Call app.connect()
4. Apply host theme/styles after connection
5. Parse structured data and render visual components

## Development & Maintenance

### Build Commands

- `npm run build`: TypeScript compilation + UI bundle + MCP bundle
- `npm run build:ui`: Vite build for UI components (get-schedule, get-worklogs)
- `npm run build:unix`: Unix-specific build with executable permissions
- `npm run dev`: Development build and run (stdio transport)
- `npm run dev:http`: Development HTTP server
- `npm run typecheck`: Type validation without compilation
- `npm run prepublishOnly`: Pre-publish hook (runs build automatically)
- `npm run version`: Version synchronization script + git staging

### Version Management

Automated via `scripts/update-version.js`:
1. Read version from `package.json` (single source of truth)
2. Update `src/index.ts` server version constant
3. Update `README.md` GitHub release URLs (all vX.X.X patterns)
4. Update `bundle/manifest.json` version field
5. Stage all changes for npm version commit

### Release Pipeline

**On `npm version patch/minor/major`:**
1. npm updates package.json version
2. `scripts/update-version.js` syncs all version references
3. npm commits and creates git tag

**On tag push (`.github/workflows/release.yml`):**
1. Build project
2. Package MCP bundle (`mcpb pack bundle`)
3. Create GitHub release with auto-generated notes
4. Attach `bundle.dxt` as downloadable asset

**On release published (`.github/workflows/publish.yml`):**
1. Run tests across matrix (Node 18/20/22 × Ubuntu/Windows/macOS)
2. Security audit
3. Verify version tag matches package.json
4. Publish to NPM with provenance (OIDC authentication)
5. Post-publish cross-platform verification

### Distribution Channels

1. **NPM Registry** (Primary): `npx @tranzact/tempo-filler-mcp-server`
   - Zero-friction installation
   - Automatic dependency resolution
   - Cross-platform compatibility
   - Ideal for VS Code, GitHub Copilot, and other MCP clients

2. **GitHub Releases** (Bundle): Direct download of `.dxt` bundle
   - Claude Desktop drag-and-drop installation
   - Self-contained executable with dependencies bundled
   - Version-specific releases
   - Link: `https://github.com/TRANZACT/tempo-filler-mcp-server/releases/download/v2.0.0/bundle.dxt`

3. **One-Click Install Badges**: README includes install buttons
   - VS Code MCP install link with pre-configured settings
   - Claude Desktop install link with download URL
   - Environment variable configuration guidance

## Configuration Requirements

### Environment Variables

- `TEMPO_BASE_URL` (required): JIRA instance URL (e.g., "https://jira.company.com")
- `TEMPO_PAT` (required): Personal Access Token for authentication
- `TEMPO_DEFAULT_HOURS` (optional): Default hours per workday (default: 8)
- `PORT` (optional, HTTP mode only): HTTP server port (default: 3001)

### Prerequisites

- Node.js 18+
- JIRA instance with Tempo Timesheets plugin
- Valid Personal Access Token with worklog read/write permissions

## AI Assistant Integration

### NPX Usage (Recommended)

```json
{
  "mcpServers": {
    "tempo-filler": {
      "command": "npx",
      "args": ["@tranzact/tempo-filler-mcp-server"],
      "env": {
        "TEMPO_BASE_URL": "https://jira.company.com",
        "TEMPO_PAT": "your-personal-access-token"
      }
    }
  }
}
```

### GitHub Copilot Configuration

```json
{
  "github.copilot.chat.mcp.servers": {
    "tempo-filler": {
      "command": "npx",
      "args": ["@tranzact/tempo-filler-mcp-server"],
      "env": {
        "TEMPO_BASE_URL": "https://jira.company.com",
        "TEMPO_PAT": "your-personal-access-token"
      }
    }
  }
}
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "tempo-filler": {
      "command": "npx",
      "args": ["@tranzact/tempo-filler-mcp-server"],
      "env": {
        "TEMPO_BASE_URL": "https://jira.company.com",
        "TEMPO_PAT": "your-personal-access-token"
      }
    }
  }
}
```

## API Compatibility

### Supported Systems

- **JIRA Core/Software**: 8.14+ (required for PAT authentication)
- **Tempo Timesheets**: 4.x (uses `/rest/tempo-timesheets/4/` endpoints)
- **Tempo Core**: 2.x (uses `/rest/tempo-core/2/` for schedule API)
- **MCP Protocol**: Full compliance with Model Context Protocol specification
- **MCP Apps**: Support for visual UI rendering in compatible hosts

### Key API Endpoints

- `GET /rest/api/latest/myself` - User authentication and identity
- `GET /rest/api/latest/issue/{key}` - Issue resolution and caching
- `POST /rest/tempo-timesheets/4/worklogs/` - Worklog creation
- `POST /rest/tempo-timesheets/4/worklogs/search` - Worklog retrieval
- `DELETE /rest/tempo-timesheets/4/worklogs/{id}` - Worklog deletion
- `GET /rest/api/latest/issue/{key}/worklog` - JIRA worklog fallback
- `POST /rest/tempo-core/2/user/schedule/search` - Work schedule retrieval

## Security Considerations

- **No Credential Logging**: PAT tokens never appear in logs or responses
- **Input Validation**: Comprehensive Zod schema validation for all inputs
- **Authentication Checks**: Bearer token validation on every request
- **Permission Boundaries**: Users can only access/modify their own worklogs
- **Token Revocation**: PAT tokens can be easily revoked if compromised
- **Request Debugging**: Debug logging to stderr only, not stdout (MCP protocol compliance)
- **NPM Provenance**: Published with provenance for supply chain security

## Usage Patterns & Examples

### Common Workflows

1. **Daily Time Logging**: "Log 8 hours on PROJ-1234 for today"
2. **Schedule Verification**: "What's my work schedule for October 2025?"
3. **Schedule-Aware Bulk Entry**: "Check my October schedule, then fill all working days with 8 hours on PROJ-1234"
4. **Weekly Time Filling**: "Fill my timesheet for this week - 4 hours PROJ-1111 and 4 hours PROJ-2222 each day"
5. **Monthly Bulk Operations**: "Fill all weekdays in July with 8 hours on PROJ-1234"
6. **Time Analysis**: "Get my July hours" → Detailed breakdown by issue and date
7. **Worklog Management**: "Delete worklog with ID 1211547"

### Response Formats

All tools return structured JSON responses:

```typescript
// get_schedule response
{
  startDate: "2025-10-01",
  endDate: "2025-10-31",
  days: [{ date, dayOfWeek, requiredHours, isWorkingDay }],
  summary: { totalDays, workingDays, nonWorkingDays, totalRequiredHours, averageDailyHours }
}

// get_worklogs response
{
  startDate, endDate, issueFilter?,
  worklogs: [{ id, issueKey, issueSummary, date, hours, comment }],
  byIssue: [{ issueKey, issueSummary, totalHours, entryCount }],
  summary: { totalHours, totalEntries, uniqueIssues },
  schedule: [...] // for UI coverage coloring
}

// post_worklog response
{
  success: true,
  worklog: { id, issueKey, issueSummary, date, hours, comment }
}

// bulk_post_worklogs response
{
  results: [{ date, issueKey, hours, success, worklogId?, error? }],
  summary: { total, succeeded, failed, totalHours }
}

// delete_worklog response
{
  success: true,
  deletedWorklogId: "12345"
}
```

## Current Implementation Status

### Production Deployment

- **NPM Publication**: Successfully published as `@tranzact/tempo-filler-mcp-server` v2.0.0
- **NPX Support**: Zero-friction installation with `npx @tranzact/tempo-filler-mcp-server`
- **Cross-Platform**: Verified working on Windows, macOS, and Linux (Node 18/20/22)
- **Bundle Distribution**: MCP bundle creation integrated into release pipeline
- **MCP Apps UI**: Visual calendar and timesheet components

### Verified Integrations

- **GitHub Copilot Chat (VS Code)**: Full integration with npx configuration
- **Claude Desktop**: Complete MCP server support with bundle installation
- **Real Tempo API**: Successfully tested against production Tempo Timesheets API v4

### Core Features Implementation Status

1. **get_worklogs**: Complete with JSON response, issue aggregation, schedule data for UI
2. **post_worklog**: Complete with automatic issue resolution and PAT authentication
3. **bulk_post_worklogs**: Complete with concurrent processing and per-entry results
4. **delete_worklog**: Complete with proper error handling and confirmation
5. **get_schedule**: Complete with Tempo Core API v2 integration
6. **Resources**: UI resources for schedule and worklogs visualization
7. **Prompts**: Worklog analysis and schedule-aware bulk entry templates
8. **Visual UIs**: Calendar and timesheet grid components via MCP Apps

### Technical Accomplishments

- **TypeScript ES Modules**: Modern module system with proper .js imports and Node16 resolution
- **Comprehensive Error Handling**: Structured error responses with troubleshooting guidance
- **Authentication System**: Robust PAT-based authentication with user resolution
- **Issue Caching**: 5-minute TTL cache for performance optimization
- **Concurrent Operations**: Promise.all() implementation for bulk worklog creation
- **Input Validation**: Zod schemas for all tool inputs with helpful error messages
- **JSON Response Format**: Structured responses for programmatic consumption
- **MCP Apps Integration**: Visual UI components with host theme integration
- **Automated Versioning**: Single source of truth with automated synchronization
- **CI/CD Pipeline**: Full automation from version bump to NPM publication

## Development Timeline & Success Factors

**Built in 3 hours using AI-powered development:**

1. **Specification Phase**: Complete technical specification using GitHub Copilot + Claude Sonnet 4
2. **Implementation Phase**: One-shot implementation with VS Code + Claude Code
3. **Refinement Phase**: API debugging and polishing with GitHub Copilot + Claude Sonnet 4

### Key Success Factors

- Clear specification-first approach enabled effective AI implementation
- Multiple AI tools used for their respective strengths (specification vs implementation vs debugging)
- Iterative refinement with quick AI-assisted feedback loops
- Thorough understanding of existing C# implementation patterns

## Future Considerations

Potential areas for enhancement (not currently prioritized):

### Phase 2 Enhancements
- Click-to-fill interactions (clicking a cell to log time)
- Coverage view overlay (schedule + worklogs combined)
- Issue pie chart showing hours distribution

### Phase 3 Enhancements
- Month navigation in calendar UI
- Cell detail popover for individual worklog entries
- Bulk actions ("Fill all gaps with [issue]" button)
- Delete from grid functionality

### Long-Term Vision
- Advanced resource providers for historical data analysis
- Additional prompt templates for complex time tracking scenarios
- Enhanced caching strategies for improved performance
- Support for custom Tempo attributes and fields
- Integration with additional time tracking systems
- Comprehensive test suite (unit + integration)
- Performance monitoring and analytics

## Maintenance Status

The project is **actively maintained** with:
- Current version: v2.0.0
- Published on NPM registry with provenance
- Available via GitHub releases
- Fully documented and specified
- Production-ready and tested
- Visual UI support via MCP Apps

This project successfully demonstrates how specification-driven development combined with AI-assisted implementation can produce enterprise-grade software that integrates modern AI assistants with legacy enterprise systems, creating powerful automation capabilities for knowledge workers.
