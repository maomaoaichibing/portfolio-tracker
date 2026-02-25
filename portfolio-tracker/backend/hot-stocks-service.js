/**
 * 热门股票服务 - 获取市场热门板块和个股
 */

const axios = require('axios');

// 东方财富热门数据 API
const HOT_STOCK_API = {
    // 涨幅榜
    gainers: 'https://push2.eastmoney.com/api/qt/clist/get',
    // 跌幅榜
    losers: 'https://push2.eastmoney.com/api/qt/clist/get',
    // 成交量榜
    volume: 'https://push2.eastmoney.com/api/qt/clist/get',
    // 换手率榜
    turnover: 'https://push2.eastmoney.com/api/qt/clist/get',
    // 板块资金流向
    sectorFlow: 'https://push2.eastmoney.com/api/qt/clist/get',
    // 个股资金流向
    stockFlow: 'https://push2.eastmoney.com/api/qt/clist/get'
};

// 市场代码映射
const MARKET_MAP = {
    'A股': 'm:0+t:6,m:0+t:13,m:1+t:2,m:1+t:23',
    '港股': 'm:128+t:3,m:128+t:4,m:128+t:1,m:128+t:2',
    '美股': 'm:105,m:106,m:107'
};

/**
 * 获取涨幅榜
 * @param {string} market - 市场 (A股/港股/美股)
 * @param {number} limit - 数量
 * @returns {Promise<Array>}
 */
