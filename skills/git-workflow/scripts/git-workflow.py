#!/usr/bin/env python3
"""
Git Workflow Automation - Automate common Git tasks

This script provides Git workflow automation:
1. Generate conventional commit messages
2. Check commit message format
3. Auto-generate CHANGELOG
4. Check branch status
5. Pre-commit checks
"""

import argparse
import json
import re
import subprocess
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional


def run_git_command(args: List[str], cwd: Optional[str] = None) -> tuple:
    """Run a git command and return output."""
    try:
        result = subprocess.run(
            ['git'] + args,
            capture_output=True,
            text=True,
            cwd=cwd,
            check=False
        )
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return 1, '', str(e)


def get_git_root() -> Optional[str]:
    """Get the git repository root directory."""
    code, stdout, _ = run_git_command(['rev-parse', '--show-toplevel'])
    if code == 0:
        return stdout.strip()
    return None


def get_last_commit_message() -> str:
    """Get the last commit message."""
    code, stdout, _ = run_git_command(['log', '-1', '--pretty=%B'])
    return stdout.strip() if code == 0 else ''


def get_commit_history(since: Optional[str] = None, max_count: int = 50) -> List[Dict[str, Any]]:
    """Get commit history with structured data."""
    format_str = '%H|%s|%b|%an|%ae|%ad'
    args = ['log', f'--pretty=format:{format_str}']
    
    if since:
        args.append(f'--since={since}')
    
    args.append(f'-n{max_count}')
    
    code, stdout, _ = run_git_command(args)
    
    if code != 0:
        return []
    
    commits = []
    for line in stdout.strip().split('\n'):
        if '|' in line:
            parts = line.split('|', 5)
            if len(parts) >= 5:
                commits.append({
                    'hash': parts[0],
                    'subject': parts[1],
                    'body': parts[2],
                    'author': parts[3],
                    'email': parts[4],
                    'date': parts[5] if len(parts) > 5 else ''
                })
    
    return commits


def check_commit_format(commit_msg: str) -> Dict[str, Any]:
    """Check if commit message follows conventional commits format."""
    # Conventional commit pattern
    pattern = r'^(feat|fix|docs|style|refactor|test|chore|ci|build|perf)(\(.+\))?!?: .+'
    
    lines = commit_msg.split('\n')
    subject = lines[0] if lines else ''
    
    result = {
        'valid': False,
        'type': None,
        'scope': None,
        'breaking': False,
        'subject': subject,
        'errors': []
    }
    
    match = re.match(pattern, subject)
    if match:
        result['valid'] = True
        result['type'] = match.group(1)
        result['scope'] = match.group(2).strip('()') if match.group(2) else None
        result['breaking'] = '!' in subject or 'BREAKING CHANGE' in commit_msg
    else:
        result['errors'].append('Subject does not follow conventional commit format')
        result['errors'].append('Expected: type(scope)?: subject')
        result['errors'].append('Types: feat, fix, docs, style, refactor, test, chore, ci, build, perf')
    
    # Check subject length
    if len(subject) > 72:
        result['errors'].append(f'Subject too long ({len(subject)} > 72 chars)')
    
    return result


def suggest_commit_message(changes: str) -> List[str]:
    """Suggest commit messages based on changes."""
    suggestions = []
    
    # Analyze changes
    if 'add' in changes.lower() or 'new' in changes.lower():
        suggestions.append('feat: add new feature')
    if 'fix' in changes.lower() or 'bug' in changes.lower():
        suggestions.append('fix: resolve issue')
    if 'update' in changes.lower() or 'modify' in changes.lower():
        suggestions.append('feat: update functionality')
    if 'refactor' in changes.lower() or 'clean' in changes.lower():
        suggestions.append('refactor: improve code structure')
    if 'doc' in changes.lower() or 'readme' in changes.lower():
        suggestions.append('docs: update documentation')
    if 'test' in changes.lower():
        suggestions.append('test: add tests')
    
    if not suggestions:
        suggestions = [
            'feat: implement feature',
            'fix: resolve bug',
            'docs: update documentation',
            'refactor: improve code'
        ]
    
    return suggestions


def generate_changelog(since_tag: Optional[str] = None) -> str:
    """Generate CHANGELOG from commit history."""
    if since_tag:
        commits = get_commit_history(since=f'{since_tag}..HEAD')
    else:
        commits = get_commit_history(max_count=100)
    
    # Categorize commits
    categories = {
        'feat': [],
        'fix': [],
        'docs': [],
        'refactor': [],
        'perf': [],
        'test': [],
        'chore': [],
        'ci': [],
        'build': [],
        'other': []
    }
    
    for commit in commits:
        check = check_commit_format(commit['subject'])
        commit_type = check['type'] if check['valid'] else 'other'
        
        if commit_type in categories:
            categories[commit_type].append(commit)
        else:
            categories['other'].append(commit)
    
    # Generate markdown
    changelog = f"# Changelog\n\n## [{datetime.now().strftime('%Y-%m-%d')}]\n\n"
    
    category_names = {
        'feat': '### Features',
        'fix': '### Bug Fixes',
        'docs': '### Documentation',
        'refactor': '### Refactoring',
        'perf': '### Performance',
        'test': '### Tests',
        'chore': '### Chores',
        'ci': '### CI/CD',
        'build': '### Build',
        'other': '### Other'
    }
    
    for commit_type, commits in categories.items():
        if commits:
            changelog += f"{category_names[commit_type]}\n\n"
            for commit in commits:
                short_hash = commit['hash'][:7]
                subject = commit['subject']
                if ':' in subject:
                    subject = subject.split(':', 1)[1].strip()
                changelog += f"- {subject} ({short_hash})\n"
            changelog += "\n"
    
    return changelog


