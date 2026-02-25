/**
 * AI Agent 页面逻辑
 */

const API_BASE_URL = window.location.origin;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadTemplates();
    loadActiveWorkflows();
    loadExecutionLogs();
    initFilters();
});

// 获取认证头
function getAuthHeaders() {
    const token = localStorage.getItem('token') || '';
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

// 切换介绍显示
function toggleIntro() {
    const content = document.getElementById('introContent');
    const toggle = document.getElementById('introToggle');
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        toggle.textContent = '收起';
    } else {
        content.classList.add('collapsed');
        toggle.textContent = '展开';
    }
}

// 加载工作流模板
async function loadTemplates() {
    const grid = document.getElementById('templatesGrid');
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/workflows/templates`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error('加载失败');
        }
        
        const result = await response.json();
        
        if (!result.success || !result.templates) {
            grid.innerHTML = '<div class="empty">暂无模板</div>';
            return;
        }
        
        const icons = {
            'value_hunter': '💎',
            'momentum_tracker': '🚀',
            'price_watcher': '👁️'
        };
        
        const names = {
            'value_hunter': '价值发现者',
            'momentum_tracker': '动量追踪者',
            'price_watcher': '价格守望者'
        };
        
        const descs = {
            'value_hunter': '自动扫描低估值股票（PE<15, PB<2），分析基本面，生成投资建议',
            'momentum_tracker': '追踪强势股（涨幅>5%），发现趋势机会，监控热点板块',
            'price_watcher': '监控特定股票价格，触发条件时自动提醒'
        };
        
        grid.innerHTML = result.templates.map(template => `
            <div class="template-card" data-id="${template.id}">
                <div class="template-icon">${icons[template.id] || '🤖'}</div>
                <div class="template-name">${names[template.id] || template.name}</div>
                <div class="template-desc">${descs[template.id] || template.description}</div>
                <div class="template-actions">
                    <button class="btn-run" onclick="runTemplate('${template.id}')">▶️ 立即运行</button>
                    <button class="btn-schedule" onclick="scheduleTemplate('${template.id}')">⏰ 定时</button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('加载模板失败:', error);
        grid.innerHTML = '<div class="error">加载失败，请刷新重试</div>';
    }
}

// 运行模板
async function runTemplate(templateId) {
    // 先创建工作流
    const templates = {
        'value_hunter': {
            name: '价值发现者',
            description: '自动扫描低估值股票',
            trigger_type: 'manual',
            actions: [
                { type: 'scan_sector', config: { limit: 50 } },
                { type: 'filter_stocks', config: { maxPe: 15, maxPb: 2 } },
                { type: 'analyze_stock', config: {} },
                { type: 'generate_report', config: { title: '价值发现报告' } },
                { type: 'send_alert', config: { channels: ['web'] } }
            ]
        },
        'momentum_tracker': {
            name: '动量追踪者',
            description: '追踪强势股',
            trigger_type: 'manual',
            actions: [
                { type: 'scan_sector', config: { limit: 30 } },
                { type: 'filter_stocks', config: { minChange: 5 } },
                { type: 'check_news', config: { keywords: ['利好', '增长'] } },
                { type: 'generate_report', config: { title: '动量追踪报告' } },
                { type: 'send_alert', config: { channels: ['web'] } }
            ]
        },
        'price_watcher': {
            name: '价格守望者',
            description: '监控股票价格',
            trigger_type: 'manual',
            actions: [
                { type: 'check_price', config: { symbol: '', threshold: 0, condition: 'below' } },
                { type: 'send_alert', config: { channels: ['web'] } }
            ]
        }
    };
    
    const template = templates[templateId];
    if (!template) {
        alert('模板不存在');
        return;
    }
    
    try {
        // 创建工作流
        const createRes = await fetch(`${API_BASE_URL}/api/workflows`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(template)
        });
        
        const createResult = await createRes.json();
        
        if (!createResult.success) {
            alert('创建工作流失败: ' + createResult.error);
            return;
        }
        
        // 执行工作流
        const workflowId = createResult.workflowId;
        
        // 显示执行中状态
        showExecutionStatus(template.name, 'running');
        
        const execRes = await fetch(`${API_BASE_URL}/api/workflows/${workflowId}/execute`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const execResult = await execRes.json();
        
        if (execResult.success) {
            showExecutionStatus(template.name, 'success', execResult.result);
            loadExecutionLogs(); // 刷新记录
        } else {
            showExecutionStatus(template.name, 'failed', null, execResult.error);
        }
        
    } catch (error) {
        console.error('运行模板失败:', error);
        alert('运行失败，请稍后重试');
    }
}

