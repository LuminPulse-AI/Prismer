---
name: find-skills
description: "List installed skills, search the skill registry, install new skills, and manage workspace extensions. Use when the user asks to find, install, list, or configure skills, or mentions skill registry, extensions, or workspace capabilities."
---

# find-skills

Discover and manage skills for Prismer.AI academic workspace.

## Description

This skill helps users and agents discover, search, and install skills that extend the capabilities of the Prismer.AI workspace. It provides a unified interface for both human users and AI agents to manage the skill ecosystem.

## Usage Examples

**Discovery:**
- "Find a skill for managing citations"
- "What skills are available for LaTeX editing?"
- "Show me data visualization skills"

**Information:**
- "Tell me about the latex-cite skill"
- "What tools does the stats-helper skill provide?"

**Installation:**
- "Install the bib-sync skill"
- "Add the methodology-generator skill to my workspace"

**Management:**
- "List my installed skills"
- "Uninstall the data-viz skill"
- "Update all skills"

## Process

1. **Identify** the user's intent (search, info, install, list, uninstall)
2. **Search** the skill registry (local workspace + cloud catalog)
3. **Present** results with clear descriptions and capabilities
4. **Execute** the requested action (install/uninstall/update)
5. **Confirm** the action was successful

## Tools

### skill_search
Search for skills by name, description, or capability.

**Parameters:**
- `query` (string, optional): Free-text search query
- `category` (string, optional): Filter by category (latex, jupyter, pdf, citation, data, writing, general)
- `limit` (number, optional): Maximum results to return (default: 10)

**Returns:** Array of matching skills with id, name, description, category, version

### skill_info
Get detailed information about a specific skill.

**Parameters:**
- `skillId` (string, required): The skill ID or name

**Returns:** Full skill details including tools, dependencies, author, repository

### skill_install
Install a skill to the current workspace.

**Parameters:**
- `skillId` (string, required): The skill ID or package name
- `version` (string, optional): Specific version to install (default: latest)

**Returns:** Installation status and any setup instructions

### skill_list
List all skills installed in the current workspace.

**Parameters:**
- `category` (string, optional): Filter by category
- `includeBuiltin` (boolean, optional): Include built-in skills (default: true)

**Returns:** Array of installed skills with status

### skill_uninstall
Remove a skill from the current workspace.

**Parameters:**
- `skillId` (string, required): The skill ID to uninstall

**Returns:** Uninstallation status

### skill_update
Update installed skills to their latest versions.

**Parameters:**
- `skillId` (string, optional): Specific skill to update (omit for all)

**Returns:** Update status for each skill

## Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `latex` | LaTeX document preparation | latex-cite, latex-template, equation-helper |
| `jupyter` | Jupyter notebook enhancement | cell-magic, data-loader, plot-helper |
| `pdf` | PDF reading and annotation | highlight-sync, note-extract, figure-export |
| `citation` | Bibliography management | bib-sync, cite-format, reference-check |
| `data` | Data analysis and visualization | stats-helper, chart-gen, table-format |
| `writing` | Academic writing assistance | grammar-check, structure-suggest, method-gen |
| `general` | General purpose utilities | find-skills, workspace-backup, export-all |

## Built-in Skills

The following skills are always available:

- **prismer-workspace**: Core academic workspace tools (LaTeX, Jupyter, PDF, UI control)
- **find-skills**: This skill for discovering and managing other skills

## Skill Manifest Format

Skills are defined by a `manifest.json` in their directory:

```json
{
  "id": "example-skill",
  "name": "Example Skill",
  "version": "1.0.0",
  "description": "A brief description of what this skill does",
  "category": "general",
  "author": "Prismer Team",
  "repository": "https://github.com/prismer/example-skill",
  "tools": [
    {
      "name": "example_tool",
      "description": "What this tool does",
      "parameters": {
        "param1": {
          "type": "string",
          "description": "Parameter description",
          "required": true
        }
      }
    }
  ],
  "dependencies": ["prismer-workspace"]
}
```

## Installation Locations

- **Local skills**: `/workspace/skills/<skill-id>/`
- **Built-in skills**: `/home/user/.openclaw/workspace/skills/`
- **Manifest**: `<skill-dir>/manifest.json`
- **Implementation**: `<skill-dir>/index.ts` or `<skill-dir>/index.py`

## Security

- Skills run in the container sandbox with limited permissions
- Network access is controlled by workspace security policy
- File access is restricted to `/workspace/` directory
- Skills cannot modify other skills or core system files
