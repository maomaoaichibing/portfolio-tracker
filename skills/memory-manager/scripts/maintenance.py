#!/usr/bin/env python3
"""
Memory Maintenance - Automated memory cleanup and organization

This script helps maintain the memory system by:
1. Archiving old daily memories
2. Consolidating related memories into MEMORY.md
3. Cleaning up empty or redundant files
"""

import argparse
import json
import re
import shutil
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

MEMORY_DIR = Path("/root/.openclaw/workspace/memory")
MEMORY_FILE = Path("/root/.openclaw/workspace/MEMORY.md")
ARCHIVE_DIR = Path("/root/.openclaw/workspace/memory/archive")


def get_memory_files() -> List[Path]:
    """Get all daily memory files sorted by date."""
    if not MEMORY_DIR.exists():
        return []
    files = []
    for f in MEMORY_DIR.glob("*.md"):
        try:
            datetime.strptime(f.stem, "%Y-%m-%d")
            files.append(f)
        except ValueError:
            continue
    return sorted(files)


def archive_old_memories(days: int = 30, dry_run: bool = True) -> Dict[str, Any]:
    """Archive memories older than N days."""
    cutoff = datetime.now() - timedelta(days=days)
    files = get_memory_files()
    
    to_archive = []
    for f in files:
        file_date = datetime.strptime(f.stem, "%Y-%m-%d")
        if file_date < cutoff:
            to_archive.append(f)
    
    if not dry_run and to_archive:
        ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
        for f in to_archive:
            dest = ARCHIVE_DIR / f.name
            shutil.move(str(f), str(dest))
    
    return {
        'archived_count': len(to_archive),
        'archived_files': [str(f) for f in to_archive],
        'dry_run': dry_run
    }


def extract_key_memories(file_path: Path) -> List[str]:
    """Extract key memories from a daily file."""
    content = file_path.read_text(encoding='utf-8')
    key_memories = []
    
    # Look for important markers
    important_patterns = [
        r'^#+\s*(Decision|决定|重要|Important|Key|关键)',
        r'^#+\s*(Lesson|教训|Learned|学到)',
        r'^#+\s*(Milestone|里程碑|Achievement|成就)',
        r'^\s*[-*]\s*\[IMPORTANT\]',
        r'^\s*[-*]\s*\[KEY\]',
    ]
    
    lines = content.split('\n')
    for i, line in enumerate(lines):
        for pattern in important_patterns:
            if re.search(pattern, line, re.IGNORECASE):
                # Get the next few lines as context
                context = '\n'.join(lines[i:min(i+5, len(lines))])
                key_memories.append(context)
                break
    
    return key_memories


def consolidate_to_longterm(days: int = 7, dry_run: bool = True) -> Dict[str, Any]:
    """Consolidate recent memories into MEMORY.md."""
    cutoff = datetime.now() - timedelta(days=days)
    files = get_memory_files()
    
    recent_memories = []
    for f in files:
        file_date = datetime.strptime(f.stem, "%Y-%m-%d")
        if file_date >= cutoff:
            key_memories = extract_key_memories(f)
            if key_memories:
                recent_memories.append({
                    'date': f.stem,
                    'memories': key_memories
                })
    
    if not dry_run and recent_memories:
        # Append to MEMORY.md
        with open(MEMORY_FILE, 'a', encoding='utf-8') as f:
            f.write(f"\n\n## Consolidated from daily notes ({datetime.now().strftime('%Y-%m-%d')})\n\n")
            for entry in recent_memories:
                f.write(f"### {entry['date']}\n\n")
                for memory in entry['memories']:
                    f.write(memory + '\n\n')
    
    return {
        'consolidated_count': len(recent_memories),
        'entries': recent_memories,
        'dry_run': dry_run
    }


def cleanup_empty_files(dry_run: bool = True) -> Dict[str, Any]:
    """Remove empty or near-empty memory files."""
    files = get_memory_files()
    to_remove = []
    
    for f in files:
        content = f.read_text(encoding='utf-8').strip()
        # Consider empty if less than 50 chars or just whitespace/headers
        if len(content) < 50 or not re.search(r'[a-zA-Z\u4e00-\u9fff]{10,}', content):
            to_remove.append(f)
    
    if not dry_run:
        for f in to_remove:
            f.unlink()
    
    return {
        'removed_count': len(to_remove),
        'removed_files': [str(f) for f in to_remove],
        'dry_run': dry_run
    }


