/**
 * 热门股票页面逻辑
 */

// API 基础 URL
const API_BASE_URL = window.location.origin;

// 缓存自选状态
let watchlistCache = new Set();

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadWatchlistStatus();
    loadAllData();
});

// 初始化标签切换
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            // 切换按钮状态
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 切换内容
            tabContents.forEach(c => c.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            
            // 如果切换到自选标签，加载自选数据
            if (tabId === 'watchlist') {
                loadWatchlist();
            }
        });
    });
}

// 加载自选状态（用于显示按钮状态）
async function loadWatchlistStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/watchlist`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.watchlist) {
                watchlistCache = new Set(result.watchlist.map(item => item.symbol));
            }
        }
    } catch (error) {
        console.log('加载自选状态失败:', error);
    }
}

// 加载所有数据
async function loadAllData() {
    const [gainers, losers, volume, sectors] = await Promise.all([
        loadGainers(),
        loadLosers(),
        loadVolume(),
        loadSectors()
    ]);
    
    // 生成市场总结（调用AI）
    await generateMarketSummary(gainers, losers, sectors);
    
    // 更新最后更新时间
    document.getElementById('updateTime').textContent = new Date().toLocaleString('zh-CN');
}

// 获取认证头
function getAuthHeaders() {
    const token = localStorage.getItem('token') || '';
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

// 加载涨幅榜
async function loadGainers() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/hot-stocks/gainers?limit=20`);
        const result = await response.json();
        
        if (result.success) {
            window.gainersData = result.data;
            renderStockTableWithAction('gainersTable', result.data, true);
            return result.data;
        }
    } catch (error) {
        console.error('加载涨幅榜失败:', error);
        document.getElementById('gainersTable').innerHTML = `
            <tr><td colspan="9" class="error">加载失败，请稍后重试</td></tr>
        `;
    }
    return [];
}

// 加载跌幅榜
async function loadLosers() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/hot-stocks/losers?limit=20`);
        const result = await response.json();
        
        if (result.success) {
            window.losersData = result.data;
            renderStockTableWithAction('losersTable', result.data, false);
            return result.data;
        }
    } catch (error) {
        console.error('加载跌幅榜失败:', error);
        document.getElementById('losersTable').innerHTML = `
            <tr><td colspan="9" class="error">加载失败，请稍后重试</td></tr>
        `;
    }
    return [];
}

// 加载成交榜
async function loadVolume() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/hot-stocks/volume?limit=20`);
        const result = await response.json();
        
        if (result.success) {
            renderVolumeTableWithAction('volumeTable', result.data);
        }
    } catch (error) {
        console.error('加载成交榜失败:', error);
        document.getElementById('volumeTable').innerHTML = `
            <tr><td colspan="9" class="error">加载失败，请稍后重试</td></tr>
        `;
    }
}

