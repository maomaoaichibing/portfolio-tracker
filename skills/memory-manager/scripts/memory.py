#!/usr/bin/env python3
"""
Memory Manager - Local file-based memory search and management

This script provides semantic-like search over memory files without requiring API keys.
Uses keyword matching, date filtering, and file metadata to find relevant memories.
"""

import argparse
import json
import re
import os
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

MEMORY_DIR = Path("/root/.openclaw/workspace/memory")
MEMORY_FILE = Path("/root/.openclaw/workspace/MEMORY.md")


def extract_keywords(query: str) -> List[str]:
    """Extract meaningful keywords from a query."""
    # Remove common stop words
    stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
                  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                  'would', 'could', 'should', 'may', 'might', 'must', 'shall',
                  'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
                  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
                  'through', 'during', 'before', 'after', 'above', 'below',
                  'between', 'under', 'and', 'but', 'or', 'yet', 'so', 'if',
                  'because', 'although', 'though', 'while', 'where', 'when',
                  'that', 'which', 'who', 'whom', 'whose', 'what', 'this',
                  'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
                  'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its',
                  'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs'}
    
    words = re.findall(r'\b[a-zA-Z]+\b', query.lower())
    return [w for w in words if w not in stop_words and len(w) > 2]


def score_content(content: str, keywords: List[str]) -> float:
    """Score content based on keyword matches."""
    content_lower = content.lower()
    score = 0.0
    
    for keyword in keywords:
        # Exact match gets higher score
        if keyword in content_lower:
            count = content_lower.count(keyword)
            # Title/heading matches get bonus
            if re.search(rf'^#+\s.*{keyword}', content, re.MULTILINE | re.IGNORECASE):
                score += count * 3.0
            # Bullet point matches get bonus
            elif re.search(rf'^\s*[-*]\s.*{keyword}', content, re.MULTILINE | re.IGNORECASE):
                score += count * 2.0
            else:
                score += count * 1.0
    
    return score


