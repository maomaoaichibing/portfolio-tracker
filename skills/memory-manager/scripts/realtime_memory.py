#!/usr/bin/env python3
"""
实时记忆更新系统
在每次重要对话后自动更新记忆文件
"""

import re
import os
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

MEMORY_DIR = Path("/root/.openclaw/workspace/memory")
MEMORY_FILE = Path("/root/.openclaw/workspace/MEMORY.md")


def ensure_memory_dir():
    """确保记忆目录存在"""
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)


def get_today_file() -> Path:
    """获取今天的记忆文件路径"""
    today = datetime.now().strftime('%Y-%m-%d')
    return MEMORY_DIR / f"{today}.md"


def extract_key_info(content: str) -> List[Dict[str, Any]]:
    """从对话内容中提取关键信息"""
    key_info = []
    
    # 提取完成的任务
    task_patterns = [
        r'完成.*?任务',
        r'已.*?实现',
        r'已.*?添加',
        r'已.*?修复',
        r'已.*?创建',
        r'已.*?开发',
        r'✅.*?完成',
    ]
    for pattern in task_patterns:
        matches = re.findall(pattern, content)
        for match in matches:
            key_info.append({'type': 'completed_task', 'content': match})
    
    # 提取重要决定
    decision_patterns = [
        r'决定.*?：',
        r'选择.*?：',
        r'确定.*?：',
        r'采用.*?：',
        r'使用.*?：',
    ]
    for pattern in decision_patterns:
        matches = re.findall(pattern + r'.{0,50}', content)
        for match in matches:
            key_info.append({'type': 'decision', 'content': match})
    
    # 提取新增功能
    feature_patterns = [
        r'新增.*?功能',
        r'添加.*?API',
        r'实现.*?功能',
        r'开发.*?模块',
    ]
    for pattern in feature_patterns:
        matches = re.findall(pattern, content)
        for match in matches:
            key_info.append({'type': 'new_feature', 'content': match})
    
    # 提取问题/错误
    error_patterns = [
        r'错误：',
        r'问题：',
        r'失败：',
        r'bug：',
        r'异常：',
    ]
    for pattern in error_patterns:
        if pattern in content:
            # 提取错误信息
            start = content.find(pattern)
            end = content.find('\n', start)
            if end == -1:
                end = len(content)
            error_msg = content[start:end].strip()
            key_info.append({'type': 'error', 'content': error_msg})
    
    return key_info


def update_daily_memory(content: str, source: str = "conversation"):
    """更新今日记忆文件"""
    ensure_memory_dir()
    
    today_file = get_today_file()
    timestamp = datetime.now().strftime('%H:%M')
    
    # 提取关键信息
    key_info = extract_key_info(content)
    
    # 准备记忆条目
    entry = f"\n## [{timestamp}] {source}\n\n"
    
    if key_info:
        entry += "**关键信息：**\n"
        for info in key_info[:5]:  # 最多记录5条
            entry += f"- [{info['type']}] {info['content']}\n"
        entry += "\n"
    
    # 添加摘要（限制长度）
    summary = content[:500] + "..." if len(content) > 500 else content
    entry += f"**摘要：** {summary}\n"
    
    # 写入文件
    if today_file.exists():
        with open(today_file, 'a', encoding='utf-8') as f:
            f.write(entry)
    else:
        # 创建新文件
        header = f"# {datetime.now().strftime('%Y-%m-%d')} 记忆\n\n"
        with open(today_file, 'w', encoding='utf-8') as f:
            f.write(header + entry)
    
    return today_file


def update_long_term_memory(key_facts: List[str]):
    """更新长期记忆（MEMORY.md）"""
    if not key_facts:
        return
    
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')
    
    entry = f"\n## 自动记录 [{timestamp}]\n\n"
    for fact in key_facts:
        entry += f"- {fact}\n"
    
    if MEMORY_FILE.exists():
        with open(MEMORY_FILE, 'a', encoding='utf-8') as f:
            f.write(entry)
    else:
        header = "# MEMORY.md - Long-term Memory\n\n"
        with open(MEMORY_FILE, 'w', encoding='utf-8') as f:
            f.write(header + entry)


def record_task_completion(task_name: str, details: str = ""):
    """记录任务完成"""
    content = f"完成任务：{task_name}"
    if details:
        content += f"\n详情：{details}"
    
    update_daily_memory(content, "task_completion")
    
    # 同时更新长期记忆
    update_long_term_memory([f"完成任务：{task_name}"])


def record_decision(decision: str, reason: str = ""):
    """记录重要决定"""
    content = f"决定：{decision}"
    if reason:
        content += f"\n原因：{reason}"
    
    update_daily_memory(content, "decision")
    update_long_term_memory([f"决定：{decision}"])


def record_feature(feature_name: str, description: str = ""):
    """记录新增功能"""
    content = f"新增功能：{feature_name}"
    if description:
        content += f"\n描述：{description}"
    
    update_daily_memory(content, "new_feature")
    update_long_term_memory([f"新增功能：{feature_name}"])


def record_error(error_msg: str, context: str = ""):
    """记录错误/问题"""
    content = f"错误：{error_msg}"
    if context:
        content += f"\n上下文：{context}"
    
    update_daily_memory(content, "error")


def get_recent_memories(hours: int = 24) -> List[Dict[str, Any]]:
    """获取最近N小时的记忆"""
    memories = []
    now = datetime.now()
    
    # 检查今天的文件
    today_file = get_today_file()
    if today_file.exists():
        with open(today_file, 'r', encoding='utf-8') as f:
            content = f.read()
            memories.append({
                'date': datetime.now().strftime('%Y-%m-%d'),
                'content': content
            })
    
    # 检查昨天的文件
    yesterday = (now - timedelta(days=1)).strftime('%Y-%m-%d')
    yesterday_file = MEMORY_DIR / f"{yesterday}.md"
    if yesterday_file.exists():
        with open(yesterday_file, 'r', encoding='utf-8') as f:
            content = f.read()
            memories.append({
                'date': yesterday,
                'content': content
            })
    
    return memories


def get_context_for_query(query: str) -> str:
    """为查询获取相关上下文"""
    memories = get_recent_memories(48)  # 最近48小时
    
    if not memories:
        return ""
    
    context_parts = []
    for mem in memories:
        context_parts.append(f"## {mem['date']}\n{mem['content'][:2000]}")
    
    return "\n\n".join(context_parts)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        action = sys.argv[1]
        
        if action == "record-task" and len(sys.argv) > 2:
            record_task_completion(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "")
            print(f"✅ 已记录任务完成：{sys.argv[2]}")
        
        elif action == "record-decision" and len(sys.argv) > 2:
            record_decision(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "")
            print(f"✅ 已记录决定：{sys.argv[2]}")
        
        elif action == "record-feature" and len(sys.argv) > 2:
            record_feature(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "")
            print(f"✅ 已记录功能：{sys.argv[2]}")
        
        elif action == "recent":
            memories = get_recent_memories()
            for mem in memories:
                print(f"\n{'='*50}")
                print(f"日期：{mem['date']}")
                print(f"{'='*50}")
                print(mem['content'][:1000])
        
        else:
            print("用法：")
            print("  python3 realtime_memory.py record-task '任务名称' [详情]")
            print("  python3 realtime_memory.py record-decision '决定内容' [原因]")
            print("  python3 realtime_memory.py record-feature '功能名称' [描述]")
            print("  python3 realtime_memory.py recent")
    else:
        print("请指定操作：record-task, record-decision, record-feature, recent")
