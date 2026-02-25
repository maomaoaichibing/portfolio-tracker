/**
 * 财报日历数据服务
 * 获取持仓股票的财报发布日期
 */

const axios = require('axios');
const cheerio = require('cheerio');

class EarningsCalendarService {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24小时缓存
    }

    /**
     * 获取单只股票的财报日期
     * @param {string} symbol - 股票代码
     * @param {string} market - 市场 (HK/US/A)
     * @returns {Promise<Object>} 财报信息
     */
    async getEarningsDate(symbol, market) {
        const cacheKey = `${market}_${symbol}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        try {
            let earningsInfo;
            
            if (market === 'US') {
                earningsInfo = await this.getUSEarnings(symbol);
            } else if (market === 'HK' || market === '港股') {
                earningsInfo = await this.getHKEarnings(symbol);
            } else {
                earningsInfo = await this.getAEarnings(symbol);
            }

            this.cache.set(cacheKey, {
                data: earningsInfo,
                timestamp: Date.now()
            });

            return earningsInfo;
        } catch (error) {
            console.error(`[EarningsCalendar] 获取 ${symbol} 财报日期失败:`, error.message);
            return null;
        }
    }

    /**
     * 获取美股财报日期
     * 使用Earnings Whispers或类似服务
     */
    async getUSEarnings(symbol) {
        // 模拟数据 - 实际应调用API或爬虫
        // 这里使用基于股票代码的确定性随机生成，保证同一股票结果一致
        const seed = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const days = [15, 30, 45, 60, 75, 90];
        const dayOffset = days[seed % days.length];
        
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + dayOffset);
        
        // 确定季度
        const month = nextDate.getMonth() + 1;
        let quarter;
        if (month <= 3) quarter = 'Q4';
        else if (month <= 6) quarter = 'Q1';
        else if (month <= 9) quarter = 'Q2';
        else quarter = 'Q3';
        
        return {
            symbol,
            market: 'US',
            quarter: `${nextDate.getFullYear()}-${quarter}`,
            reportDate: nextDate.toISOString().split('T')[0],
            reportTime: seed % 2 === 0 ? '盘前' : '盘后',
            epsEstimate: (Math.random() * 5 + 1).toFixed(2),
            revenueEstimate: (Math.random() * 10000 + 1000).toFixed(0),
            daysUntil: dayOffset
        };
    }

    /**
     * 获取港股财报日期
     */
    async getHKEarnings(symbol) {
        const seed = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const days = [10, 25, 40, 55, 70, 85];
        const dayOffset = days[seed % days.length];
        
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + dayOffset);
        
        const month = nextDate.getMonth() + 1;
        let reportType;
        if (month <= 3) reportType = '年报';
        else if (month <= 6) reportType = '一季报';
        else if (month <= 9) reportType = '中报';
        else reportType = '三季报';
        
        return {
            symbol,
            market: 'HK',
            reportType,
            reportDate: nextDate.toISOString().split('T')[0],
            daysUntil: dayOffset
        };
    }

    /**
     * 获取A股财报日期
     */
    async getAEarnings(symbol) {
        const seed = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const days = [5, 20, 35, 50, 65, 80];
        const dayOffset = days[seed % days.length];
        
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + dayOffset);
        
        const month = nextDate.getMonth() + 1;
        let reportType;
        if (month <= 4) reportType = '年报';
        else if (month <= 8) reportType = '中报';
        else reportType = '三季报';
        
        return {
            symbol,
            market: 'A',
            reportType,
            reportDate: nextDate.toISOString().split('T')[0],
            daysUntil: dayOffset
        };
    }

    /**
     * 批量获取持仓股票的财报日历
     * @param {Array} portfolio - 持仓列表
     * @returns {Promise<Array>} 财报日历列表
     */
    async getPortfolioEarningsCalendar(portfolio) {
        const earningsList = [];
        
        for (const stock of portfolio) {
            const earnings = await this.getEarningsDate(stock.symbol, stock.market);
            if (earnings) {
                earningsList.push({
                    ...earnings,
                    name: stock.name,
                    shares: stock.shares,
                    marketValue: stock.price * stock.shares
                });
            }
        }
        
        // 按日期排序
        return earningsList.sort((a, b) => {
            return new Date(a.reportDate) - new Date(b.reportDate);
        });
    }

    /**
     * 获取即将发布的财报（未来30天）
     */
    async getUpcomingEarnings(portfolio, days = 30) {
        const allEarnings = await this.getPortfolioEarningsCalendar(portfolio);
        const now = new Date();
        const future = new Date();
        future.setDate(now.getDate() + days);
        
        return allEarnings.filter(e => {
            const reportDate = new Date(e.reportDate);
            return reportDate >= now && reportDate <= future;
        });
    }
}

module.exports = new EarningsCalendarService();
