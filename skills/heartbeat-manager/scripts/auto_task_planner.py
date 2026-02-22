#!/usr/bin/env python3
"""
Auto-Task Planner - 自动任务规划系统

当用户3小时内没有给出新任务时，自动规划并执行：
1. 完善现有系统
2. 优化智投应用
3. 开发新功能/应用
"""

import json
import random
from datetime import datetime, timedelta
from pathlib import Path

# 任务池
TASK_CATEGORIES = {
    "system_optimization": {
        "name": "系统优化",
        "tasks": [
            "优化数据库查询性能",
            "添加API速率限制",
            "完善错误处理和日志",
            "优化内存使用",
            "添加健康检查端点",
            "完善配置文件管理",
            "添加性能监控",
            "优化前端加载速度",
            "添加缓存机制",
            "完善安全策略"
        ]
    },
    "portfolio_tracker": {
        "name": "智投应用优化",
        "tasks": [
            "添加更多技术指标分析",
            "优化AI分析算法",
            "添加回测功能",
            "完善新闻情绪分析",
            "添加更多数据源",
            "优化前端界面",
            "添加数据导出功能",
            "完善提醒机制",
            "添加投资组合对比",
            "优化微信小程序"
        ]
    },
    "new_features": {
        "name": "新功能开发",
        "tasks": [
            "开发定时任务管理界面",
            "添加系统监控仪表盘",
            "开发API文档自动生成",
            "添加数据可视化组件",
            "开发配置管理工具",
            "添加日志分析功能",
            "开发测试自动化工具",
            "添加性能分析工具"
        ]
    },
    "new_application": {
        "name": "新应用开发",
        "tasks": [
            "开发个人知识库应用",
            "开发任务管理系统",
            "开发笔记应用",
            "开发文档管理工具",
            "开发日历提醒应用",
            "开发文件同步工具"
        ]
    }
}


def get_last_task_time():
    """获取最后一个任务的时间"""
    try:
        # 检查 memory 中的最新记录
        memory_dir = Path("/root/.openclaw/workspace/memory")
        if not memory_dir.exists():
            return None
        
        latest_file = None
        latest_time = None
        
        for f in memory_dir.glob("*.md"):
            if f.stat().st_mtime > (latest_time or 0):
                latest_time = f.stat().st_mtime
                latest_file = f
        
        if latest_time:
            return datetime.fromtimestamp(latest_time)
    except Exception as e:
        print(f"获取最后任务时间失败: {e}")
    
    return None


def check_idle_time():
    """检查空闲时间是否超过3小时"""
    last_time = get_last_task_time()
    if not last_time:
        return True, None
    
    now = datetime.now()
    idle_time = now - last_time
    
    return idle_time > timedelta(hours=3), idle_time


def select_task_category():
    """选择任务类别（加权随机）"""
    # 优先选择智投应用优化
    weights = {
        "portfolio_tracker": 0.4,
        "system_optimization": 0.3,
        "new_features": 0.2,
        "new_application": 0.1
    }
    
    categories = list(weights.keys())
    weights_list = [weights[c] for c in categories]
    
    selected = random.choices(categories, weights=weights_list, k=1)[0]
    return selected


def generate_task():
    """生成一个自动任务"""
    category_key = select_task_category()
    category = TASK_CATEGORIES[category_key]
    
    task_name = random.choice(category["tasks"])
    
    return {
        "category": category["name"],
        "category_key": category_key,
        "task": task_name,
        "priority": random.choice(["high", "medium", "low"]),
        "estimated_hours": random.randint(1, 4),
        "created_at": datetime.now().isoformat()
    }


def save_auto_task(task):
    """保存自动生成的任务"""
    task_file = Path("/root/.openclaw/workspace/.auto_tasks.json")
    
    tasks = []
    if task_file.exists():
        with open(task_file, 'r', encoding='utf-8') as f:
            tasks = json.load(f)
    
    tasks.append(task)
    
    # 只保留最近20个任务
    tasks = tasks[-20:]
    
    with open(task_file, 'w', encoding='utf-8') as f:
        json.dump(tasks, f, indent=2, ensure_ascii=False)
    
    return task_file


def get_pending_auto_tasks():
    """获取待执行的自动任务"""
    task_file = Path("/root/.openclaw/workspace/.auto_tasks.json")
    
    if not task_file.exists():
        return []
    
    with open(task_file, 'r', encoding='utf-8') as f:
        tasks = json.load(f)
    
    # 返回未完成的任务（简化：返回最近3个）
    return tasks[-3:]


def should_generate_new_task():
    """判断是否应该生成新任务"""
    is_idle, idle_time = check_idle_time()
    
    if not is_idle:
        return False, f"空闲时间 {idle_time.total_seconds()/3600:.1f} 小时，未达到3小时阈值"
    
    # 检查是否已有待执行的自动任务
    pending = get_pending_auto_tasks()
    if len(pending) >= 3:
        return False, f"已有 {len(pending)} 个待执行自动任务"
    
    return True, f"空闲时间 {idle_time.total_seconds()/3600:.1f} 小时，达到阈值"


def main():
    """主函数"""
    should_generate, reason = should_generate_new_task()
    
    if not should_generate:
        print(f"跳过自动生成任务: {reason}")
        return {
            "action": "skip",
            "reason": reason
        }
    
    # 生成新任务
    task = generate_task()
    save_auto_task(task)
    
    print(f"已生成自动任务: [{task['category']}] {task['task']}")
    print(f"优先级: {task['priority']}, 预估耗时: {task['estimated_hours']}小时")
    
    return {
        "action": "generate",
        "task": task,
        "message": f"检测到3小时无新任务，已自动规划：\n\n**类别**: {task['category']}\n**任务**: {task['task']}\n**优先级**: {task['priority']}\n**预估耗时**: {task['estimated_hours']}小时\n\n是否开始执行？"
    }


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2, ensure_ascii=False))
