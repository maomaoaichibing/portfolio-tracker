/**
 * 股票数据服务 - 获取实时行情
 * 使用新浪财经 API（免费，无需 key）
 */

const axios = require('axios');
const apiCache = require('./api-cache-service');

// 新浪财经 API 基础 URL
const SINA_API_URL = 'https://hq.sinajs.cn';

/**
 * 转换股票代码为新浪格式
 * @param {string} symbol - 股票代码（如 600519.SH, AAPL）
 * @returns {string} 新浪格式代码
 */
function convertToSinaCode(symbol) {
    // 移除空格并转大写
    symbol = symbol.trim().toUpperCase();
    
    // 港股
    if (symbol.endsWith('.HK')) {
        return 'hk' + symbol.replace('.HK', '');
    }
    
    // 美股
    if (symbol.match(/^[A-Z]+$/)) {
        return 'gb_' + symbol.toLowerCase();
    }
    
    // A股 - 根据代码判断交易所
    const code = symbol.replace('.SH', '').replace('.SZ', '');
    if (symbol.endsWith('.SH') || code.startsWith('6') || code.startsWith('5')) {
        return 'sh' + code;
    }
    if (symbol.endsWith('.SZ') || code.startsWith('0') || code.startsWith('3')) {
        return 'sz' + code;
    }
    
    // 默认按 A 股处理
    return code.startsWith('6') ? 'sh' + code : 'sz' + code;
}

/**
 * 获取股票实时价格（带缓存）
 * @param {string} symbol - 股票代码
 * @returns {Promise<Object>} 股票数据
 */