def get_stats() -> Dict[str, Any]:
    """Get memory system statistics."""
    files = get_memory_files()
    total_size = sum(f.stat().st_size for f in files)
    
    # Count by month
    by_month = {}
    for f in files:
        month = f.stem[:7]  # YYYY-MM
        by_month[month] = by_month.get(month, 0) + 1
    
    return {
        'total_files': len(files),
        'total_size_bytes': total_size,
        'total_size_kb': round(total_size / 1024, 2),
        'by_month': by_month,
        'memory_dir_exists': MEMORY_DIR.exists(),
        'memory_file_exists': MEMORY_FILE.exists()
    }


def main():
    parser = argparse.ArgumentParser(description='Memory Maintenance - Cleanup and organization')
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Archive command
    archive_parser = subparsers.add_parser('archive', help='Archive old memories')
    archive_parser.add_argument('-d', '--days', type=int, default=30, help='Archive memories older than N days')
    archive_parser.add_argument('--execute', action='store_true', help='Actually perform archive (default is dry-run)')
    
    # Consolidate command
    consolidate_parser = subparsers.add_parser('consolidate', help='Consolidate memories to long-term')
    consolidate_parser.add_argument('-d', '--days', type=int, default=7, help='Consolidate last N days')
    consolidate_parser.add_argument('--execute', action='store_true', help='Actually perform consolidation')
    
    # Cleanup command
    cleanup_parser = subparsers.add_parser('cleanup', help='Remove empty files')
    cleanup_parser.add_argument('--execute', action='store_true', help='Actually perform cleanup')
    
    # Stats command
    subparsers.add_parser('stats', help='Show memory statistics')
    
    # Full maintenance command
    maintenance_parser = subparsers.add_parser('maintenance', help='Run full maintenance')
    maintenance_parser.add_argument('--execute', action='store_true', help='Actually perform maintenance')
    
    # Auto-archive command (for cron)
    auto_archive_parser = subparsers.add_parser('auto-archive', help='Auto-archive old memories (for cron)')
    auto_archive_parser.add_argument('--days', type=int, default=30, help='Archive memories older than N days')
    auto_archive_parser.add_argument('--consolidate-days', type=int, default=7, help='Consolidate memories from last N days')
    
    args = parser.parse_args()
    
    if args.command == 'archive':
        result = archive_old_memories(args.days, dry_run=not args.execute)
        print(json.dumps(result, indent=2))
    
    elif args.command == 'consolidate':
        result = consolidate_to_longterm(args.days, dry_run=not args.execute)
        print(json.dumps(result, indent=2))
    
    elif args.command == 'cleanup':
        result = cleanup_empty_files(dry_run=not args.execute)
        print(json.dumps(result, indent=2))
    
    elif args.command == 'stats':
        stats = get_stats()
        print(json.dumps(stats, indent=2))
    
    elif args.command == 'maintenance':
        dry_run = not args.execute
        print("Running full maintenance...")
        print("\n1. Archiving old memories (>30 days):")
        print(json.dumps(archive_old_memories(30, dry_run), indent=2))
        print("\n2. Consolidating recent memories (last 7 days):")
        print(json.dumps(consolidate_to_longterm(7, dry_run), indent=2))
        print("\n3. Cleaning up empty files:")
        print(json.dumps(cleanup_empty_files(dry_run), indent=2))
        print("\n4. Final stats:")
        print(json.dumps(get_stats(), indent=2))
        if dry_run:
            print("\n⚠️  This was a dry run. Use --execute to actually perform changes.")
    
    elif args.command == 'auto-archive':
        # Auto-archive for cron - always execute
        print(f"[{datetime.now().isoformat()}] Running auto-archive...")
        
        # Step 1: Archive old memories
        archive_result = archive_old_memories(args.days, dry_run=False)
        print(f"Archived: {archive_result['archived_count']} files")
        
        # Step 2: Consolidate recent memories
        consolidate_result = consolidate_to_longterm(args.consolidate_days, dry_run=False)
        print(f"Consolidated: {consolidate_result['consolidated_count']} entries")
        
        # Step 3: Cleanup empty files
        cleanup_result = cleanup_empty_files(dry_run=False)
        print(f"Cleaned up: {cleanup_result['removed_count']} files")
        
        # Final stats
        stats = get_stats()
        print(f"\nMemory stats: {stats['total_files']} files, {stats['total_size_kb']:.1f} KB")
        print("Auto-archive completed.")
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