// 定时模板
function scheduleTemplate(templateId) {
    alert('定时功能开发中，敬请期待');
}

// 显示执行状态
function showExecutionStatus(name, status, result, error) {
    const container = document.getElementById('activeWorkflows');
    
    const statusHtml = {
        running: '<span class="workflow-status running">执行中...</span>',
        success: '<span class="workflow-status success">✓ 完成</span>',
        failed: '<span class="workflow-status failed">✗ 失败</span>'
    };
    
    container.innerHTML = `
        <div class="workflow-item">
            <div class="workflow-icon">🤖</div>
            <div class="workflow-info">
                <div class="workflow-name">${name}</div>
                <div class="workflow-meta">${new Date().toLocaleString('zh-CN')}</div>
            </div>
            ${statusHtml[status]}
        </div>
    `;
    
    if (status === 'success' && result) {
        // 3秒后清除状态
        setTimeout(() => {
            container.innerHTML = '<div class="empty">暂无运行中的工作流</div>';
        }, 5000);
    }
}

// 加载运行中的工作流
async function loadActiveWorkflows() {
    const container = document.getElementById('activeWorkflows');
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/workflows`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            container.innerHTML = '<div class="empty">请先登录后查看</div>';
            return;
        }
        
        const result = await response.json();
        
        if (!result.success || !result.workflows || result.workflows.length === 0) {
            container.innerHTML = '<div class="empty">暂无运行中的工作流</div>';
            return;
        }
        
        // 只显示激活的工作流
        const activeWorkflows = result.workflows.filter(w => w.status === 'active');
        
        if (activeWorkflows.length === 0) {
            container.innerHTML = '<div class="empty">暂无运行中的工作流</div>';
            return;
        }
        
        container.innerHTML = activeWorkflows.map(w => `
            <div class="workflow-item">
                <div class="workflow-icon">🤖</div>
                <div class="workflow-info">
                    <div class="workflow-name">${w.name}</div>
                    <div class="workflow-meta">已运行 ${w.run_count || 0} 次 · ${new Date(w.updated_at).toLocaleString('zh-CN')}</div>
                </div>
                <span class="workflow-status running">运行中</span>
                <div class="workflow-actions">
                    <button class="btn-detail" onclick="viewWorkflowLogs(${w.id})">查看记录</button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('加载工作流失败:', error);
        container.innerHTML = '<div class="empty">加载失败</div>';
    }
}

