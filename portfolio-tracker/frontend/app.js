/**
 * 持仓智投 - 前端主逻辑
 */

// 全局状态
const state = {
    portfolio: [],
    analysis: null,
    monitoring: [],
    alerts: []
};

// API 基础配置
const API_BASE = '/api';

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadPortfolio();
    setupEventListeners();
});

// 设置事件监听
function setupEventListeners() {
    // 上传区域
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');

    uploadZone.addEventListener('click', () => fileInput.click());
    
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // 筛选和排序
    document.getElementById('marketFilter').addEventListener('change', renderPortfolio);
    document.getElementById('sortBy').addEventListener('change', renderPortfolio);
}

// 处理文件上传
function handleFiles(files) {
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
        alert('请选择图片文件');
        return;
    }

    state.pendingFiles = validFiles;
    
    // 显示预览
    const previewArea = document.getElementById('previewArea');
    const previewList = document.getElementById('previewList');
    previewArea.classList.remove('hidden');
    previewList.innerHTML = '';

    validFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'flex items-center space-x-3 p-2 bg-gray-50 rounded';
            div.innerHTML = `
                <img src="${e.target.result}" class="w-12 h-12 object-cover rounded">
                <span class="text-sm text-gray-600 flex-1 truncate">${file.name}</span>
                <span class="text-xs text-gray-400">${(file.size / 1024).toFixed(1)}KB</span>
            `;
            previewList.appendChild(div);
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('analyzeBtn').disabled = false;
}

// 开始分析
async function startAnalysis() {
    if (!state.pendingFiles || state.pendingFiles.length === 0) return;

    const progressArea = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const uploadStatus = document.getElementById('uploadStatus');
    const analyzeBtn = document.getElementById('analyzeBtn');

    progressArea.classList.remove('hidden');
    analyzeBtn.disabled = true;

    try {
        // 上传并识别
        uploadStatus.textContent = '正在识别持仓截图...';
        progressBar.style.width = '30%';
        progressText.textContent = '30%';

        const formData = new FormData();
        state.pendingFiles.forEach(file => formData.append('screenshots', file));

        const response = await fetch(`${API_BASE}/portfolio/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('上传失败');

        const result = await response.json();
        
        // AI 分析
        uploadStatus.textContent = 'AI 正在分析持仓...';
        progressBar.style.width = '70%';
        progressText.textContent = '70%';

        const analysisResponse = await fetch(`${API_BASE}/portfolio/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ portfolio: result.portfolio })
        });

        if (!analysisResponse.ok) throw new Error('分析失败');

        const analysisResult = await analysisResponse.json();
        
        // 保存结果
        state.portfolio = result.portfolio;
        state.analysis = analysisResult.analysis;
        state.monitoring = analysisResult.monitoring || [];

        progressBar.style.width = '100%';
        progressText.textContent = '100%';
        uploadStatus.textContent = '分析完成！';

        setTimeout(() => {
            hideUploadModal();
            renderPortfolio();
            renderAnalysis();
            savePortfolio();
        }, 500);

    } catch (error) {
        console.error('分析失败:', error);
        uploadStatus.textContent = '分析失败: ' + error.message;
        uploadStatus.classList.add('text-red-500');
        analyzeBtn.disabled = false;
    }
}

