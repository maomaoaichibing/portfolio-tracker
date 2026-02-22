/**
 * 统一股票数据服务 - 支持多数据源
 * 优先使用东方财富，失败时回退到新浪财经
 */

const sinaService = require('./stock-service');
const eastmoneyService = require('./eastmoney-service');

// 数据源配置
const DATA_SOURCE = process.env.STOCK_DATA_SOURCE || 'eastmoney'; // 'eastmoney' | 'sina' | 'auto'

/**
 * 获取单只股票实时价格
 * @param {string} symbol - 股票代码
 * @returns {Promise<Object>} 股票数据
 */
async function getStockPrice(symbol) {
    if (DATA_SOURCE === 'sina') {
        return await sinaService.getStockPrice(symbol);
    }
    
    if (DATA_SOURCE === 'eastmoney') {
        const result = await eastmoneyService.getStockPrice(symbol);
        if (result) return result;
        // 失败时回退到新浪财经
        console.log(`[DataService] 东方财富获取 ${symbol} 失败，回退到新浪财经`);
        return await sinaService.getStockPrice(symbol);
    }
    
    // auto 模式：优先东方财富，失败回退
    const result = await eastmoneyService.getStockPrice(symbol);
    if (result) return result;
    
    console.log(`[DataService] 东方财富获取 ${symbol} 失败，回退到新浪财经`);
    return await sinaService.getStockPrice(symbol);
}

/**
 * 批量获取股票实时价格
 * @param {Array<string>} symbols - 股票代码数组
 * @returns {Promise<Array>} 股票数据数组
 */
async function getBatchStockPrices(symbols) {
    if (DATA_SOURCE === 'sina') {
        return await sinaService.getBatchStockPrices(symbols);
    }
    
    if (DATA_SOURCE === 'eastmoney') {
        const results = await eastmoneyService.getBatchStockPrices(symbols);
        if (results.length > 0) return results;
        // 失败时回退到新浪财经
        console.log(`[DataService] 东方财富批量获取失败，回退到新浪财经`);
        return await sinaService.getBatchStockPrices(symbols);
    }
    
    // auto 模式
    const results = await eastmoneyService.getBatchStockPrices(symbols);
    if (results.length > 0) return results;
    
    console.log(`[DataService] 东方财富批量获取失败，回退到新浪财经`);
    return await sinaService.getBatchStockPrices(symbols);
}

/**
 * 获取股票历史数据
 * @param {string} symbol - 股票代码
 * @param {number} days - 天数
 * @returns {Promise<Array>} 历史数据
 */
async function getStockHistory(symbol, days = 30) {
    // 优先使用东方财富的 K 线数据
    const klineData = await eastmoneyService.getKLineData(symbol, days);
    if (klineData.length > 0) {
        // 转换格式为统一格式
        return klineData.map(item => ({
            date: item.date,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume
        }));
    }
    
    // 回退到新浪财经
    console.log(`[DataService] 东方财富获取 ${symbol} 历史数据失败，回退到新浪财经`);
    return await sinaService.getStockHistory(symbol, days);
}

/**
 * 更新所有持仓的最新价格
 * @param {Object} db - SQLite 数据库实例
 * @param {number} userId - 用户ID（可选）
 */
async function updatePortfolioPrices(db, userId = null) {
    return new Promise((resolve, reject) => {
        let sql = 'SELECT symbol FROM portfolio';
        let params = [];
        
        if (userId) {
            sql += ' WHERE user_id = ?';
            params.push(userId);
        }
        
        db.all(sql, params, async (err, rows) => {
            if (err) {
                return reject(err);
            }
            
            if (rows.length === 0) {
                return resolve({ updated: 0, total: 0 });
            }
            
            const symbols = rows.map(r => r.symbol);
            const prices = await getBatchStockPrices(symbols);
            
            let updated = 0;
            for (const price of prices) {
                if (price && price.price > 0) {
                    let updateSql = 'UPDATE portfolio SET price = ?, updated_at = CURRENT_TIMESTAMP WHERE symbol = ?';
                    let updateParams = [price.price, price.symbol];
                    
                    if (userId) {
                        updateSql += ' AND user_id = ?';
                        updateParams.push(userId);
                    }
                    
                    db.run(updateSql, updateParams, (err) => {
                        if (!err) updated++;
                    });
                }
            }
            
            resolve({ updated, total: symbols.length });
        });
    });
}

/**
 * 搜索股票
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Array>} 股票列表
 */
async function searchStocks(keyword) {
    return await eastmoneyService.searchStocks(keyword);
}

module.exports = {
    getStockPrice,
    getBatchStockPrices,
    getStockHistory,
    updatePortfolioPrices,
    searchStocks,
    DATA_SOURCE
};
