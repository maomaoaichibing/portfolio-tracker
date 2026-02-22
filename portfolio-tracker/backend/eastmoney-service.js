/**
 * 东方财富数据源 - 获取股票实时行情和历史数据
 */

const axios = require('axios');

// 东方财富 API 基础配置
const EASTMONEY_API = {
    // 实时行情
    realtime: 'https://push2.eastmoney.com/api/qt/stock/get',
    // 批量行情
    batch: 'https://push2.eastmoney.com/api/qt/ulist.np/get',
    // K线数据
    kline: 'https://push2his.eastmoney.com/api/qt/stock/kline/get',
    // 股票列表
    stockList: 'https://push2.eastmoney.com/api/qt/clist/get'
};

/**
 * 转换股票代码为东方财富格式
 * @param {string} symbol - 股票代码（如 00700.HK, AAPL, 600519.SH）
 * @returns {string} 东方财富格式代码
 */
function convertToEastMoneyCode(symbol) {
    symbol = symbol.trim().toUpperCase();
    
    // 港股
    if (symbol.endsWith('.HK')) {
        return `116.${symbol.replace('.HK', '')}`;
    }
    
    // 美股
    if (/^[A-Z]+$/.test(symbol)) {
        return `105.${symbol}`;
    }
    
    // A股 - 上海
    if (symbol.endsWith('.SH') || /^6\d{5}$/.test(symbol)) {
        const code = symbol.replace('.SH', '');
        return `1.${code}`;
    }
    
    // A股 - 深圳
    if (symbol.endsWith('.SZ') || /^[0-3]\d{5}$/.test(symbol)) {
        const code = symbol.replace('.SZ', '');
        return `0.${code}`;
    }
    
    // 默认按 A 股处理
    return `1.${symbol}`;
}

/**
 * 获取单只股票实时行情
 * @param {string} symbol - 股票代码
 * @returns {Promise<Object>} 股票数据
 */