async function getGainers(market = 'A股', limit = 20) {
    try {
        const fs = MARKET_MAP[market] || MARKET_MAP['A股'];
        
        const response = await axios.get(HOT_STOCK_API.gainers, {
            params: {
                pn: 1,
                pz: limit,
                po: 1,
                np: 1,
                ut: 'bd1d9ddb04089700cf9c27f6f7426281',
                fltt: 2,
                invt: 2,
                fid: 'f3',  // 按涨跌幅排序
                fs: fs,
                fields: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f26,f27,f28,f29,f30,f31,f32,f33,f34,f35,f36,f37,f38,f39,f40,f41,f42,f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65,f66,f67,f68,f69,f70,f71,f72,f73,f74,f75,f76,f77,f78,f79,f80,f81,f82,f83,f84,f85,f86,f87,f88,f89,f90,f91,f92,f93,f94,f95,f96,f97,f98,f99,f100',
                _: Date.now()
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
        
        return data.diff.map(item => parseStockItem(item)).filter(s => s.changePercent > 0);
        
    } catch (error) {
        console.error('获取涨幅榜失败:', error.message);
        return [];
    }
}

/**
 * 获取跌幅榜
 * @param {string} market - 市场
 * @param {number} limit - 数量
 * @returns {Promise<Array>}
 */
async function getLosers(market = 'A股', limit = 20) {
    try {
        const fs = MARKET_MAP[market] || MARKET_MAP['A股'];
        
        const response = await axios.get(HOT_STOCK_API.losers, {
            params: {
                pn: 1,
                pz: limit,
                po: 0,  // 倒序
                np: 1,
                ut: 'bd1d9ddb04089700cf9c27f6f7426281',
                fltt: 2,
                invt: 2,
                fid: 'f3',
                fs: fs,
                fields: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f26,f27,f28,f29,f30,f31,f32,f33,f34,f35,f36,f37,f38,f39,f40,f41,f42,f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65,f66,f67,f68,f69,f70,f71,f72,f73,f74,f75,f76,f77,f78,f79,f80,f81,f82,f83,f84,f85,f86,f87,f88,f89,f90,f91,f92,f93,f94,f95,f96,f97,f98,f99,f100',
                _: Date.now()
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
        
        return data.diff.map(item => parseStockItem(item)).filter(s => s.changePercent < 0);
        
    } catch (error) {
        console.error('获取跌幅榜失败:', error.message);
        return [];
    }
}

/**
 * 获取成交量榜
 * @param {string} market - 市场
 * @param {number} limit - 数量
 * @returns {Promise<Array>}
 */
async function getVolumeLeaders(market = 'A股', limit = 20) {
    try {
        const fs = MARKET_MAP[market] || MARKET_MAP['A股'];
        
        const response = await axios.get(HOT_STOCK_API.volume, {
            params: {
                pn: 1,
                pz: limit,
                po: 1,
                np: 1,
                ut: 'bd1d9ddb04089700cf9c27f6f7426281',
                fltt: 2,
                invt: 2,
                fid: 'f5',  // 按成交量排序
                fs: fs,
                fields: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f26,f27,f28,f29,f30,f31,f32,f33,f34,f35,f36,f37,f38,f39,f40,f41,f42,f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65,f66,f67,f68,f69,f70,f71,f72,f73,f74,f75,f76,f77,f78,f79,f80,f81,f82,f83,f84,f85,f86,f87,f88,f89,f90,f91,f92,f93,f94,f95,f96,f97,f98,f99,f100',
                _: Date.now()
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
        
        return data.diff.map(item => parseStockItem(item));
        
    } catch (error) {
        console.error('获取成交量榜失败:', error.message);
        return [];
    }
}

/**
 * 获取热门板块
 * @param {number} limit - 数量
 * @returns {Promise<Array>}
 */
async function getHotSectors(limit = 20) {
    try {
        // 使用行业板块接口
        const response = await axios.get('https://push2.eastmoney.com/api/qt/clist/get', {
            params: {
                pn: 1,
                pz: limit,
                po: 1,
                np: 1,
                ut: 'bd1d9ddb04089700cf9c27f6f7426281',
                fltt: 2,
                invt: 2,
                fid: 'f3',
                fs: 'm:90+t:2',  // 行业板块
                fields: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f26,f27,f28,f29,f30,f31,f32,f33,f34,f35,f36,f37,f38,f39,f40,f41,f42,f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65,f66,f67,f68,f69,f70,f71,f72,f73,f74,f75,f76,f77,f78,f79,f80,f81,f82,f83,f84,f85,f86,f87,f88,f89,f90,f91,f92,f93,f94,f95,f96,f97,f98,f99,f100',
                _: Date.now()
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
        
        return data.diff.map(item => ({
            code: item.f12,
            name: item.f14,
            changePercent: item.f3 ? parseFloat((item.f3 / 100).toFixed(2)) : 0,
            leadingStock: item.f20 || '',  // 领涨股
            leadingStockChange: item.f21 ? parseFloat((item.f21 / 100).toFixed(2)) : 0,
            totalStocks: item.f24 || 0,  // 成分股数量
            risingStocks: item.f25 || 0,  // 上涨家数
            fallingStocks: item.f26 || 0  // 下跌家数
        }));
        
    } catch (error) {
        console.error('获取热门板块失败:', error.message);
        return [];
    }
}

/**
 * 获取综合热门数据
 * @returns {Promise<Object>}
 */
async function getHotStocksOverview() {
    try {
        const [gainers, losers, volumeLeaders, hotSectors] = await Promise.all([
            getGainers('A股', 10),
            getLosers('A股', 10),
            getVolumeLeaders('A股', 10),
            getHotSectors(10)
        ]);
        
        return {
            updatedAt: new Date().toISOString(),
            market: 'A股',
            gainers,
            losers,
            volumeLeaders,
            hotSectors
        };
        
    } catch (error) {
        console.error('获取热门数据概览失败:', error.message);
        return {
            updatedAt: new Date().toISOString(),
            market: 'A股',
            gainers: [],
            losers: [],
            volumeLeaders: [],
            hotSectors: []
        };
    }
}

/**
 * 解析股票数据项
 * @param {Object} item - 原始数据
 * @returns {Object}
 */
function parseStockItem(item) {
    // 东方财富字段说明（fltt=2 时，价格类字段已经是元为单位）
    // f2: 最新价, f3: 涨跌幅(%), f4: 涨跌额, f5: 成交量, f6: 成交额
    // f8: 换手率(%), f9: 市盈率, f12: 代码, f13: 市场, f14: 名称
    // f18: 昨收, f20: 总市值
    
    const price = item.f2 || 0;
    const prevClose = item.f18 || price;
    const change = item.f4 || 0;
    const changePercent = item.f3 ? parseFloat(item.f3.toFixed(2)) : 0;
    
    return {
        symbol: item.f13 === '1' ? `${item.f12}.SH` : `${item.f12}.SZ`,
        code: item.f12,
        name: item.f14,
        price: price,
        change: change,
        changePercent: changePercent,
        volume: item.f5 || 0,
        amount: item.f6 ? (item.f6 / 10000).toFixed(2) : 0,  // 万元
        turnoverRate: item.f8 ? parseFloat(item.f8.toFixed(2)) : 0,  // 换手率%
        pe: item.f9 ? parseFloat(item.f9.toFixed(2)) : 0,  // 市盈率
        marketCap: item.f20 ? Math.round(item.f20 / 100000000) : 0,  // 市值（亿）
        market: item.f13 === '1' ? 'SH' : 'SZ'
    };
}

module.exports = {
    getGainers,
    getLosers,
    getVolumeLeaders,
    getHotSectors,
    getHotStocksOverview
};
