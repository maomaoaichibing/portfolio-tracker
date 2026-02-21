/**
 * Portfolio Tracker - 前端应用逻辑
 */

// API 基础 URL
const API_BASE_URL = 'http://localhost:3000/api';

// 全局状态
let selectedFiles = [];
let portfolioData = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadPortfolio();
});

// 初始化事件监听
function initEventListeners() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    // 点击上传
    dropZone.addEventListener('click', () => fileInput.click());

    // 文件选择
    fileInput.addEventListener('change', handleFileSelect);

    // 拖拽事件
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drop-zone-active');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drop-zone-active');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drop-zone-active');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        handleFiles(files);
    });
}

// 处理文件选择
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    handleFiles(files);
}

// 处理文件
function handleFiles(files) {
    selectedFiles = files;
    updatePreview();
    document.getElementById('uploadBtn').disabled = files.length === 0;
}

// 更新预览
function updatePreview() {
    const previewArea = document.getElementById('previewArea');
    const previewList = document.getElementById('previewList');
    
    if (selectedFiles.length === 0) {
        previewArea.classList.add('hidden');
        return;
    }

    previewArea.classList.remove('hidden');
    previewList.innerHTML = selectedFiles.map((file, index) => `
        <div class="flex items-center justify-between bg-gray-50 p-2 rounded">
            <div class="flex items-center">
                <svg class="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span class="text-sm text-gray-700">${file.name}</span>
                <span class="text-xs text-gray-400 ml-2">(${(file.size / 1024).toFixed(1)} KB)</span>
            </div>
            <button onclick="removeFile(${index})" class="text-red-500 hover:text-red-700">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    `).join('');
}

// 移除文件
function removeFile(index) {
    selectedFiles.splice(index, 1);
    updatePreview();
    document.getElementById('uploadBtn').disabled = selectedFiles.length === 0;
}

// 显示上传模态框
function showUploadModal() {
    document.getElementById('uploadModal').classList.remove('hidden');
    document.getElementById('uploadModal').classList.add('flex');
    resetUploadForm();
}

// 隐藏上传模态框
function hideUploadModal() {
    document.getElementById('uploadModal').classList.add('hidden');
    document.getElementById('uploadModal').classList.remove('flex');
}

// 重置上传表单
function resetUploadForm() {
    selectedFiles = [];
    document.getElementById('fileInput').value = '';
    document.getElementById('previewArea').classList.add('hidden');
    document.getElementById('uploadProgress').classList.add('hidden');
    document.getElementById('uploadBtn').disabled = true;
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('progressText').textContent = '0%';
}

