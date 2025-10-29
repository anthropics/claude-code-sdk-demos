# Hello World Agent Workspace Guide

## Overview
This is the working directory for the Claude Agent SDK hello-world example. This workspace demonstrates how to create autonomous agents that can interact with Claude and perform tasks.

## Directory Structure

```
agent/
└── CLAUDE.MD           # This file - workspace guidelines
└── custom_scripts/     # Required directory for .js and .ts files
```

## File Operations

### Script File Restrictions
The hello-world example includes a PreToolUse hook that enforces security policies:

**JavaScript and TypeScript files** (`.js`, `.ts`) **MUST** be written to the `custom_scripts/` directory only.

**Examples:**
- ✅ `agent/custom_scripts/my-script.ts`
- ✅ `agent/custom_scripts/utils.js`
- ❌ `agent/my-script.ts` (blocked)
- ❌ `agent/data/script.js` (blocked)

**Reason:** This restriction prevents accidental overwrites of important configuration or system files.

### Other File Types
All other file types (`.txt`, `.md`, `.json`, etc.) can be written anywhere within the `agent/` directory.

## Available Tools

The agent has access to:
- **File operations**: Read, Write, Edit, MultiEdit
- **Search**: Glob, Grep, WebSearch
- **Execution**: Bash, Task
- **Utilities**: TodoWrite, WebFetch, BashOutput, KillBash
- **Planning**: ExitPlanMode

## Best Practices

1. **Understand the working directory**: All file paths are relative to the `agent/` directory
2. **Respect the custom_scripts directory**: Always write scripts to `custom_scripts/`
3. **Use appropriate tools**: Choose the right tool for each task
4. **Test incrementally**: Start simple and build complexity gradually

## Example Workflows

### Creating a Script
```markdown
1. Write TypeScript/JavaScript code to `agent/custom_scripts/my-script.ts`
2. Use the Bash tool to run: `npx tsx custom_scripts/my-script.ts`
3. Review output and iterate
```

### File Search
```markdown
1. Use Glob to find files by pattern: `**/*.ts`
2. Use Grep to search file contents: pattern search
3. Use Read to examine specific files
```

### Data Processing
```markdown
1. Create data files in `agent/data/` (any extension)
2. Write processing scripts in `agent/custom_scripts/`
3. Execute and analyze results
```

## Security Notes

- The PreToolUse hook protects against unintended file operations
- Scripts are sandboxed to the `custom_scripts/` directory
- Always validate external input and data
- Be cautious with Bash commands

## Getting Help

- Check the main README.md for SDK documentation
- Review the hook implementation in `hello-world.ts` for security policies
- Explore the allowed tools list for available capabilities