// 渲染持仓列表
function renderPortfolio() {
    const tbody = document.getElementById('portfolioTable');
    const emptyState = document.getElementById('emptyState');
    const marketFilter = document.getElementById('marketFilter').value;
    const sortBy = document.getElementById('sortBy').value;

    if (state.portfolio.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        updateSummary();
        return;
    }

    emptyState.classList.add('hidden');

    // 筛选
    let filtered = state.portfolio;
    if (marketFilter !== 'all') {
        filtered = filtered.filter(s => s.market === marketFilter);
    }

    // 排序
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'value': return (b.price * b.shares) - (a.price * a.shares);
            case 'change': return b.changePercent - a.changePercent;
            case 'name': return a.name.localeCompare(b.name);
            default: return 0;
        }
    });

    // 渲染
    const totalValue = state.portfolio.reduce((sum, s) => sum + s.price * s.shares, 0);

    tbody.innerHTML = filtered.map(stock => {
        const value = stock.price * stock.shares;
        const weight = ((value / totalValue) * 100).toFixed(1);
        const isMonitoring = state.monitoring.some(m => m.symbol === stock.symbol);
        
        return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-6 py-4">
                    <div class="flex items-center">
                        <div class="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold text-sm">
                            ${stock.name.slice(0, 2)}
                        </div>
                        <div class="ml-4">
                            <div class="text-sm font-medium text-gray-900">${stock.name}</div>
                            <div class="text-sm text-gray-500">${stock.symbol} · ${stock.market}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="text-sm text-gray-900">${stock.shares.toLocaleString()}</div>
                    <div class="text-sm text-gray-500">${stock.avgCost ? '成本 ¥' + stock.avgCost.toFixed(2) : ''}</div>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="text-sm text-gray-900">${stock.currency === 'USD' ? '$' : '¥'}${stock.price.toFixed(2)}</div>
                </td>
                <td class="px-6 py-4 text-right">
                    <span class="text-sm ${stock.changePercent >= 0 ? 'stock-up' : 'stock-down'}">
                        ${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%
                    </span>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="text-sm text-gray-900">${(value / 10000).toFixed(2)}万</div>
                    <div class="text-sm text-gray-500">${weight}%</div>
                </td>
                <td class="px-6 py-4 text-center">
                    ${isMonitoring ? `
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 relative monitoring-badge">
                            <span class="ml-3">监控中</span>
                        </span>
                    ` : '<span class="text-gray-400 text-sm">--</span>'}
                </td>
                <td class="px-6 py-4 text-center">
                    <button onclick="showStockDetail('${stock.symbol}')" class="text-purple-600 hover:text-purple-900 text-sm font-medium">
                        详情
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    updateSummary();
}

// 更新概览数据
function updateSummary() {
    const totalValue = state.portfolio.reduce((sum, s) => sum + s.price * s.shares, 0);
    const totalCost = state.portfolio.reduce((sum, s) => sum + (s.avgCost || s.price) * s.shares, 0);
    const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost * 100) : 0;

    document.getElementById('totalAssets').textContent = `¥${(totalValue / 10000).toFixed(2)}万`;
    document.getElementById('totalReturn').innerHTML = `
        <span class="${totalReturn >= 0 ? 'stock-up' : 'stock-down'}">${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%</span>
    `;
    document.getElementById('holdingCount').textContent = state.portfolio.length;
    document.getElementById('monitoringCount').textContent = state.monitoring.length;
    document.getElementById('alertCount').textContent = state.alerts.length;
}

// 渲染 AI 分析
function renderAnalysis() {
    if (!state.analysis) return;

    const aiAnalysis = document.getElementById('aiAnalysis');
    aiAnalysis.innerHTML = `
        <div class="p-4 bg-purple-50 rounded-lg border border-purple-100">
            <h4 class="font-semibold text-purple-900 mb-2">持仓概览</h4>
            <p class="text-purple-800 text-sm">${state.analysis.summary}</p>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div class="p-4 bg-blue-50 rounded-lg">
                <h5 class="font-medium text-blue-900 mb-2">行业分布</h5>
                <div class="space-y-1">
                    ${state.analysis.sectors?.map(s => `
                        <div class="flex justify-between text-sm">
                            <span class="text-blue-700">${s.name}</span>
                            <span class="text-blue-600">${s.weight}%</span>
                        </div>
                    `).join('') || '<p class="text-sm text-blue-600">分析中...</p>'}
                </div>
            </div>
            <div class="p-4 bg-amber-50 rounded-lg">
                <h5 class="font-medium text-amber-900 mb-2">风险提醒</h5>
                <ul class="text-sm text-amber-800 space-y-1 list-disc list-inside">
                    ${state.analysis.risks?.map(r => `<li>${r}</li>
                    `).join('') || '<li>暂无风险提醒</li>'}
                </ul>
            </div>
        </div>
    `;

    // 监控指标
    const metricsDiv = document.getElementById('monitoringMetrics');
    if (state.monitoring.length > 0) {
        metricsDiv.innerHTML = state.monitoring.slice(0, 5).map(m => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                    <p class="font-medium text-gray-900">${m.symbol}</p>
                    <p class="text-sm text-gray-500">${m.metric}</p>
                </div>
                <span class="text-xs px-2 py-1 rounded-full ${m.status === 'normal' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
                    ${m.status === 'normal' ? '正常' : '关注'}
                </span>
            </div>
        `).join('');
    }
}

// 显示标的详情
function showStockDetail(symbol) {
    const stock = state.portfolio.find(s => s.symbol === symbol);
    if (!stock) return;

    const monitoring = state.monitoring.find(m => m.symbol === symbol);
    const totalValue = state.portfolio.reduce((sum, s) => sum + s.price * s.shares, 0);
    const value = stock.price * stock.shares;
    const weight = ((value / totalValue) * 100).toFixed(1);

    document.getElementById('detailStockName').textContent = stock.name;
    document.getElementById('detailStockCode').textContent = `${stock.symbol} · ${stock.market}`;
    document.getElementById('detailPrice').textContent = `${stock.currency === 'USD' ? '$' : '¥'}${stock.price.toFixed(2)}`;
    document.getElementById('detailPrice').className = `text-xl font-bold ${stock.changePercent >= 0 ? 'stock-up' : 'stock-down'}`;
    document.getElementById('detailYearChange').textContent = `${stock.yearChange >= 0 ? '+' : ''}${stock.yearChange?.toFixed(2) || 0}%`;
    document.getElementById('detailYearChange').className = `text-xl font-bold ${(stock.yearChange || 0) >= 0 ? 'stock-up' : 'stock-down'}`;
    document.getElementById('detailWeight').textContent = `${weight}%`;

    // 涨跌逻辑
    document.getElementById('detailLogic').innerHTML = monitoring?.logicAnalysis || `
        <p>${stock.name} 过去一年${stock.yearChange >= 0 ? '上涨' : '下跌'} ${Math.abs(stock.yearChange || 0).toFixed(2)}%。</p>
        <p class="mt-2">AI 正在分析其背后的驱动逻辑，包括：</p>
        <ul class="mt-1 list-disc list-inside">
            <li>宏观经济因素</li>
            <li>行业景气度变化</li>
            <li>公司基本面变化</li>
            <li>市场情绪与资金流向</li>
        </ul>
    `;

    // 监控指标
    document.getElementById('detailMetrics').innerHTML = monitoring?.metrics?.map(m => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div class="flex items-center space-x-3">
                <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                </svg>
                <div>
                    <p class="font-medium text-gray-900">${m.name}</p>
                    <p class="text-sm text-gray-500">${m.description}</p>
                </div>
            </div>
            <span class="text-sm text-gray-600">${m.currentValue || '监控中'}</span>
        </div>
    `).join('') || '<p class="text-gray-500 text-sm">AI 正在生成监控指标...</p>';

    document.getElementById('stockDetailModal').classList.remove('hidden');
}

function hideStockDetail() {
    document.getElementById('stockDetailModal').classList.add('hidden');
}

// 弹窗控制
function showUploadModal() {
    document.getElementById('uploadModal').classList.remove('hidden');
    // 重置状态
    document.getElementById('uploadProgress').classList.add('hidden');
    document.getElementById('previewArea').classList.add('hidden');
    document.getElementById('analyzeBtn').disabled = true;
    state.pendingFiles = null;
}

function hideUploadModal() {
    document.getElementById('uploadModal').classList.add('hidden');
}

// 本地存储
function savePortfolio() {
    localStorage.setItem('portfolio_data', JSON.stringify({
        portfolio: state.portfolio,
        analysis: state.analysis,
        monitoring: state.monitoring,
        updatedAt: new Date().toISOString()
    }));
}

function loadPortfolio() {
    const data = localStorage.getItem('portfolio_data');
    if (data) {
        const parsed = JSON.parse(data);
        state.portfolio = parsed.portfolio || [];
        state.analysis = parsed.analysis || null;
        state.monitoring = parsed.monitoring || [];
        renderPortfolio();
        renderAnalysis();
    }
}

// 点击弹窗外部关闭
window.onclick = function(event) {
    const uploadModal = document.getElementById('uploadModal');
    const detailModal = document.getElementById('stockDetailModal');
    if (event.target === uploadModal) hideUploadModal();
    if (event.target === detailModal) hideStockDetail();
}
