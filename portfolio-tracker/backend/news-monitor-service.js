/**
 * 新闻舆情监控服务
 * 监控持仓股票的相关新闻和舆情
 */

const axios = require('axios');
const cheerio = require('cheerio');

class NewsMonitorService {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 30 * 60 * 1000; // 30分钟缓存
        this.tavilyApiKey = process.env.TAVILY_API_KEY;
    }

    /**
     * 搜索股票相关新闻
     * @param {string} symbol - 股票代码
     * @param {string} name - 股票名称
     * @param {string} market - 市场
     * @returns {Promise<Array>} 新闻列表
     */
    async searchStockNews(symbol, name, market) {
        const cacheKey = `${symbol}_news`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        try {
            // 构建搜索关键词
            const keywords = this.buildSearchKeywords(symbol, name, market);
            
            // 使用Tavily API搜索新闻
            const news = await this.searchWithTavily(keywords);
            
            // AI分析新闻情绪
            const analyzedNews = await this.analyzeSentiment(news, symbol, name);
            
            this.cache.set(cacheKey, {
                data: analyzedNews,
                timestamp: Date.now()
            });

            return analyzedNews;
        } catch (error) {
            console.error(`[NewsMonitor] 搜索 ${symbol} 新闻失败:`, error.message);
            return [];
        }
    }

    /**
     * 构建搜索关键词
     */
    buildSearchKeywords(symbol, name, market) {
        const keywords = [];
        
        if (market === 'US') {
            keywords.push(`${symbol} stock news`);
            keywords.push(`${name} earnings news`);
        } else if (market === 'HK' || market === '港股') {
            keywords.push(`${name} ${symbol} 港股 新闻`);
            keywords.push(`${name} 业绩 公告`);
        } else {
            keywords.push(`${name} ${symbol} 股票 新闻`);
            keywords.push(`${name} 财报 公告`);
        }
        
        return keywords;
    }

    /**
     * 使用Tavily API搜索
     */
    async searchWithTavily(keywords) {
        if (!this.tavilyApiKey) {
            console.warn('[NewsMonitor] Tavily API Key未配置，使用模拟数据');
            return this.getMockNews();
        }

        try {
            const response = await axios.post('https://api.tavily.com/search', {
                api_key: this.tavilyApiKey,
                query: keywords[0],
                search_depth: 'advanced',
                max_results: 10,
                include_domains: [
                    'bloomberg.com', 'reuters.com', 'cnbc.com', 'wsj.com',
                    'ft.com', 'marketwatch.com', 'seekingalpha.com',
                    '36kr.com', 'wallstreetcn.com', 'cls.cn'
                ]
            });

            return response.data.results.map(item => ({
                title: item.title,
                url: item.url,
                content: item.content,
                publishedAt: item.published_date || new Date().toISOString(),
                source: item.source || '未知来源'
            }));
        } catch (error) {
            console.error('[NewsMonitor] Tavily API错误:', error.message);
            return this.getMockNews();
        }
    }

    /**
     * AI分析新闻情绪
     */
    async analyzeSentiment(news, symbol, name) {
        // 简单的关键词情绪分析
        const positiveWords = ['利好', '增长', '上涨', '突破', '超预期', '盈利', '扩张', '合作', '创新', 'lead', 'growth', 'profit', 'beat', 'strong'];
        const negativeWords = ['利空', '下跌', '亏损', '裁员', '诉讼', '监管', '调查', 'miss', 'loss', 'decline', 'fall', 'risk', 'concern'];
        
        return news.map(item => {
            const text = `${item.title} ${item.content}`.toLowerCase();
            let score = 0;
            
            positiveWords.forEach(word => {
                if (text.includes(word.toLowerCase())) score += 1;
            });
            
            negativeWords.forEach(word => {
                if (text.includes(word.toLowerCase())) score -= 1;
            });
            
            let sentiment, sentimentColor;
            if (score > 0) {
                sentiment = 'positive';
                sentimentColor = '#52C41A';
            } else if (score < 0) {
                sentiment = 'negative';
                sentimentColor = '#FF4D4F';
            } else {
                sentiment = 'neutral';
                sentimentColor = '#8C8C8C';
            }
            
            return {
                ...item,
                sentiment,
                sentimentColor,
                sentimentScore: score,
                relevance: this.calculateRelevance(text, symbol, name)
            };
        }).sort((a, b) => b.relevance - a.relevance);
    }

    /**
     * 计算新闻相关性
     */
    calculateRelevance(text, symbol, name) {
        let score = 0;
        if (text.includes(symbol.toLowerCase())) score += 3;
        if (text.includes(name.toLowerCase())) score += 2;
        return score;
    }

    /**
     * 获取模拟新闻数据
     */
    getMockNews() {
        return [
            {
                title: '新能源汽车销量同比增长35%，行业景气度持续提升',
                url: '#',
                content: '根据最新数据，新能源汽车销量同比增长35%，龙头企业市场份额进一步扩大...',
                publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                source: '财经新闻',
                sentiment: 'positive',
                sentimentColor: '#52C41A',
                sentimentScore: 2,
                relevance: 3
            },
            {
                title: '美联储暗示加息放缓，科技股有望受益',
                url: '#',
                content: '美联储主席在最新讲话中表示，通胀数据好转，加息步伐可能放缓...',
                publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
                source: '国际金融',
                sentiment: 'positive',
                sentimentColor: '#52C41A',
                sentimentScore: 1,
                relevance: 2
            },
            {
                title: '游戏行业监管政策保持稳定，版号发放常态化',
                url: '#',
                content: '相关部门表示，游戏行业监管政策将保持稳定，版号发放进入常态化阶段...',
                publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
                source: '行业新闻',
                sentiment: 'neutral',
                sentimentColor: '#8C8C8C',
                sentimentScore: 0,
                relevance: 3
            }
        ];
    }

    /**
     * 批量获取持仓股票新闻
     */
    async getPortfolioNews(portfolio, limit = 20) {
        const allNews = [];
        
        for (const stock of portfolio.slice(0, 5)) { // 限制前5只股票避免API限制
            const news = await this.searchStockNews(stock.symbol, stock.name, stock.market);
            allNews.push(...news.map(item => ({
                ...item,
                symbol: stock.symbol,
                name: stock.name
            })));
        }
        
        // 去重并排序
        const uniqueNews = allNews.filter((item, index, self) =>
            index === self.findIndex(t => t.title === item.title)
        );
        
        return uniqueNews
            .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
            .slice(0, limit);
    }

    /**
     * 获取重要新闻（情绪极端或高相关性）
     */
    async getImportantNews(portfolio) {
        const news = await this.getPortfolioNews(portfolio, 50);
        
        return news.filter(item => 
            Math.abs(item.sentimentScore) >= 2 || item.relevance >= 3
        ).slice(0, 10);
    }
}

module.exports = new NewsMonitorService();