async function getStockPrice(symbol) {
    try {
        const secid = convertToEastMoneyCode(symbol);
        
        const response = await axios.get(EASTMONEY_API.realtime, {
            params: {
                secid: secid,
                fields: 'f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f170'
            },
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const data = response.data.data;
        if (!data) {
            return null;
        }
        
        // 解析字段
        // f43: 当前价(乘100), f44: 最高价(乘100), f45: 最低价(乘100)
        // f46: 开盘价(乘100), f47: 成交量, f48: 成交额
        // f57: 股票代码, f58: 股票名称, f60: 昨收(乘100)
        // f107: 市场, f170: 涨跌幅
        
        const price = data.f43 ? data.f43 / 100 : 0;
        const prevClose = data.f60 ? data.f60 / 100 : price;
        const change = price - prevClose;
        const changePercent = prevClose > 0 ? (change / prevClose * 100) : 0;
        
        return {
            symbol: symbol,
            name: data.f58 || symbol,
            code: data.f57 || symbol,
            price: price,
            open: data.f46 ? data.f46 / 100 : price,
            prevClose: prevClose,
            high: data.f44 ? data.f44 / 100 : price,
            low: data.f45 ? data.f45 / 100 : price,
            volume: data.f47 || 0,
            amount: data.f48 || 0,
            change: change,
            changePercent: parseFloat(changePercent.toFixed(2)),
            market: data.f107 || '',
            updatedAt: new Date().toISOString(),
            source: 'eastmoney'
        };
        
    } catch (error) {
        console.error(`获取 ${symbol} 行情失败:`, error.message);
        return null;
    }
}

/**
 * 批量获取股票行情
 * @param {Array<string>} symbols - 股票代码数组
 * @returns {Promise<Array>} 股票数据数组
 */
async function getBatchStockPrices(symbols) {
    try {
        const secids = symbols.map(convertToEastMoneyCode).join(',');
        
        const response = await axios.get(EASTMONEY_API.batch, {
            params: {
                secids: secids,
                fields: 'f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f170'
            },
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const data = response.data.data;
        if (!data || !data.diff) {
            return [];
        }
        
        return data.diff.map((item, index) => {
            const symbol = symbols[index];
            const price = item.f43 ? item.f43 / 100 : 0;
            const prevClose = item.f60 ? item.f60 / 100 : price;
            const change = price - prevClose;
            const changePercent = prevClose > 0 ? (change / prevClose * 100) : 0;
            
            return {
                symbol: symbol,
                name: item.f58 || symbol,
                code: item.f57 || symbol,
                price: price,
                open: item.f46 ? item.f46 / 100 : price,
                prevClose: prevClose,
                high: item.f44 ? item.f44 / 100 : price,
                low: item.f45 ? item.f45 / 100 : price,
                volume: item.f47 || 0,
                amount: item.f48 || 0,
                change: change,
                changePercent: parseFloat(changePercent.toFixed(2)),
                market: item.f107 || '',
                updatedAt: new Date().toISOString(),
                source: 'eastmoney'
            };
        });
        
    } catch (error) {
        console.error('批量获取行情失败:', error.message);
        return [];
    }
}

/**
 * 获取 K 线数据
 * @param {string} symbol - 股票代码
 * @param {number} days - 天数
 * @param {string} period - 周期 (101=日, 102=周, 103=月)
 * @returns {Promise<Array>} K线数据
 */
async function getKLineData(symbol, days = 30, period = '101') {
    try {
        const secid = convertToEastMoneyCode(symbol);
        
        const response = await axios.get(EASTMONEY_API.kline, {
            params: {
                secid: secid,
                fields1: 'f1,f2,f3,f4,f5,f6',
                fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
                klt: period,
                fqt: '0',
                end: '20500101',
                lmt: days,
                ut: 'fa5fd1943c7b386f172d6893dbfba10b'
            },
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const data = response.data.data;
        if (!data || !data.klines) {
            return [];
        }
        
        // 解析 K 线数据
        // 格式: 日期,开盘价,收盘价,最低价,最高价,成交量,成交额,振幅,涨跌幅,涨跌额,换手率
        return data.klines.map(line => {
            const parts = line.split(',');
            return {
                date: parts[0],
                open: parseFloat(parts[1]),
                close: parseFloat(parts[2]),
                low: parseFloat(parts[3]),
                high: parseFloat(parts[4]),
                volume: parseInt(parts[5]),
                amount: parseFloat(parts[6]),
                amplitude: parseFloat(parts[7]),
                changePercent: parseFloat(parts[8]),
                change: parseFloat(parts[9]),
                turnover: parseFloat(parts[10])
            };
        });
        
    } catch (error) {
        console.error(`获取 ${symbol} K线数据失败:`, error.message);
        return [];
    }
}

/**
 * 搜索股票
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Array>} 股票列表
 */
async function searchStocks(keyword) {
    try {
        const response = await axios.get(EASTMONEY_API.stockList, {
            params: {
                pn: 1,
                pz: 20,
                po: 1,
                np: 1,
                ut: 'bd1d9ddb04089700cf9c27f6f7426281',
                fltt: 2,
                invt: 2,
                fid: 'f12',
                fs: 'm:0+t:6,m:0+t:13,m:1+t:2,m:1+t:23,m:0+t:81+s:204,m:0+t:80',
                fields: 'f12,f13,f14,f20,f21,f23,f24,f25,f26,f27,f28,f29,f30,f31,f32,f33,f34,f35,f36,f37,f38,f39,f40,f41,f42,f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65,f66,f67,f68,f69,f70,f71,f72,f73,f74,f75,f76,f77,f78,f79,f80,f81,f82,f83,f84,f85,f86,f87,f88,f89,f90,f91,f92,f93,f94,f95,f96,f97,f98,f99,f100',
                _: Date.now()
            },
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        // 这里简化处理，实际应该根据关键词过滤
        const data = response.data.data;
        if (!data || !data.diff) {
            return [];
        }
        
        return data.diff.map(item => ({
            code: item.f12,
            name: item.f14,
            market: item.f13 === '1' ? 'SH' : 'SZ',
            price: item.f2 ? item.f2 / 100 : 0,
            changePercent: item.f3 ? item.f3 / 100 : 0
        }));
        
    } catch (error) {
        console.error('搜索股票失败:', error.message);
        return [];
    }
}

module.exports = {
    getStockPrice,
    getBatchStockPrices,
    getKLineData,
    searchStocks,
    convertToEastMoneyCode
};
