---
name: memory-manager
description: Local file-based memory search and management for OpenClaw agents. Use when the agent needs to search, retrieve, organize, or maintain memory files (memory/YYYY-MM-DD.md and MEMORY.md). Provides semantic-like search without API keys, memory consolidation, archiving, and cleanup. Activate for queries about prior conversations, decisions, tasks, or when memory_search tool is unavailable or fails.
---

# Memory Manager

Local file-based memory system that provides semantic-like search and maintenance capabilities without requiring external API keys.

## When to Use This Skill

Use this skill when:
- `memory_search` tool fails or is unavailable (no API key)
- You need to find information from previous conversations
- User asks about prior decisions, tasks, or context
- Memory maintenance is needed (archiving, consolidation, cleanup)
- You need to list or browse memory files

## Core Capabilities

### 1. Search Memories

Search through all memory files using keyword matching with context awareness:

```bash
# Basic search
python3 scripts/memory.py search "your query here"

# Search with limits
python3 scripts/memory.py search "project deadline" -n 10 -d 30

# Regex search
python3 scripts/memory.py search "TODO|FIXME|BUG" -r

# Search by tags
python3 scripts/memory.py search "持仓" -t "project,investment"

# JSON output for programmatic use
python3 scripts/memory.py search "important decision" --json
```

**Scoring system:**
- Title/heading matches: 3x weight
- Bullet point matches: 2x weight
- Body text matches: 1x weight
- Long-term memory (MEMORY.md): 1.5x boost

**Tag formats supported:**
- `#tag` - Hash tag
- `[tag]` or `[[tag]]` - Bracket tag
- `tag:` - Label format at line start

### 2. List Memories

List all memory files with metadata:

```bash
# List all memories
python3 scripts/memory.py list

# List recent memories only
python3 scripts/memory.py list -d 7

# JSON output
python3 scripts/memory.py list --json
```

### 3. Get Memory Content

Retrieve specific content from a memory file:

```bash
# Get full file
python3 scripts/memory.py get memory/2026-02-22.md

# Get specific lines
python3 scripts/memory.py get MEMORY.md -f 1 -l 50
```

### 4. Memory Maintenance

Run maintenance tasks to keep memory organized:

```bash
# Show statistics
python3 scripts/maintenance.py stats

# Archive old memories (>30 days) - dry run
python3 scripts/maintenance.py archive

# Actually archive
python3 scripts/maintenance.py archive --execute

# Consolidate recent memories to long-term - dry run
python3 scripts/maintenance.py consolidate

# Clean up empty files
python3 scripts/maintenance.py cleanup --execute

# Full maintenance cycle
python3 scripts/maintenance.py maintenance --execute
```

## Workflow: Finding Past Information

When user asks about prior context:

1. **Try memory_search first** - If it works, use those results
2. **Fallback to this skill** - If memory_search fails with API key error
3. **Search with relevant keywords**:
   ```bash
   python3 scripts/memory.py search "user query" -n 5 --json
   ```
4. **Retrieve full content** if needed:
   ```bash
   python3 scripts/memory.py get <path> -f <line>
   ```
5. **Present findings** to user with source attribution

## Workflow: Daily Memory Maintenance

Recommended weekly maintenance:

1. **Check stats**:
   ```bash
   python3 scripts/maintenance.py stats
   ```

2. **Review consolidation candidates** (dry run):
   ```bash
   python3 scripts/maintenance.py consolidate -d 7
   ```

3. **Execute if satisfied**:
   ```bash
   python3 scripts/maintenance.py consolidate -d 7 --execute
   ```

4. **Archive old memories monthly**:
   ```bash
   python3 scripts/maintenance.py archive -d 60 --execute
   ```

## Memory File Structure

```
workspace/
├── memory/
│   ├── 2026-02-22.md      # Daily memory files
│   ├── 2026-02-21.md
│   └── archive/           # Archived old memories
└── MEMORY.md              # Long-term curated memory
```

## Best Practices for Memory Content

When writing memories that will be searched later:

1. **Use clear headings** for important topics (gets 3x search weight)
2. **Use bullet points** for key items (gets 2x search weight)
3. **Include dates** in content for temporal context
4. **Tag important items** with `[IMPORTANT]` or `[KEY]` markers
5. **Structure decisions** under `# Decision` or `# 决定` headings
6. **Structure lessons** under `# Lesson` or `# 教训` headings

## Integration with AGENTS.md

This skill complements the memory system described in AGENTS.md:

- **Daily notes** → `memory/YYYY-MM-DD.md` (raw logs)
- **Long-term** → `MEMORY.md` (curated wisdom)
- **Search** → Use this skill when `memory_search` is unavailable
- **Maintenance** → Use this skill for periodic cleanup

## Troubleshooting

**Issue**: `memory_search` fails with "No API key found"
**Solution**: Use this skill's search instead:
```bash
python3 scripts/memory.py search "your query"
```

**Issue**: Too many memory files, hard to navigate
**Solution**: Run maintenance to archive old files:
```bash
python3 scripts/maintenance.py archive -d 30 --execute
```

**Issue**: Important memories scattered across daily files
**Solution**: Consolidate to long-term memory:
```bash
python3 scripts/maintenance.py consolidate -d 7 --execute
```
