/**
 * 新闻监控服务 - 抓取财经新闻并分析相关性
 */

const axios = require('axios');
const cheerio = require('cheerio');

// 新闻源配置
const NEWS_SOURCES = {
    sina: {
        name: '新浪财经',
        url: 'https://finance.sina.com.cn/stock/',
        searchUrl: (keyword) => `https://search.sina.com.cn/?q=${encodeURIComponent(keyword)}&c=news&from=channel&ie=utf-8`
    },
    eastmoney: {
        name: '东方财富',
        url: 'https://finance.eastmoney.com/',
        searchUrl: (keyword) => `https://search.eastmoney.com/web?q=${encodeURIComponent(keyword)}`
    },
    ithome: {
        name: 'IT之家',
        url: 'https://www.ithome.com/',
        rss: 'https://www.ithome.com/rss/'
    }
};

/**
 * 搜索股票相关新闻
 * @param {string} symbol - 股票代码
 * @param {string} name - 股票名称
 * @returns {Promise<Array>} 新闻列表
 */
async function searchStockNews(symbol, name) {
    const news = [];
    
    try {
        // 使用 Tavily 搜索（如果有配置）
        if (process.env.TAVILY_API_KEY) {
            const tavilyNews = await searchWithTavily(symbol, name);
            news.push(...tavilyNews);
        }
        
        // 使用新浪财经搜索
        const sinaNews = await searchWithSina(name);
        news.push(...sinaNews);
        
        // 去重并排序
        const uniqueNews = deduplicateNews(news);
        return uniqueNews.slice(0, 10); // 返回最新10条
        
    } catch (error) {
        console.error(`搜索 ${symbol} 新闻失败:`, error.message);
        return [];
    }
}

/**
 * 使用 Tavily API 搜索新闻
 */
async function searchWithTavily(symbol, name) {
    try {
        const response = await axios.post('https://api.tavily.com/search', {
            api_key: process.env.TAVILY_API_KEY,
            query: `${name} ${symbol} 股票 新闻`,
            search_depth: 'basic',
            include_answer: false,
            max_results: 5
        }, {
            timeout: 15000
        });
        
        return response.data.results.map(item => ({
            title: item.title,
            url: item.url,
            summary: item.content?.substring(0, 200) || '',
            source: item.url,
            publishedAt: new Date().toISOString(),
            relevanceScore: item.score || 0.5
        }));
    } catch (error) {
        console.error('Tavily 搜索失败:', error.message);
        return [];
    }
}

/**
 * 使用新浪财经搜索
 */
async function searchWithSina(keyword) {
    try {
        const url = NEWS_SOURCES.sina.searchUrl(keyword);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        const news = [];
        
        // 解析搜索结果
        $('.box-result .r-info').each((i, elem) => {
            if (i >= 5) return false; // 只取前5条
            
            const titleElem = $(elem).find('h2 a');
            const title = titleElem.text().trim();
            const url = titleElem.attr('href');
            const summary = $(elem).find('.content').text().trim();
            const timeText = $(elem).find('.fgray_time').text().trim();
            
            if (title && url) {
                news.push({
                    title,
                    url,
                    summary: summary.substring(0, 200),
                    source: '新浪财经',
                    publishedAt: parseTime(timeText),
                    relevanceScore: 0.7
                });
            }
        });
        
        return news;
    } catch (error) {
        console.error('新浪财经搜索失败:', error.message);
        return [];
    }
}

/**
 * 分析新闻与监控指标的相关性
 * @param {Object} news - 新闻对象
 * @param {Array} monitoringMetrics - 监控指标列表
 * @returns {Object} 分析结果
 */