// 上传文件
async function uploadFiles() {
    if (selectedFiles.length === 0) return;

    const uploadBtn = document.getElementById('uploadBtn');
    const progressArea = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const uploadStatus = document.getElementById('uploadStatus');

    uploadBtn.disabled = true;
    progressArea.classList.remove('hidden');

    try {
        // 创建 FormData
        const formData = new FormData();
        for (let i = 0; i < selectedFiles.length; i++) {
            formData.append('screenshots', selectedFiles[i]);
        }

        progressBar.style.width = '30%';
        progressText.textContent = '30%';
        uploadStatus.textContent = '正在上传图片...';

        // 调用后端 API 识别持仓
        const response = await fetch(`${API_BASE_URL}/portfolio/upload`, {
            method: 'POST',
            body: formData
        });

        progressBar.style.width = '70%';
        progressText.textContent = '70%';
        uploadStatus.textContent = 'AI 正在分析...';

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || '识别失败');
        }

        // 识别成功后，调用分析接口
        if (result.portfolio && result.portfolio.length > 0) {
            uploadStatus.textContent = '正在生成分析报告...';
            
            const analyzeResponse = await fetch(`${API_BASE_URL}/portfolio/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ portfolio: result.portfolio })
            });

            const analyzeResult = await analyzeResponse.json();
            
            if (analyzeResult.success) {
                console.log('分析结果:', analyzeResult);
            }
        }

        progressBar.style.width = '100%';
        progressText.textContent = '100%';
        uploadStatus.textContent = '识别完成！';

        setTimeout(() => {
            hideUploadModal();
            loadPortfolio();
            showToast(`成功识别 ${result.portfolio?.length || 0} 只标的！`);
        }, 500);

    } catch (error) {
        console.error('上传失败:', error);
        showToast('上传失败: ' + error.message, 'error');
        uploadBtn.disabled = false;
    }
}

// 加载持仓数据
async function loadPortfolio() {
    try {
        const response = await fetch(`${API_BASE_URL}/portfolio`);
        const data = await response.json();
        
        if (data.portfolio) {
            // 转换后端数据格式到前端格式
            portfolioData = data.portfolio.map(item => ({
                id: item.id,
                code: item.symbol,
                name: item.name,
                quantity: item.shares,
                price: item.price || 0,
                cost: item.avg_cost || 0,
                marketValue: (item.price || 0) * item.shares,
                pnl: item.price && item.avg_cost ? (item.price - item.avg_cost) * item.shares : 0,
                pnlPercent: item.price && item.avg_cost ? ((item.price - item.avg_cost) / item.avg_cost * 100) : 0,
                isMonitoring: true, // 默认监控
                industry: item.market || '未知'
            }));
        } else {
            portfolioData = [];
        }
        
        updateStats();
        renderPortfolioTable();
    } catch (error) {
        console.error('加载持仓失败:', error);
        showToast('加载持仓数据失败，请检查服务是否启动', 'error');
        // 失败时显示空状态
        portfolioData = [];
        updateStats();
        renderPortfolioTable();
    }
}

// 更新统计数据
function updateStats() {
    const totalHoldings = portfolioData.length;
    const totalValue = portfolioData.reduce((sum, item) => sum + item.marketValue, 0);
    const todayPnL = portfolioData.reduce((sum, item) => sum + item.pnl, 0);
    const monitoringCount = portfolioData.filter(item => item.isMonitoring).length;

    document.getElementById('totalHoldings').textContent = totalHoldings;
    document.getElementById('totalValue').textContent = formatCurrency(totalValue);
    
    const pnlElement = document.getElementById('todayPnL');
    pnlElement.textContent = formatCurrency(todayPnL);
    pnlElement.className = `text-2xl font-bold ${todayPnL >= 0 ? 'profit' : 'loss'}`;
    
    document.getElementById('monitoringCount').textContent = monitoringCount;
}

// 渲染持仓表格
function renderPortfolioTable() {
    const tbody = document.getElementById('portfolioTableBody');
    const emptyState = document.getElementById('emptyState');

    if (portfolioData.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    tbody.innerHTML = portfolioData.map(item => `
        <tr class="table-row-hover animate-fade-in">
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-sm font-medium text-gray-900">${item.code}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <span class="text-sm font-medium text-gray-900">${item.name}</span>
                    <span class="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">${item.industry}</span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right">
                <span class="text-sm text-gray-900">${item.quantity}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right">
                <span class="text-sm text-gray-900">${formatCurrency(item.price)}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right">
                <span class="text-sm font-medium text-gray-900">${formatCurrency(item.marketValue)}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right">
                <div class="flex flex-col items-end">
                    <span class="text-sm font-medium ${item.pnl >= 0 ? 'profit' : 'loss'}">${item.pnl >= 0 ? '+' : ''}${formatCurrency(item.pnl)}</span>
                    <span class="text-xs ${item.pnl >= 0 ? 'profit' : 'loss'}">${item.pnl >= 0 ? '+' : ''}${item.pnlPercent.toFixed(2)}%</span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <button onclick="toggleMonitoring(${item.id})" class="${item.isMonitoring ? 'text-green-600 hover:text-green-800' : 'text-gray-400 hover:text-gray-600'}">
                    <svg class="h-6 w-6" fill="${item.isMonitoring ? 'currentColor' : 'none'}" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                </button>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <div class="flex items-center justify-center space-x-2">
                    <button onclick="showDetail(${item.id})" class="text-blue-600 hover:text-blue-800 p-1">
                        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    </button>
                    <button onclick="analyzeStock(${item.id})" class="text-purple-600 hover:text-purple-800 p-1" title="AI 分析">
                        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                    </button>
                    <button onclick="deleteStock(${item.id})" class="text-red-600 hover:text-red-800 p-1">
                        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// 刷新持仓
async function refreshPortfolio() {
    showToast('正在刷新价格...');
    
    try {
        // 先刷新后端价格
        const response = await fetch(`${API_BASE_URL}/portfolio/refresh-prices`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            showToast(result.message);
            // 然后重新加载持仓数据
            await loadPortfolio();
        } else {
            showToast('刷新失败', 'error');
        }
    } catch (error) {
        console.error('刷新失败:', error);
        showToast('刷新失败，请检查服务是否启动', 'error');
    }
}

// 切换监控状态
async function toggleMonitoring(id) {
    const item = portfolioData.find(p => p.id === id);
    if (item) {
        item.isMonitoring = !item.isMonitoring;
        renderPortfolioTable();
        updateStats();
        showToast(item.isMonitoring ? '已开始监控' : '已停止监控');
    }
}

// 显示股票详情
function showDetail(id) {
    const item = portfolioData.find(p => p.id === id);
    if (!item) return;

    document.getElementById('detailTitle').textContent = `${item.name} (${item.code})`;
    document.getElementById('detailContent').innerHTML = `
        <div class="space-y-6">
            <!-- 基本信息 -->
            <div class="grid grid-cols-2 gap-4">
                <div class="bg-gray-50 p-4 rounded-lg">
                    <p class="text-sm text-gray-500">当前价格</p>
                    <p class="text-2xl font-bold text-gray-900">${formatCurrency(item.price)}</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg">
                    <p class="text-sm text-gray-500">持仓成本</p>
                    <p class="text-2xl font-bold text-gray-900">${formatCurrency(item.cost)}</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg">
                    <p class="text-sm text-gray-500">持仓数量</p>
                    <p class="text-2xl font-bold text-gray-900">${item.quantity} 股</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg">
                    <p class="text-sm text-gray-500">总市值</p>
                    <p class="text-2xl font-bold text-gray-900">${formatCurrency(item.marketValue)}</p>
                </div>
            </div>
            
            <!-- 盈亏信息 -->
            <div class="border-t pt-4">
                <h4 class="font-semibold text-gray-900 mb-3">盈亏情况</h4>
                <div class="flex justify-between items-center">
                    <span class="text-gray-600">浮动盈亏</span>
                    <span class="text-xl font-bold ${item.pnl >= 0 ? 'profit' : 'loss'}">${item.pnl >= 0 ? '+' : ''}${formatCurrency(item.pnl)} (${item.pnl >= 0 ? '+' : ''}${item.pnlPercent.toFixed(2)}%)</span>
                </div>
            </div>
            
            <!-- 监控指标 -->
            <div class="border-t pt-4">
                <h4 class="font-semibold text-gray-900 mb-3">监控指标</h4>
                <div class="space-y-2">
                    <div class="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <span class="text-sm text-gray-700">价格变动提醒</span>
                        <span class="tag tag-blue">已启用</span>
                    </div>
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span class="text-sm text-gray-700">财报发布提醒</span>
                        <span class="tag tag-green">已启用</span>
                    </div>
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span class="text-sm text-gray-700">行业动态监控</span>
                        <span class="tag tag-yellow">待配置</span>
                    </div>
                </div>
            </div>
            
            <!-- 近期动态 -->
            <div class="border-t pt-4">
                <h4 class="font-semibold text-gray-900 mb-3">近期动态</h4>
                <div class="space-y-3">
                    <div class="flex items-start space-x-3">
                        <div class="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        <div>
                            <p class="text-sm text-gray-900">Q3 财报发布，营收同比增长 15%</p>
                            <p class="text-xs text-gray-500">2024-10-28</p>
                        </div>
                    </div>
                    <div class="flex items-start space-x-3">
                        <div class="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                        <div>
                            <p class="text-sm text-gray-900">获得机构增持评级</p>
                            <p class="text-xs text-gray-500">2024-10-25</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('detailModal').classList.remove('hidden');
    document.getElementById('detailModal').classList.add('flex');
}

// 隐藏详情模态框
function hideDetailModal() {
    document.getElementById('detailModal').classList.add('hidden');
    document.getElementById('detailModal').classList.remove('flex');
}

// AI 分析股票
function analyzeStock(id) {
    const item = portfolioData.find(p => p.id === id);
    if (!item) return;

    document.getElementById('analysisContent').innerHTML = `
        <div class="flex items-center justify-center py-8">
            <div class="loading-spinner mr-3"></div>
            <span class="text-gray-600">AI 正在分析持仓...</span>
        </div>
    `;
    
    document.getElementById('analysisModal').classList.remove('hidden');
    document.getElementById('analysisModal').classList.add('flex');

    // 模拟 AI 分析
    setTimeout(() => {
        document.getElementById('analysisContent').innerHTML = `
            <div class="space-y-4">
                <div class="bg-blue-50 p-4 rounded-lg">
                    <h4 class="font-semibold text-blue-900 mb-2">投资亮点</h4>
                    <ul class="list-disc list-inside text-sm text-blue-800 space-y-1">
                        <li>${item.name} 是${item.industry}行业龙头，具有较强的品牌护城河</li>
                        <li>近一年业绩稳定增长，毛利率保持在较高水平</li>
                        <li>机构持仓比例较高，市场认可度高</li>
                    </ul>
                </div>
                
                <div class="bg-yellow-50 p-4 rounded-lg">
                    <h4 class="font-semibold text-yellow-900 mb-2">风险提示</h4>
                    <ul class="list-disc list-inside text-sm text-yellow-800 space-y-1">
                        <li>行业竞争加剧，新进入者可能分流市场份额</li>
                        <li>宏观经济波动可能影响消费需求</li>
                        <li>当前估值处于历史中高位，需关注业绩兑现</li>
                    </ul>
                </div>
                
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h4 class="font-semibold text-gray-900 mb-2">监控建议</h4>
                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-sm text-gray-700">季度财报</span>
                            <span class="tag tag-blue">重点关注</span>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-sm text-gray-700">行业政策</span>
                            <span class="tag tag-green">持续跟踪</span>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-sm text-gray-700">竞品动态</span>
                            <span class="tag tag-yellow">定期关注</span>
                        </div>
                    </div>
                </div>
                
                <div class="border-t pt-4">
                    <h4 class="font-semibold text-gray-900 mb-2">涨跌逻辑分析</h4>
                    <p class="text-sm text-gray-600 leading-relaxed">
                        该股票近期上涨主要受益于${item.industry}行业景气度回升，以及公司自身业绩超预期的双重驱动。
                        从技术面看，股价突破前期整理平台，成交量温和放大，短期趋势向好。
                        建议关注即将发布的季度财报，若业绩符合或超预期，有望延续上涨态势。
                    </p>
                </div>
            </div>
        `;
    }, 2000);
}

// 隐藏分析模态框
function hideAnalysisModal() {
    document.getElementById('analysisModal').classList.add('hidden');
    document.getElementById('analysisModal').classList.remove('flex');
}

// 删除股票
function deleteStock(id) {
    if (confirm('确定要删除这个持仓吗？')) {
        portfolioData = portfolioData.filter(p => p.id !== id);
        renderPortfolioTable();
        updateStats();
        showToast('持仓已删除');
    }
}

// 显示 Toast 通知
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    toastMessage.textContent = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

// 格式化货币
function formatCurrency(value) {
    return new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: 'CNY',
        minimumFractionDigits: 2
    }).format(value);
}

// 导出函数供 HTML 调用
window.showUploadModal = showUploadModal;
window.hideUploadModal = hideUploadModal;
window.uploadFiles = uploadFiles;
window.removeFile = removeFile;
window.refreshPortfolio = refreshPortfolio;
window.toggleMonitoring = toggleMonitoring;
window.showDetail = showDetail;
window.hideDetailModal = hideDetailModal;
window.analyzeStock = analyzeStock;
window.hideAnalysisModal = hideAnalysisModal;
window.deleteStock = deleteStock;