async function getStockPrice(symbol) {
    // 使用缓存包装器
    return apiCache.wrap('stockPrice', symbol, async () => {
        try {
            const sinaCode = convertToSinaCode(symbol);
            const url = `${SINA_API_URL}/list=${sinaCode}`;
            
            const response = await axios.get(url, {
                headers: {
                    'Referer': 'https://finance.sina.com.cn',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000,
                responseType: 'arraybuffer' // 处理 GBK 编码
            });
            
            // 转换 GBK 到 UTF-8
            const iconv = require('iconv-lite');
            const data = iconv.decode(response.data, 'GBK');
            
            return parseSinaData(symbol, data);
        } catch (error) {
            console.error(`获取 ${symbol} 价格失败:`, error.message);
            return null;
        }
    });
}

/**
 * 批量获取股票实时价格
 * @param {Array<string>} symbols - 股票代码数组
 * @returns {Promise<Array>} 股票数据数组
 */
async function getBatchStockPrices(symbols) {
    try {
        const sinaCodes = symbols.map(convertToSinaCode).join(',');
        const url = `${SINA_API_URL}/list=${sinaCodes}`;
        
        const response = await axios.get(url, {
            headers: {
                'Referer': 'https://finance.sina.com.cn',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000,
            responseType: 'arraybuffer'
        });
        
        const iconv = require('iconv-lite');
        const data = iconv.decode(response.data, 'GBK');
        
        return parseBatchSinaData(symbols, data);
    } catch (error) {
        console.error('批量获取价格失败:', error.message);
        return [];
    }
}

/**
 * 解析新浪返回的数据
 */
function parseSinaData(symbol, data) {
    // 数据格式: var hq_str_sh600519="贵州茅台,1680.00,1675.00,1685.00,...";
    const match = data.match(/var hq_str_\w+="([^"]*)"/);
    if (!match || !match[1]) {
        return null;
    }
    
    const fields = match[1].split(',');
    if (fields.length < 3) {
        return null;
    }
    
    // 判断市场类型
    const isUS = symbol.match(/^[A-Z]+$/) && !symbol.match(/^(SH|SZ|HK)/);
    const isHK = symbol.includes('.HK') || symbol.startsWith('hk');
    
    let name, open, prevClose, current, high, low;
    
    if (isUS) {
        // 美股格式: 名称,当前价,涨跌幅,日期,时间,开盘价,最高价,最低价,...
        // gb_aapl="苹果,2026.000,131458.44,2026-02-20,23:44:01,264.580,2026.000,258.970,...
        name = fields[0];
        current = parseFloat(fields[1]);
        const changePercent = parseFloat(fields[2]);
        open = parseFloat(fields[5]) || current;
        high = parseFloat(fields[6]) || current;
        low = parseFloat(fields[7]) || current;
        // 通过涨跌幅反推昨收
        prevClose = changePercent !== 0 ? current / (1 + changePercent / 100) : current;
    } else if (isHK) {
        // 港股格式类似 A 股
        name = fields[0];
        open = parseFloat(fields[2]);
        prevClose = parseFloat(fields[3]);
        current = parseFloat(fields[6]);
        high = parseFloat(fields[4]);
        low = parseFloat(fields[5]);
    } else {
        // A股格式: 名称,今日开盘价,昨日收盘价,当前价,今日最高价,今日最低价,...
        name = fields[0];
        open = parseFloat(fields[1]);
        prevClose = parseFloat(fields[2]);
        current = parseFloat(fields[3]);
        high = parseFloat(fields[4]);
        low = parseFloat(fields[5]);
    }
    
    const change = current - prevClose;
    const changePercentCalc = prevClose > 0 ? (change / prevClose * 100) : 0;
    
    return {
        symbol,
        name,
        price: current,
        open,
        prevClose,
        high,
        low,
        change,
        changePercent: parseFloat(changePercentCalc.toFixed(2)),
        updatedAt: new Date().toISOString()
    };
}

/**
 * 解析批量数据
 */
function parseBatchSinaData(symbols, data) {
    const results = [];
    
    for (const symbol of symbols) {
        const sinaCode = convertToSinaCode(symbol);
        const regex = new RegExp(`var hq_str_${sinaCode}="([^"]*)"`);
        const match = data.match(regex);
        
        if (match && match[1]) {
            const parsed = parseSinaData(symbol, `var hq_str_${sinaCode}="${match[1]}"`);
            if (parsed) {
                results.push(parsed);
            }
        }
    }
    
    return results;
}

/**
 * 更新所有持仓的最新价格
 * @param {Object} db - SQLite 数据库实例
 */
async function updatePortfolioPrices(db) {
    return new Promise((resolve, reject) => {
        db.all('SELECT symbol FROM portfolio', [], async (err, rows) => {
            if (err) {
                return reject(err);
            }
            
            if (rows.length === 0) {
                return resolve({ updated: 0 });
            }
            
            const symbols = rows.map(r => r.symbol);
            const prices = await getBatchStockPrices(symbols);
            
            let updated = 0;
            for (const price of prices) {
                if (price && price.price > 0) {
                    db.run(
                        'UPDATE portfolio SET price = ?, updated_at = CURRENT_TIMESTAMP WHERE symbol = ?',
                        [price.price, price.symbol],
                        (err) => {
                            if (!err) updated++;
                        }
                    );
                }
            }
            
            resolve({ updated, total: symbols.length });
        });
    });
}

/**
 * 获取股票历史价格数据
 * @param {string} symbol - 股票代码
 * @param {number} days - 获取天数
 * @returns {Promise<Array>} 历史价格数组
 */
async function getStockHistory(symbol, days = 30) {
    // 返回模拟数据（实际项目中应该调用真实的 API）
    return generateMockHistory(symbol, days);
}

/**
 * 生成模拟历史数据
 */
function generateMockHistory(symbol, days) {
    const history = [];
    const basePrice = 100 + Math.random() * 100;
    let currentPrice = basePrice;
    
    const now = new Date();
    for (let i = days; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        
        // 随机波动
        const change = (Math.random() - 0.5) * 0.05;
        currentPrice = currentPrice * (1 + change);
        
        const dayHigh = currentPrice * (1 + Math.random() * 0.02);
        const dayLow = currentPrice * (1 - Math.random() * 0.02);
        const dayOpen = dayLow + Math.random() * (dayHigh - dayLow);
        
        history.push({
            date: date.toISOString().split('T')[0],
            open: parseFloat(dayOpen.toFixed(2)),
            high: parseFloat(dayHigh.toFixed(2)),
            low: parseFloat(dayLow.toFixed(2)),
            close: parseFloat(currentPrice.toFixed(2)),
            volume: Math.floor(Math.random() * 1000000)
        });
    }
    
    return history;
}

module.exports = {
    getStockPrice,
    getBatchStockPrices,
    updatePortfolioPrices,
    getStockHistory,
    convertToSinaCode
};