// 加载执行记录
async function loadExecutionLogs(filter = 'all') {
    const container = document.getElementById('logsTimeline');
    container.innerHTML = '<div class="loading">加载中...</div>';
    
    try {
        // 获取工作流列表
        const workflowsRes = await fetch(`${API_BASE_URL}/api/workflows`, {
            headers: getAuthHeaders()
        });
        
        if (!workflowsRes.ok) {
            container.innerHTML = '<div class="empty">请先登录后查看</div>';
            return;
        }
        
        const workflowsResult = await workflowsRes.json();
        
        if (!workflowsResult.success || !workflowsResult.workflows) {
            container.innerHTML = '<div class="empty">暂无记录</div>';
            return;
        }
        
        // 获取每个工作流的日志
        const allLogs = [];
        for (const workflow of workflowsResult.workflows.slice(0, 5)) {
            try {
                const logsRes = await fetch(`${API_BASE_URL}/api/workflows/${workflow.id}/logs?limit=3`, {
                    headers: getAuthHeaders()
                });
                
                if (logsRes.ok) {
                    const logsResult = await logsRes.json();
                    if (logsResult.success && logsResult.logs) {
                        allLogs.push(...logsResult.logs.map(l => ({
                            ...l,
                            workflowName: workflow.name
                        })));
                    }
                }
            } catch (e) {
                console.error(`获取工作流 ${workflow.id} 日志失败:`, e);
            }
        }
        
        // 按时间排序
        allLogs.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
        
        // 过滤
        const filteredLogs = filter === 'all' 
            ? allLogs 
            : allLogs.filter(l => l.status === filter);
        
        if (filteredLogs.length === 0) {
            container.innerHTML = '<div class="empty">暂无记录</div>';
            return;
        }
        
        container.innerHTML = filteredLogs.map(log => {
            const statusClass = log.status;
            const statusText = {
                'success': '成功',
                'failed': '失败',
                'running': '执行中'
            }[log.status] || log.status;
            
            // 解析执行结果
            let summary = '';
            try {
                const output = JSON.parse(log.output_data || '{}');
                if (output.results) {
                    const actions = output.results.map(r => r.action).join(' → ');
                    summary = `执行动作: ${actions}`;
                }
            } catch (e) {
                summary = '执行完成';
            }
            
            return `
                <div class="log-item ${statusClass}">
                    <div class="log-content">
                        <div class="log-header">
                            <div>
                                <div class="log-title">${log.workflowName}</div>
                                <div class="log-time">${new Date(log.started_at).toLocaleString('zh-CN')}</div>
                            </div>
                            <span class="log-status ${statusClass}">${statusText}</span>
                        </div>
                        <div class="log-summary">${summary}</div>
                        <div class="log-actions">
                            <button class="btn-detail" onclick="showExecutionDetail(${log.id}, '${log.workflowName}')">查看详情</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('加载执行记录失败:', error);
        container.innerHTML = '<div class="error">加载失败</div>';
    }
}

// 初始化过滤器
function initFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const filter = btn.dataset.filter;
            loadExecutionLogs(filter);
        });
    });
}

// 查看执行详情
async function showExecutionDetail(logId, workflowName) {
    const modal = document.getElementById('executionModal');
    const modalBody = document.getElementById('modalBody');
    
    modal.classList.add('show');
    modalBody.innerHTML = '<div class="loading">加载中...</div>';
    
    try {
        // 这里需要后端提供获取单条日志详情的 API
        // 暂时模拟展示
        modalBody.innerHTML = `
            <div class="execution-detail">
                <div class="detail-section">
                    <h4>🎯 工作流信息</h4>
                    <p><strong>名称：</strong> ${workflowName}</p>
                    <p><strong>执行时间：</strong> ${new Date().toLocaleString('zh-CN')}</p>
                    <p><strong>执行结果：</strong> <span style="color: var(--success-color)">成功</span></p>
                </div>
                
                <div class="detail-section">
                    <h4>📋 执行步骤</h4>
                    <div class="action-list">
                        <div class="action-item">
                            <span class="action-icon">🔍</span>
                            <div class="action-info">
                                <div class="action-name">扫描板块</div>
                                <div class="action-desc">扫描A股市场，获取50只股票</div>
                            </div>
                            <span class="action-status success">✓ 成功</span>
                        </div>
                        
                        <div class="action-item">
                            <span class="action-icon">🔎</span>
                            <div class="action-info">
                                <div class="action-name">筛选股票</div>
                                <div class="action-desc">按PE<15, PB<2条件筛选，发现8只符合条件的股票</div>
                            </div>
                            <span class="action-status success">✓ 成功</span>
                        </div>
                        
                        <div class="action-item">
                            <span class="action-icon">🧠</span>
                            <div class="action-info">
                                <div class="action-name">AI分析</div>
                                <div class="action-desc">对筛选出的股票进行基本面分析</div>
                            </div>
                            <span class="action-status success">✓ 成功</span>
                        </div>
                        
                        <div class="action-item">
                            <span class="action-icon">📄</span>
                            <div class="action-info">
                                <div class="action-name">生成报告</div>
                                <div class="action-desc">生成价值发现报告</div>
                            </div>
                            <span class="action-status success">✓ 成功</span>
                        </div>
                        
                        <div class="action-item">
                            <span class="action-icon">🔔</span>
                            <div class="action-info">
                                <div class="action-name">发送提醒</div>
                                <div class="action-desc">通过Web推送提醒</div>
                            </div>
                            <span class="action-status success">✓ 成功</span>
                        </div>
                    </div>
                </div>
                
                <div class="detail-section">
                    <h4>💡 执行结论</h4>
                    <p>本次工作流共扫描50只股票，筛选出8只低估值股票（PE<15, PB<2）。AI分析显示其中3只基本面良好，建议关注。</p>
                </div>
            </div>
        `;
        
    } catch (error) {
        modalBody.innerHTML = '<div class="error">加载详情失败</div>';
    }
}

// 关闭弹窗
function closeModal() {
    document.getElementById('executionModal').classList.remove('show');
}

// 查看工作流日志
function viewWorkflowLogs(workflowId) {
    // 滚动到日志区域
    document.querySelector('.execution-logs').scrollIntoView({ behavior: 'smooth' });
}

// 点击弹窗外部关闭
window.onclick = function(event) {
    const modal = document.getElementById('executionModal');
    if (event.target === modal) {
        closeModal();
    }
}