def check_branch_status() -> Dict[str, Any]:
    """Check current branch status."""
    # Get current branch
    code, branch, _ = run_git_command(['branch', '--show-current'])
    current_branch = branch.strip() if code == 0 else 'unknown'
    
    # Check for uncommitted changes
    code, status, _ = run_git_command(['status', '--porcelain'])
    has_changes = len(status.strip()) > 0
    
    # Get ahead/behind info
    code, ahead_behind, _ = run_git_command(['rev-list', '--left-right', '--count', f'HEAD...origin/{current_branch}'])
    ahead = behind = 0
    if code == 0 and '\t' in ahead_behind:
        parts = ahead_behind.strip().split('\t')
        ahead = int(parts[0]) if len(parts) > 0 else 0
        behind = int(parts[1]) if len(parts) > 1 else 0
    
    return {
        'branch': current_branch,
        'has_uncommitted_changes': has_changes,
        'uncommitted_files': status.strip().split('\n') if has_changes else [],
        'commits_ahead': ahead,
        'commits_behind': behind,
        'needs_pull': behind > 0,
        'needs_push': ahead > 0
    }


def pre_commit_check() -> Dict[str, Any]:
    """Run pre-commit checks."""
    results = {
        'passed': True,
        'checks': []
    }
    
    # Check 1: Commit message format
    last_msg = get_last_commit_message()
    format_check = check_commit_format(last_msg)
    results['checks'].append({
        'name': 'Commit message format',
        'passed': format_check['valid'],
        'message': 'Valid' if format_check['valid'] else 'Invalid format'
    })
    if not format_check['valid']:
        results['passed'] = False
    
    # Check 2: No large files
    code, files, _ = run_git_command(['diff', '--cached', '--name-only', '--diff-filter=A'])
    if code == 0:
        large_files = []
        for f in files.strip().split('\n'):
            if f:
                try:
                    size = Path(f).stat().st_size
                    if size > 10 * 1024 * 1024:  # 10MB
                        large_files.append(f)
                except:
                    pass
        
        results['checks'].append({
            'name': 'No large files',
            'passed': len(large_files) == 0,
            'message': f'{len(large_files)} large files' if large_files else 'OK'
        })
        if large_files:
            results['passed'] = False
    
    return results


def main():
    parser = argparse.ArgumentParser(description='Git Workflow Automation')
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Check commit format
    check_parser = subparsers.add_parser('check-commit', help='Check commit message format')
    check_parser.add_argument('-m', '--message', help='Commit message to check')
    
    # Suggest commit message
    suggest_parser = subparsers.add_parser('suggest', help='Suggest commit messages')
    suggest_parser.add_argument('changes', help='Description of changes')
    
    # Generate changelog
    changelog_parser = subparsers.add_parser('changelog', help='Generate CHANGELOG')
    changelog_parser.add_argument('-t', '--tag', help='Generate since tag')
    changelog_parser.add_argument('-o', '--output', help='Output file')
    
    # Check branch status
    subparsers.add_parser('status', help='Check branch status')
    
    # Pre-commit check
    subparsers.add_parser('pre-commit', help='Run pre-commit checks')
    
    args = parser.parse_args()
    
    # Check if in git repo
    if not get_git_root():
        print(json.dumps({'error': 'Not in a git repository'}))
        return
    
    if args.command == 'check-commit':
        msg = args.message if args.message else get_last_commit_message()
        result = check_commit_format(msg)
        print(json.dumps(result, indent=2))
    
    elif args.command == 'suggest':
        suggestions = suggest_commit_message(args.changes)
        print(json.dumps({'suggestions': suggestions}, indent=2))
    
    elif args.command == 'changelog':
        changelog = generate_changelog(args.tag)
        if args.output:
            Path(args.output).write_text(changelog, encoding='utf-8')
            print(f"CHANGELOG written to {args.output}")
        else:
            print(changelog)
    
    elif args.command == 'status':
        status = check_branch_status()
        print(json.dumps(status, indent=2))
    
    elif args.command == 'pre-commit':
        results = pre_commit_check()
        print(json.dumps(results, indent=2))
        if not results['passed']:
            exit(1)
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