// 加载热门板块
async function loadSectors() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/hot-stocks/sectors?limit=20`);
        const result = await response.json();
        
        if (result.success) {
            window.sectorsData = result.data;
            renderSectors('sectorsGrid', result.data);
            return result.data;
        }
    } catch (error) {
        console.error('加载热门板块失败:', error);
        document.getElementById('sectorsGrid').innerHTML = `
            <div class="error">加载失败，请稍后重试</div>
        `;
    }
    return [];
}

// 加载自选股
async function loadWatchlist() {
    const tbody = document.getElementById('watchlistTable');
    tbody.innerHTML = '<tr><td colspan="7" class="loading">加载中...</td></tr>';
    
    try {
        // 获取自选股列表
        const response = await fetch(`${API_BASE_URL}/api/watchlist`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                tbody.innerHTML = `
                    <tr><td colspan="7" class="empty">
                        请先<a href="login.html">登录</a>后查看自选股
                    </td></tr>
                `;
            } else {
                throw new Error('加载失败');
            }
            return;
        }
        
        const result = await response.json();
        
        if (!result.success || !result.watchlist || result.watchlist.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无自选股，请在热门股票中添加</td></tr>';
            return;
        }
        
        // 获取实时价格
        const watchlistWithPrices = await Promise.all(
            result.watchlist.map(async (item) => {
                try {
                    const priceResponse = await fetch(`${API_BASE_URL}/api/stock/price/${item.symbol}`);
                    const priceData = await priceResponse.json();
                    return {
                        ...item,
                        currentPrice: priceData.price || item.price || 0,
                        change: priceData.change || 0,
                        changePercent: priceData.changePercent || 0
                    };
                } catch (err) {
                    return { ...item, currentPrice: item.price || 0, change: 0, changePercent: 0 };
                }
            })
        );
        
        // 渲染自选股列表
        tbody.innerHTML = watchlistWithPrices.map((stock, index) => {
            const changeClass = stock.changePercent >= 0 ? 'positive' : 'negative';
            const changeSign = stock.changePercent >= 0 ? '+' : '';
            
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        <div class="stock-name">${stock.name}</div>
                        <div class="stock-code">${stock.symbol}</div>
                    </td>
                    <td class="price">¥${stock.currentPrice.toFixed(2)}</td>
                    <td class="${changeClass}">${changeSign}${stock.change.toFixed(2)}</td>
                    <td class="${changeClass}">${changeSign}${stock.changePercent.toFixed(2)}%</td>
                    <td>${stock.notes || '-'}</td>
                    <td>
                        <button class="watchlist-btn btn-remove" onclick="removeFromWatchlist('${stock.symbol}')">删除</button>
                    </td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('加载自选股失败:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="error">加载失败，请稍后重试</td></tr>';
    }
}

// 渲染股票表格（带自选按钮）
function renderStockTableWithAction(tableId, stocks, isGainers) {
    const tbody = document.getElementById(tableId);
    
    if (!stocks || stocks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty">暂无数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = stocks.map((stock, index) => {
        const changeClass = stock.changePercent >= 0 ? 'positive' : 'negative';
        const changeSign = stock.changePercent >= 0 ? '+' : '';
        const isInWatchlist = watchlistCache.has(stock.symbol);
        
        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <div class="stock-name">${stock.name}</div>
                    <div class="stock-code">${stock.code}</div>
                </td>
                <td class="price">¥${stock.price.toFixed(2)}</td>
                <td class="${changeClass}">${changeSign}${stock.change.toFixed(2)}</td>
                <td class="${changeClass}">${changeSign}${stock.changePercent.toFixed(2)}%</td>
                <td>${formatVolume(stock.volume)}</td>
                <td>${stock.turnoverRate.toFixed(2)}%</td>
                <td>${stock.marketCap}</td>
                <td>
                    <button id="btn-${stock.symbol}" 
                            class="watchlist-btn ${isInWatchlist ? 'btn-remove' : 'btn-add'}"
                            onclick="${isInWatchlist ? `removeFromWatchlist('${stock.symbol}')` : `addToWatchlist('${stock.symbol}', '${stock.name}', '${stock.code}')`}"
                            ${isInWatchlist ? 'disabled' : ''}>
                        ${isInWatchlist ? '已添加' : '加自选'}
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 渲染成交榜表格
function renderVolumeTableWithAction(tableId, stocks) {
    const tbody = document.getElementById(tableId);
    
    if (!stocks || stocks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty">暂无数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = stocks.map((stock, index) => {
        const changeClass = stock.changePercent >= 0 ? 'positive' : 'negative';
        const changeSign = stock.changePercent >= 0 ? '+' : '';
        const isInWatchlist = watchlistCache.has(stock.symbol);
        
        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <div class="stock-name">${stock.name}</div>
                    <div class="stock-code">${stock.code}</div>
                </td>
                <td class="price">¥${stock.price.toFixed(2)}</td>
                <td class="${changeClass}">${changeSign}${stock.change.toFixed(2)}</td>
                <td class="${changeClass}">${changeSign}${stock.changePercent.toFixed(2)}%</td>
                <td>${formatVolume(stock.volume)}</td>
                <td>${formatAmount(stock.amount)}</td>
                <td>${stock.turnoverRate.toFixed(2)}%</td>
                <td>
                    <button id="btn-${stock.symbol}" 
                            class="watchlist-btn ${isInWatchlist ? 'btn-remove' : 'btn-add'}"
                            onclick="${isInWatchlist ? `removeFromWatchlist('${stock.symbol}')` : `addToWatchlist('${stock.symbol}', '${stock.name}', '${stock.code}')`}"
                            ${isInWatchlist ? 'disabled' : ''}>
                        ${isInWatchlist ? '已添加' : '加自选'}
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 渲染板块网格
function renderSectors(containerId, sectors) {
    const container = document.getElementById(containerId);
    
    if (!sectors || sectors.length === 0) {
        container.innerHTML = '<div class="empty">暂无数据</div>';
        return;
    }
    
    container.innerHTML = sectors.map(sector => {
        const changeClass = sector.changePercent >= 0 ? 'positive' : 'negative';
        const changeSign = sector.changePercent >= 0 ? '+' : '';
        
        return `
            <div class="sector-card">
                <div class="sector-header">
                    <div class="sector-name">${sector.name}</div>
                    <div class="sector-change ${changeClass}">${changeSign}${sector.changePercent.toFixed(2)}%</div>
                </div>
                <div class="sector-leader">
                    <span class="label">领涨股:</span>
                    <span class="leader-name">${sector.leaderName || '-'}</span>
                    <span class="leader-change ${changeClass}">${changeSign}${(sector.leaderChange || 0).toFixed(2)}%</span>
                </div>
                <div class="sector-stats">
                    <div class="stat">
                        <span class="stat-value positive">${sector.risingStocks || 0}</span> 涨
                    </div>
                    <div class="stat">
                        <span class="stat-value negative">${sector.fallingStocks || 0}</span> 跌
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 添加到自选
async function addToWatchlist(symbol, name, code) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/watchlist`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ symbol, name, code })
        });
        
        const result = await response.json();
        
        if (result.success) {
            watchlistCache.add(symbol);
            updateButtonState(symbol, true);
            showToast('已添加到自选');
        } else {
            showToast(result.message || '添加失败');
        }
    } catch (error) {
        console.error('添加自选失败:', error);
        showToast('添加失败，请稍后重试');
    }
}

// 从自选删除
async function removeFromWatchlist(symbol) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/watchlist/${symbol}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (result.success) {
            watchlistCache.delete(symbol);
            updateButtonState(symbol, false);
            showToast('已从自选删除');
            
            // 如果在自选标签页，刷新列表
            const watchlistTab = document.querySelector('.tab-btn[data-tab="watchlist"]');
            if (watchlistTab && watchlistTab.classList.contains('active')) {
                loadWatchlist();
            }
        } else {
            showToast(result.message || '删除失败');
        }
    } catch (error) {
        console.error('删除自选失败:', error);
        showToast('删除失败，请稍后重试');
    }
}

// 更新按钮状态
function updateButtonState(symbol, isInWatchlist) {
    const buttons = document.querySelectorAll(`[id="btn-${symbol}"]`);
    buttons.forEach(btn => {
        if (isInWatchlist) {
            btn.classList.remove('btn-add');
            btn.classList.add('btn-remove');
            btn.textContent = '已添加';
            btn.onclick = () => removeFromWatchlist(symbol);
        } else {
            btn.classList.remove('btn-remove');
            btn.classList.add('btn-add');
            btn.textContent = '加自选';
            // 需要重新绑定添加事件，这里简化处理，刷新页面
        }
    });
}

// 显示提示
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// 生成市场总结（调用AI API）
async function generateMarketSummary(gainers, losers, sectors) {
    const summaryEl = document.getElementById('marketSummary');
    if (!summaryEl) return;
    
    // 获取数据
    const gainersData = window.gainersData || [];
    const losersData = window.losersData || [];
    const sectorsData = window.sectorsData || [];
    
    if (gainersData.length === 0 || losersData.length === 0) {
        summaryEl.innerHTML = '<div class="loading">数据加载中...</div>';
        return;
    }
    
    // 准备数据给AI
    const marketData = {
        topGainers: gainersData.slice(0, 5).map(s => ({ name: s.name, change: s.changePercent })),
        topLosers: losersData.slice(0, 5).map(s => ({ name: s.name, change: s.changePercent })),
        topSectors: sectorsData.slice(0, 3).map(s => ({ name: s.name, change: s.changePercent })),
        upCount: gainersData.length,
        downCount: losersData.length,
        updateTime: new Date().toLocaleString('zh-CN')
    };
    
    try {
        summaryEl.innerHTML = '<div class="loading">AI正在分析市场...</div>';
        
        const response = await fetch(`${API_BASE_URL}/api/ai/market-summary`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(marketData)
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.summary) {
                renderAISummary(result.summary, marketData);
                return;
            }
        }
        
        // 如果AI接口失败，使用本地生成
        fallbackSummary(marketData);
        
    } catch (error) {
        console.error('AI总结失败:', error);
        fallbackSummary(marketData);
    }
}

// 渲染AI总结
function renderAISummary(summary, data) {
    const summaryEl = document.getElementById('marketSummary');
    
    summaryEl.innerHTML = `
        <div class="summary-text">
            <div class="ai-summary-content">${summary.replace(/\n/g, '<br>')}</div>
        </div>
        
        <div class="summary-stats">
            <div class="stat-item">
                <div class="stat-value positive">+${data.topGainers[0]?.change || 0}%</div>
                <div class="stat-label">最大涨幅</div>
            </div>
            <div class="stat-item">
                <div class="stat-value negative">${data.topLosers[0]?.change || 0}%</div>
                <div class="stat-label">最大跌幅</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${data.upCount}</div>
                <div class="stat-label">上涨家数</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${data.downCount}</div>
                <div class="stat-label">下跌家数</div>
            </div>
        </div>
    `;
}

// 本地备用总结
function fallbackSummary(data) {
    const summaryEl = document.getElementById('marketSummary');
    const topGainer = data.topGainers[0] || { name: '--', change: 0 };
    const topLoser = data.topLosers[0] || { name: '--', change: 0 };
    const topSector = data.topSectors[0] || { name: '--', change: 0 };
    const marketSentiment = data.upCount > data.downCount ? '偏多' : data.upCount < data.downCount ? '偏空' : '震荡';
    
    summaryEl.innerHTML = `
        <div class="summary-text">
            <p>今日市场<span class="highlight ${data.upCount > data.downCount ? 'positive' : 'negative'}">${marketSentiment}</span>，
            上涨家数 <span class="positive">${data.upCount}</span> 只，下跌家数 <span class="negative">${data.downCount}</span> 只。</p>
            
            <p>🔥 最强个股：<span class="highlight">${topGainer.name}</span> 
            涨幅 <span class="positive">+${topGainer.change}%</span></p>
            
            <p>❄️ 最弱个股：<span class="highlight">${topLoser.name}</span> 
            跌幅 <span class="negative">${topLoser.change}%</span></p>
            
            <p>🏭 最强板块：<span class="highlight">${topSector.name}</span> 
            涨幅 <span class="positive">+${topSector.change}%</span></p>
        </div>
        
        <div class="summary-stats">
            <div class="stat-item">
                <div class="stat-value positive">+${topGainer.change}%</div>
                <div class="stat-label">最大涨幅</div>
            </div>
            <div class="stat-item">
                <div class="stat-value negative">${topLoser.change}%</div>
                <div class="stat-label">最大跌幅</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${data.upCount}</div>
                <div class="stat-label">上涨家数</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${data.downCount}</div>
                <div class="stat-label">下跌家数</div>
            </div>
        </div>
    `;
}

// 格式化成交量
function formatVolume(volume) {
    if (volume >= 100000000) {
        return (volume / 100000000).toFixed(2) + '亿';
    } else if (volume >= 10000) {
        return (volume / 10000).toFixed(2) + '万';
    }
    return volume.toString();
}

// 格式化成交额
function formatAmount(amount) {
    if (amount >= 10000) {
        return (amount / 10000).toFixed(2) + '亿';
    }
    return amount.toFixed(2) + '万';
}
