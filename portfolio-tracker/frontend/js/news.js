/**
 * 新闻监控页面逻辑
 */

const API_BASE_URL = window.location.origin;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadNews();
});

// 获取认证头
function getAuthHeaders() {
    const token = localStorage.getItem('token') || '';
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

// 加载新闻
async function loadNews() {
    const newsList = document.getElementById('newsList');
    newsList.innerHTML = '<div class="loading">加载中...</div>';
    
    try {
        // 先获取持仓列表
        const portfolioResponse = await fetch(`${API_BASE_URL}/api/portfolio`, {
            headers: getAuthHeaders()
        });
        
        if (!portfolioResponse.ok) {
            if (portfolioResponse.status === 401) {
                newsList.innerHTML = `
                    <div class="empty">
                        请先<a href="login.html">登录</a>后查看新闻监控
                    </div>
                `;
                return;
            }
            throw new Error('获取持仓失败');
        }
        
        const portfolioResult = await portfolioResponse.json();
        
        if (!portfolioResult.portfolio || portfolioResult.portfolio.length === 0) {
            newsList.innerHTML = `
                <div class="empty">暂无持仓，请先添加持仓股票</div>
            `;
            updateStats(0, 0, 0, 0);
            return;
        }
        
        // 获取每只股票的新闻
        const allNews = [];
        for (const stock of portfolioResult.portfolio.slice(0, 5)) {
            try {
                const newsResponse = await fetch(`${API_BASE_URL}/api/news/${stock.symbol}?limit=5`, {
                    headers: getAuthHeaders()
                });
                
                if (newsResponse.ok) {
                    const newsResult = await newsResponse.json();
                    if (newsResult.success && newsResult.news) {
                        allNews.push(...newsResult.news.map(n => ({
                            ...n,
                            stockSymbol: stock.symbol,
                            stockName: stock.name
                        })));
                    }
                }
            } catch (err) {
                console.error(`获取 ${stock.symbol} 新闻失败:`, err);
            }
        }
        
        // 按时间排序
        allNews.sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
        
        // 更新统计
        const importantCount = allNews.filter(n => n.is_important).length;
        const positiveCount = allNews.filter(n => n.sentiment === 'positive').length;
        const negativeCount = allNews.filter(n => n.sentiment === 'negative').length;
        updateStats(allNews.length, importantCount, positiveCount, negativeCount);
        
        // 渲染新闻
        renderNews(allNews);
        
    } catch (error) {
        console.error('加载新闻失败:', error);
        newsList.innerHTML = `
            <div class="error">加载失败，请稍后重试</div>
        `;
    }
}

// 更新统计
function updateStats(total, important, positive, negative) {
    document.getElementById('totalNews').textContent = total;
    document.getElementById('importantNews').textContent = important;
    document.getElementById('positiveNews').textContent = positive;
    document.getElementById('negativeNews').textContent = negative;
}

// 渲染新闻列表
function renderNews(news) {
    const newsList = document.getElementById('newsList');
    
    if (news.length === 0) {
        newsList.innerHTML = '<div class="empty">暂无相关新闻</div>';
        return;
    }
    
    newsList.innerHTML = news.map(item => {
        const sentimentClass = item.sentiment || 'neutral';
        const importantClass = item.is_important ? 'important' : '';
        const date = new Date(item.published_at || item.created_at).toLocaleString('zh-CN');
        
        return `
            <div class="news-item ${sentimentClass} ${importantClass}">
                <div class="news-header">
                    <a href="${item.url || '#'}" target="_blank" class="news-title">
                        ${item.title}
                    </a>
                    ${item.is_important ? '<span class="news-badge important">重要</span>' : ''}
                    ${item.sentiment === 'positive' ? '<span class="news-badge positive">正面</span>' : ''}
                    ${item.sentiment === 'negative' ? '<span class="news-badge negative">负面</span>' : ''}
                </div>
                <div class="news-meta">
                    <span>${item.source || '未知来源'}</span>
                    <span>${date}</span>
                </div>
                ${item.summary ? `<div class="news-summary">${item.summary.substring(0, 200)}${item.summary.length > 200 ? '...' : ''}</div>` : ''}
                <div class="news-footer">
                    <span class="news-stock">${item.stockName} (${item.stockSymbol})</span>
                    ${item.relevance_score ? `<span class="news-relevance">相关度: ${(item.relevance_score * 100).toFixed(0)}%</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}
