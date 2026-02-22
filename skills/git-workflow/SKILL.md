---
name: git-workflow
description: Git workflow automation tool. Use when you need to check commit message format, generate CHANGELOG, check branch status, or run pre-commit checks. Provides conventional commit validation and Git workflow automation.
---

# Git Workflow

Automate common Git tasks including commit message validation, CHANGELOG generation, and pre-commit checks.

## When to Use This Skill

Use this skill when:
- Validating commit message format
- Generating CHANGELOG from commits
- Checking branch status (ahead/behind, uncommitted changes)
- Running pre-commit checks
- Suggesting commit messages

## Commands

### 1. Check Commit Format

Validate commit message follows conventional commits:

```bash
# Check last commit
python3 scripts/git-workflow.py check-commit

# Check specific message
python3 scripts/git-workflow.py check-commit -m "feat: add new feature"
```

**Valid formats:**
- `feat: add new feature`
- `fix(scope): resolve bug`
- `docs!: breaking change`
- `refactor: improve code`

### 2. Suggest Commit Messages

Get AI-suggested commit messages based on changes:

```bash
python3 scripts/git-workflow.py suggest "Added user authentication and login page"
```

### 3. Generate CHANGELOG

Generate CHANGELOG from commit history:

```bash
# Generate from all commits
python3 scripts/git-workflow.py changelog

# Generate since specific tag
python3 scripts/git-workflow.py changelog -t v1.0.0

# Save to file
python3 scripts/git-workflow.py changelog -o CHANGELOG.md
```

### 4. Check Branch Status

Check current branch status:

```bash
python3 scripts/git-workflow.py status
```

**Output includes:**
- Current branch
- Uncommitted changes
- Commits ahead/behind remote
- Pull/push needed

### 5. Pre-commit Checks

Run pre-commit validation:

```bash
python3 scripts/git-workflow.py pre-commit
```

**Checks include:**
- Commit message format
- No large files (>10MB)
- Branch sync status

## Conventional Commits

**Format:** `type(scope)?: subject`

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Code style (formatting)
- `refactor` - Code refactoring
- `perf` - Performance improvement
- `test` - Tests
- `chore` - Build/tooling changes
- `ci` - CI/CD changes
- `build` - Build system

**Examples:**
```
feat: add user login
fix(api): resolve timeout issue
docs: update README
refactor: simplify data processing
BREAKING CHANGE: remove deprecated API
```

## Integration

Add to pre-commit hook:
```bash
#!/bin/sh
python3 /path/to/git-workflow.py pre-commit || exit 1
```