def search_memory_files(query: str, max_results: int = 5, days: Optional[int] = None, use_regex: bool = False, tags: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Search through memory files for relevant content.
    
    Args:
        query: Search query string
        max_results: Maximum number of results to return
        days: Limit to last N days
        use_regex: Whether to treat query as regex pattern
        tags: List of tags to filter by (matches #tag or [tag] format)
    """
    results = []
    
    # Determine date range if specified
    cutoff_date = None
    if days:
        cutoff_date = datetime.now() - timedelta(days=days)
    
    # Compile regex if needed
    pattern = None
    if use_regex:
        try:
            pattern = re.compile(query, re.IGNORECASE)
        except re.error:
            # Fall back to normal search if regex is invalid
            use_regex = False
    
    # Extract keywords for normal search
    if not use_regex:
        keywords = extract_keywords(query)
        if not keywords:
            keywords = [query.lower()]
    
    # Search daily memory files
    if MEMORY_DIR.exists():
        for mem_file in sorted(MEMORY_DIR.glob("*.md"), reverse=True):
            # Parse date from filename
            try:
                file_date = datetime.strptime(mem_file.stem, "%Y-%m-%d")
                if cutoff_date and file_date < cutoff_date:
                    continue
            except ValueError:
                continue
            
            content = mem_file.read_text(encoding='utf-8')
            
            # Check tags if specified
            if tags and not has_tags(content, tags):
                continue
            
            # Score content
            if use_regex:
                score = score_content_regex(content, pattern)
            else:
                score = score_content(content, keywords)
            
            if score > 0:
                # Extract relevant snippets
                if use_regex:
                    snippets = extract_snippets_regex(content, pattern)
                else:
                    snippets = extract_snippets(content, keywords)
                
                results.append({
                    'path': str(mem_file),
                    'date': mem_file.stem,
                    'score': score,
                    'snippets': snippets[:3]
                })
    
    # Search main MEMORY.md
    if MEMORY_FILE.exists():
        content = MEMORY_FILE.read_text(encoding='utf-8')
        
        # Check tags if specified
        if tags and not has_tags(content, tags):
            pass  # Skip if doesn't have required tags
        else:
            if use_regex:
                score = score_content_regex(content, pattern)
            else:
                score = score_content(content, keywords)
            
            if score > 0:
                if use_regex:
                    snippets = extract_snippets_regex(content, pattern)
                else:
                    snippets = extract_snippets(content, keywords)
                
                results.append({
                    'path': str(MEMORY_FILE),
                    'date': 'long-term',
                    'score': score * 1.5,
                    'snippets': snippets[:3]
                })
    
    # Sort by score and return top results
    results.sort(key=lambda x: x['score'], reverse=True)
    return results[:max_results]


def has_tags(content: str, tags: List[str]) -> bool:
    """Check if content has any of the specified tags.
    
    Tags can be in format:
    - #tag
    - [tag]
    - [[tag]]
    - tag: (at start of line)
    """
    content_lower = content.lower()
    
    for tag in tags:
        tag_lower = tag.lower()
        # Check various tag formats
        if f'#{tag_lower}' in content_lower:
            return True
        if f'[{tag_lower}]' in content_lower:
            return True
        if f'[[{tag_lower}]]' in content_lower:
            return True
        if re.search(rf'^\s*{re.escape(tag_lower)}\s*:', content_lower, re.MULTILINE):
            return True
    
    return False


def score_content_regex(content: str, pattern: re.Pattern) -> float:
    """Score content based on regex pattern matches."""
    matches = list(pattern.finditer(content))
    if not matches:
        return 0.0
    
    score = len(matches) * 2.0
    
    # Bonus for matches in titles/headings
    for match in matches:
        line_start = content.rfind('\n', 0, match.start()) + 1
        line = content[line_start:match.end()]
        if line.startswith('#'):
            score += 3.0
        elif line.strip().startswith(('- ', '* ', '+ ')):
            score += 1.5
    
    return score


def extract_snippets_regex(content: str, pattern: re.Pattern, context_lines: int = 2) -> List[str]:
    """Extract relevant snippets around regex matches."""
    snippets = []
    lines = content.split('\n')
    
    for match in pattern.finditer(content):
        # Find which line the match is on
        line_num = content[:match.start()].count('\n')
        
        # Get context around the match
        start = max(0, line_num - context_lines)
        end = min(len(lines), line_num + context_lines + 1)
        snippet = '\n'.join(lines[start:end])
        snippets.append(snippet)
    
    # Remove duplicates while preserving order
    seen = set()
    unique_snippets = []
    for s in snippets:
        if s not in seen:
            seen.add(s)
            unique_snippets.append(s)
    
    return unique_snippets


def extract_snippets(content: str, keywords: List[str], context_lines: int = 2) -> List[str]:
    """Extract relevant snippets around keyword matches."""
    snippets = []
    lines = content.split('\n')
    
    for i, line in enumerate(lines):
        line_lower = line.lower()
        for keyword in keywords:
            if keyword in line_lower:
                # Get context around the match
                start = max(0, i - context_lines)
                end = min(len(lines), i + context_lines + 1)
                snippet = '\n'.join(lines[start:end])
                snippets.append(snippet)
                break  # Only one snippet per line
    
    # Remove duplicates while preserving order
    seen = set()
    unique_snippets = []
    for s in snippets:
        if s not in seen:
            seen.add(s)
            unique_snippets.append(s)
    
    return unique_snippets


def list_memories(days: Optional[int] = None) -> List[Dict[str, Any]]:
    """List all memory files with metadata."""
    memories = []
    
    # List daily memories
    if MEMORY_DIR.exists():
        for mem_file in sorted(MEMORY_DIR.glob("*.md"), reverse=True):
            try:
                file_date = datetime.strptime(mem_file.stem, "%Y-%m-%d")
                if days:
                    cutoff = datetime.now() - timedelta(days=days)
                    if file_date < cutoff:
                        continue
                
                stat = mem_file.stat()
                memories.append({
                    'path': str(mem_file),
                    'date': mem_file.stem,
                    'size': stat.st_size,
                    'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
            except ValueError:
                continue
    
    # Add main MEMORY.md
    if MEMORY_FILE.exists():
        stat = MEMORY_FILE.stat()
        memories.append({
            'path': str(MEMORY_FILE),
            'date': 'long-term',
            'size': stat.st_size,
            'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
        })
    
    return memories


def get_memory_content(path: str, from_line: int = 1, lines: Optional[int] = None) -> Dict[str, Any]:
    """Get content from a specific memory file."""
    file_path = Path(path)
    if not file_path.exists():
        return {'error': f'File not found: {path}'}
    
    content = file_path.read_text(encoding='utf-8')
    all_lines = content.split('\n')
    
    # Calculate slice
    start = from_line - 1
    end = len(all_lines) if lines is None else start + lines
    
    selected_lines = all_lines[start:end]
    
    return {
        'path': path,
        'from_line': from_line,
        'total_lines': len(all_lines),
        'content': '\n'.join(selected_lines)
    }


def main():
    parser = argparse.ArgumentParser(description='Memory Manager - Search and retrieve memories')
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Search command
    search_parser = subparsers.add_parser('search', help='Search memories')
    search_parser.add_argument('query', help='Search query')
    search_parser.add_argument('-n', '--max-results', type=int, default=5, help='Maximum results')
    search_parser.add_argument('-d', '--days', type=int, help='Limit to last N days')
    search_parser.add_argument('-r', '--regex', action='store_true', help='Use regex search')
    search_parser.add_argument('-t', '--tags', help='Filter by tags (comma-separated)')
    search_parser.add_argument('-j', '--json', action='store_true', help='Output as JSON')
    
    # List command
    list_parser = subparsers.add_parser('list', help='List all memories')
    list_parser.add_argument('-d', '--days', type=int, help='Limit to last N days')
    list_parser.add_argument('-j', '--json', action='store_true', help='Output as JSON')
    
    # Get command
    get_parser = subparsers.add_parser('get', help='Get memory content')
    get_parser.add_argument('path', help='Path to memory file')
    get_parser.add_argument('-f', '--from-line', type=int, default=1, help='Start line')
    get_parser.add_argument('-l', '--lines', type=int, help='Number of lines to read')
    get_parser.add_argument('-j', '--json', action='store_true', help='Output as JSON')
    
    args = parser.parse_args()
    
    if args.command == 'search':
        tags = args.tags.split(',') if args.tags else None
        results = search_memory_files(args.query, args.max_results, args.days, args.regex, tags)
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            print(f"Search results for: '{args.query}'")
            if args.regex:
                print("(Regex mode enabled)")
            if tags:
                print(f"(Tags: {', '.join(tags)})")
            print("=" * 50)
            for r in results:
                print(f"\n📄 {r['path']} (score: {r['score']:.1f})")
                print("-" * 40)
                for snippet in r['snippets']:
                    print(snippet)
                    print("...")
    
    elif args.command == 'list':
        memories = list_memories(args.days)
        if args.json:
            print(json.dumps(memories, indent=2))
        else:
            print("Memory files:")
            print("=" * 50)
            for m in memories:
                size_kb = m['size'] / 1024
                print(f"📄 {m['date']}: {size_kb:.1f} KB - {m['path']}")
    
    elif args.command == 'get':
        result = get_memory_content(args.path, args.from_line, args.lines)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            if 'error' in result:
                print(f"Error: {result['error']}")
            else:
                print(f"📄 {result['path']} (lines {result['from_line']}-{result['from_line'] + len(result['content'].split(chr(10))) - 1} of {result['total_lines']})")
                print("=" * 50)
                print(result['content'])
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