async function analyzeNewsRelevance(news, monitoringMetrics) {
    const relevance = {
        isRelevant: false,
        matchedMetrics: [],
        sentiment: 'neutral', // positive, negative, neutral
        importance: 'low', // high, medium, low
        summary: ''
    };
    
    const titleLower = news.title.toLowerCase();
    const summaryLower = news.summary.toLowerCase();
    const content = titleLower + ' ' + summaryLower;
    
    // 检查与监控指标的相关性
    for (const metric of monitoringMetrics) {
        const metricName = metric.metric_name || metric.metric || '';
        const keywords = extractKeywords(metricName);
        
        for (const keyword of keywords) {
            if (content.includes(keyword.toLowerCase())) {
                relevance.isRelevant = true;
                relevance.matchedMetrics.push(metricName);
                break;
            }
        }
    }
    
    // 情感分析（简单规则）
    const positiveWords = ['增长', '上涨', '利好', '超预期', '突破', '创新', '提升', '改善'];
    const negativeWords = ['下跌', '下滑', '亏损', '不及预期', '风险', '监管', '处罚', '召回'];
    
    let positiveCount = positiveWords.filter(w => content.includes(w)).length;
    let negativeCount = negativeWords.filter(w => content.includes(w)).length;
    
    if (positiveCount > negativeCount) {
        relevance.sentiment = 'positive';
    } else if (negativeCount > positiveCount) {
        relevance.sentiment = 'negative';
    }
    
    // 重要性判断
    if (relevance.matchedMetrics.length > 0) {
        relevance.importance = 'high';
    } else if (positiveCount + negativeCount >= 3) {
        relevance.importance = 'medium';
    }
    
    return relevance;
}

/**
 * 提取关键词
 */
function extractKeywords(text) {
    // 简单的关键词提取，可以根据需要扩展
    const commonKeywords = {
        '营收': ['营收', '收入', '销售额', '业绩'],
        '利润': ['利润', '净利润', '盈利', '毛利率'],
        '估值': ['估值', 'PE', 'PB', '市盈率', '市净率'],
        '政策': ['政策', '监管', '法规', '补贴'],
        '竞争': ['竞争', '市场份额', '对手', '竞品'],
        '订单': ['订单', '合同', '中标', '签约'],
        '产品': ['产品', '新品', '发布', '上市'],
        '技术': ['技术', '专利', '研发', '创新']
    };
    
    for (const [key, keywords] of Object.entries(commonKeywords)) {
        if (text.includes(key)) {
            return keywords;
        }
    }
    
    return [text];
}

/**
 * 解析时间字符串
 */
function parseTime(timeText) {
    try {
        // 尝试解析各种格式
        const now = new Date();
        
        if (timeText.includes('分钟前')) {
            const minutes = parseInt(timeText);
            return new Date(now.getTime() - minutes * 60000).toISOString();
        }
        
        if (timeText.includes('小时前')) {
            const hours = parseInt(timeText);
            return new Date(now.getTime() - hours * 3600000).toISOString();
        }
        
        if (timeText.includes('今天')) {
            return now.toISOString();
        }
        
        if (timeText.includes('昨天')) {
            return new Date(now.getTime() - 86400000).toISOString();
        }
        
        // 尝试直接解析
        const date = new Date(timeText);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
        
        return now.toISOString();
    } catch (e) {
        return new Date().toISOString();
    }
}

/**
 * 去重新闻
 */
function deduplicateNews(news) {
    const seen = new Set();
    return news.filter(item => {
        const key = item.title.substring(0, 30); // 取标题前30字作为去重键
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    }).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

/**
 * 生成每日新闻摘要
 * @param {Array} portfolio - 持仓列表
 * @param {Object} db - 数据库实例
 */
async function generateDailyNewsSummary(portfolio, db) {
    const summary = {
        date: new Date().toISOString().split('T')[0],
        totalNews: 0,
        importantNews: [],
        byStock: {}
    };
    
    for (const stock of portfolio) {
        // 获取该股票的监控指标
        const metrics = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM monitoring WHERE symbol = ? AND status = ?',
                [stock.symbol, 'active'],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        // 搜索新闻
        const news = await searchStockNews(stock.symbol, stock.name);
        
        // 分析相关性
        const relevantNews = [];
        for (const item of news) {
            const analysis = await analyzeNewsRelevance(item, metrics);
            if (analysis.isRelevant || analysis.importance === 'high') {
                relevantNews.push({
                    ...item,
                    analysis
                });
            }
        }
        
        if (relevantNews.length > 0) {
            summary.byStock[stock.symbol] = {
                name: stock.name,
                newsCount: relevantNews.length,
                news: relevantNews.slice(0, 3) // 每只股最多3条
            };
            summary.totalNews += relevantNews.length;
            
            // 收集重要新闻
            relevantNews.forEach(n => {
                if (n.analysis.importance === 'high') {
                    summary.importantNews.push({
                        stock: stock.name,
                        ...n
                    });
                }
            });
        }
    }
    
    return summary;
}

module.exports = {
    searchStockNews,
    analyzeNewsRelevance,
    generateDailyNewsSummary,
    searchWithTavily,
    searchWithSina
};