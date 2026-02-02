# MCP Server Instructions & Best Practices Guide

This document captures research on MCP server instructions, best practices for writing them, and the `defer_loading` feature for tool management.

## Table of Contents

- [Server Instructions](#server-instructions)
  - [What Are Server Instructions?](#what-are-server-instructions)
  - [Best Practices](#best-practices)
  - [What to Include](#what-to-include)
  - [What to Avoid](#what-to-avoid)
- [Tool Descriptions](#tool-descriptions)
- [Defer Loading](#defer-loading)
  - [How It Works](#how-it-works)
  - [Configuration](#configuration)
- [Sources](#sources)

---

## Server Instructions

### What Are Server Instructions?

Server instructions are an optional field in the MCP protocol's `InitializeResult` that allows servers to inject contextual knowledge into LLMs. They function as a "user manual" for tool usage, conveying information independent of individual prompts, tools, or messages.

```typescript
const server = new Server(
  { name: "my-server", version: "1.0.0" },
  {
    capabilities: { tools: {}, resources: {}, prompts: {} },
    instructions: "Your instructions here..."
  }
);
```

**Key insight:** A GitHub PR review case study demonstrated a **25% improvement** in model performance when clear workflow instructions were provided.

### Best Practices

| Do | Don't |
|---|---|
| Capture cross-tool relationships | Duplicate tool descriptions |
| Document workflow patterns & sequencing | Make marketing claims |
| State constraints and limits clearly | Write exhaustive manuals |
| Keep it concise and actionable | Assume guaranteed LLM behavior |
| Stay model-agnostic (factual statements) | Include verbose explanations |
| Explain when to use your tools (discovery) | List every tool with its description |

### What to Include

1. **Discovery Triggers**: Tell the AI *when* to search for your tools
   ```
   "Use when users ask about time tracking, logging hours, or filling timesheets."
   ```

2. **Workflow Patterns**: Show the recommended sequence of operations
   ```
   "WORKFLOW: Always get_schedule first → then create worklogs only on working days."
   ```

3. **Constraints**: Be explicit about limitations and requirements
   ```
   "CONSTRAINTS:
   - Dates: YYYY-MM-DD format
   - Hours: 0.1-24 per entry
   - Bulk operations: max 100 entries"
   ```

4. **Tool Relationships**: Explain how tools work together
   ```
   "TOOL RELATIONSHIPS:
   - get_schedule + bulk_post_worklogs: Check working days, then fill only those days
   - post_worklog → get_worklogs: Fetch after modifications so users see results"
   ```

### What to Avoid

- **Duplicating tool descriptions**: These are already in tool definitions
- **Marketing language**: Stick to factual, actionable information
- **Exhaustive documentation**: Instructions should be concise
- **Assuming behavior**: Instructions are recommendations, not guarantees
- **Model-specific language**: Write for any LLM, not just one

**Important:** "No instructions are better than poorly written instructions." Implementation varies by host application, and instructions cannot guarantee specific behavior.

---

## Tool Descriptions

From Anthropic's Advanced Tool Use guide, clear tool definitions improve discovery accuracy:

**Good Example:**
```json
{
  "name": "search_customer_orders",
  "description": "Search for customer orders by date range, status, or total amount. Returns order details including items, shipping, and payment info."
}
```

**Poor Example:**
```json
{
  "name": "query_db_orders",
  "description": "Execute order query"
}
```

### Document Return Formats

For programmatic execution, document return formats clearly:

```
"Returns: List of order objects, each containing:
- id (str): Order identifier
- total (float): Order total in USD
- status (str): One of 'pending', 'shipped', 'delivered'"
```

---

## Defer Loading

### How It Works

`defer_loading` is an **Anthropic API feature** (not part of the MCP protocol) that controls how tools are loaded into Claude's context window.

- Tools marked with `defer_loading: true` aren't loaded into context initially
- Only a "Tool Search Tool" plus critical tools (`defer_loading: false`) are immediately available
- Claude discovers and loads deferred tools on-demand when needed

**Important:** This is configured by the **client/host** when calling the Anthropic API, not in the MCP server itself.

### Configuration

For MCP servers, configure defer_loading in your API call:

```json
{
  "tools": [
    {
      "type": "mcp_toolset",
      "mcp_server_name": "tempo-filler",
      "default_config": { "defer_loading": true },
      "configs": {
        "get_schedule": { "defer_loading": false }
      }
    }
  ]
}
```

This configuration:
- Defers all tools by default (`defer_loading: true`)
- Keeps `get_schedule` immediately available (`defer_loading: false`)

### Claude Code Tool Search

In Claude Code, tool search activates automatically when MCP tool definitions exceed a context threshold:

| Setting | Behavior |
|---------|----------|
| `auto` (default) | Activates when MCP tools exceed 10% of context |
| `auto:<N>` | Custom threshold (e.g., `auto:5` for 5%) |
| `true` | Always enabled |
| `false` | Disabled, all tools loaded upfront |

Configure via environment variable:
```bash
ENABLE_TOOL_SEARCH=auto:5 claude
```

**Note:** Tool search requires models that support `tool_reference` blocks (Sonnet 4+, Opus 4+). Haiku models do not support tool search.

---

## Sources

### Official Documentation

- [MCP Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25) - Official protocol specification
- [MCP Lifecycle & Initialization](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) - ServerInfo and instructions field
- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp) - Tool search and server configuration

### Best Practices & Guides

- [MCP Best Practices: Architecture & Implementation Guide](https://modelcontextprotocol.info/docs/best-practices/) - General MCP development guidelines
- [Server Instructions: Giving LLMs a User Manual for Your Server](https://modelcontextprotocol.info/blog/server-instructions) - Detailed guidance on writing instructions
- [Anthropic: Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use) - Tool descriptions, defer_loading, and optimization

### Additional Resources

- [MCP GitHub Repository](https://github.com/modelcontextprotocol/servers) - Reference implementations
- [MCP SDK on npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - TypeScript SDK

---

## TempoFiller Implementation

Based on this research, TempoFiller uses the following server instructions:

```typescript
const SERVER_INSTRUCTIONS = `Tempo Timesheets integration for JIRA worklog management. Use when users ask about time tracking, logging hours, filling timesheets, or checking work schedules.

WORKFLOW: Always get_schedule first → then create worklogs only on working days.

CONSTRAINTS:
- Dates: YYYY-MM-DD format
- Hours: 0.1-24 per entry, default 8h/day
- Bulk operations: max 100 entries
- Issue keys: PROJECT-NUMBER format (e.g., PROJ-1234)

TOOL RELATIONSHIPS:
- get_schedule + bulk_post_worklogs: Check working days, then fill only those days
- get_worklogs + delete_worklog: Review entries, then remove specific ones by ID
- get_schedule + get_worklogs: Compare required vs logged hours for coverage gaps
- post_worklog/bulk_post_worklogs/delete_worklog → get_worklogs: Always fetch worklogs after modifications so users see results visually`;
```

**Design decisions:**
1. **Discovery-friendly** - Starts with "Use when..." to help tool search
2. **Concise workflow** - Single line showing the recommended pattern
3. **Explicit constraints** - Clear limits with actual values
4. **Relationship-focused** - Shows how tools work together, not individual descriptions
5. **Visual feedback** - Encourages fetching worklogs after modifications for UI display
