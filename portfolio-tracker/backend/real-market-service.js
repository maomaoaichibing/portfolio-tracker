/**
 * 真实市场数据服务 - 腾讯财经版
 * 使用腾讯财经API获取A股、港股、美股数据
 */

const axios = require('axios');
const iconv = require('iconv-lite');

// 转换股票代码为腾讯格式
function convertToTencentSymbol(symbol, market) {
    // A股
    if (market === 'A股' || symbol.match(/^\d{6}$/)) {
        // 上海
        if (symbol.startsWith('6') || symbol.startsWith('5')) {
            return `sh${symbol}`;
        }
        // 深圳
        return `sz${symbol}`;
    }
    
    // 港股
    if (market === 'HK' || market === '港股' || symbol.match(/^\d{4,5}$/)) {
        return `hk${symbol.replace('.HK', '')}`;
    }
    
    // 美股
    if (market === 'US' || market === '美股' || symbol.match(/^[A-Z]+$/)) {
        return `us${symbol}`;
    }
    
    return symbol;
}

// 解析腾讯财经返回的数据
function parseTencentData(dataStr) {
    try {
        // 格式: v_sh600519="1~名称~代码~最新价~昨收~今开..."
        const match = dataStr.match(/v_\w+="(.+)"/);
        if (!match) return null;
        
        const fields = match[1].split('~');
        
        return {
            name: fields[1],           // 股票名称
            symbol: fields[2],         // 股票代码
            price: parseFloat(fields[3]),      // 最新价
            previousClose: parseFloat(fields[4]), // 昨收
            open: parseFloat(fields[5]),       // 今开
            volume: parseInt(fields[6]),       // 成交量
            // 更多字段根据实际需要解析
            change: parseFloat(fields[3]) - parseFloat(fields[4]),
            changePercent: ((parseFloat(fields[3]) - parseFloat(fields[4])) / parseFloat(fields[4]) * 100).toFixed(2)
        };
    } catch (e) {
        console.error('解析数据失败:', e.message);
        return null;
    }
}

// 获取股票实时数据
async function getStockData(symbol, market = 'US') {
    try {
        const tencentSymbol = convertToTencentSymbol(symbol, market);
        
        const response = await axios.get(`http://qt.gtimg.cn/q=${tencentSymbol}`, {
            timeout: 10000,
            responseType: 'arraybuffer'  // 处理GBK编码
        });
        
        // 转换编码
        const dataStr = iconv.decode(Buffer.from(response.data), 'gbk');
        
        return parseTencentData(dataStr);
    } catch (error) {
        console.error(`获取 ${symbol} 数据失败:`, error.message);
        return null;
    }
}

// 批量获取股票数据
async function getBatchStockData(symbols) {
    try {
        const symbolStr = symbols.join(',');
        
        const response = await axios.get(`http://qt.gtimg.cn/q=${symbolStr}`, {
            timeout: 10000,
            responseType: 'arraybuffer'
        });
        
        const dataStr = iconv.decode(Buffer.from(response.data), 'gbk');
        
        // 解析多条数据
        const lines = dataStr.split(';').filter(line => line.trim());
        const results = [];
        
        for (const line of lines) {
            const data = parseTencentData(line + ';');
            if (data) results.push(data);
        }
        
        return results;
    } catch (error) {
        console.error('批量获取数据失败:', error.message);
        return [];
    }
}

// 获取股票新闻（使用新浪财经）
async function getStockNews(symbol, market = 'US') {
    try {
        // 新浪财经新闻 RSS
        const newsUrl = `https://rss.sina.com.cn/finance/stock/${market === 'US' ? 'usstock' : 'hkstock'}/${symbol}.xml`;
        
        // 简化处理，返回模拟新闻结构
        // 实际应该解析RSS或爬取新闻页面
        return [
            {
                title: `${symbol} 相关新闻`,
                source: '新浪财经',
                url: `https://finance.sina.com.cn/stock/${market === 'US' ? 'usstock' : 'hkstock'}/${symbol}`,
                publishedAt: new Date().toISOString()
            }
        ];
    } catch (error) {
        console.error(`获取 ${symbol} 新闻失败:`, error.message);
        return [];
    }
}

// AI 分析生成 - 基于真实数据生成深度分析
async function generateAIAnalysis(stockData, news, aiService) {
    const prompt = `你是一位专业的投资分析师。请基于以下股票的真实市场数据，给出6个投资视角的深度分析。

【股票信息】
- 名称: ${stockData.name}
- 代码: ${stockData.symbol}
- 当前价格: ${stockData.price} ${stockData.currency}
- 涨跌幅: ${stockData.changePercent}%
- 成交量: ${stockData.volume}
- 开盘价: ${stockData.open}
- 昨收: ${stockData.previousClose}

【分析要求】
请从以下6个投资视角分别分析。每个视角的分析必须包含三个部分，且内容要具体、有数据支撑、可执行：

1. 核心关注 (focus): 该视角的核心投资逻辑和关注点（1-2句话）
2. 当前判断 (judgment): 基于上述真实数据的具体分析，必须：
   - 引用具体数据（价格、涨跌幅、成交量等）
   - 结合${stockData.name}的业务特点和行业地位
   - 分析当前市场状态（不能泛泛而谈）
3. 操作建议 (operationAdvice): 具体可执行的操作建议，必须包括：
   - 明确的操作（买入/卖出/持有/观望）
   - 入场/出场价位参考
   - 仓位管理建议（如：轻仓试探/重仓持有/分批建仓）
   - 止损/止盈设置
   - 风险提示

6个视角:
1. 价值投资视角 - 关注内在价值、估值水平、安全边际、自由现金流
2. 趋势投资视角 - 关注价格趋势、量价关系、技术信号、市场情绪
3. 宏观对冲视角 - 关注利率环境、政策变化、地缘风险、大宗商品周期
4. 事件驱动视角 - 关注财报、产品发布、监管审批、重大新闻、管理层动态
5. 量化交易视角 - 关注统计信号、概率优势、波动率、风险控制
6. 长期持有视角 - 关注护城河、颠覆性创新、TAM总市场、复利效应

【输出格式】
请以JSON格式返回，确保JSON格式正确：
{
  "综合建议": { 
    "action": "买入/卖出/持有/观望", 
    "confidence": 75, 
    "reasoning": "基于各视角分析的综合判断，要具体" 
  },
  "视角建议": [
    { 
      "name": "价值投资视角", 
      "focus": "核心关注点...",
      "judgment": "基于数据的具体判断...",
      "action": "买入/卖出/持有/观望", 
      "confidence": 70, 
      "operationAdvice": "具体操作：1.入场价位 2.仓位建议 3.止损设置 4.风险提示"
    }
  ]
}

【重要提醒】
- 禁止出现"基于当前市场情况分析"、"综合考虑各种因素"这类空话
- 当前判断必须引用提供的真实数据（价格${stockData.price}、涨跌幅${stockData.changePercent}%等）
- 操作建议要具体到可以立即执行的程度
- 结合${stockData.name}的具体业务（如特斯拉的FSD、储能、机器人等）进行分析`;    try {
        const response = await aiService.analyze(prompt);
        // 清理可能的 markdown 代码块
        let cleanResponse = response;
        if (typeof response === 'object' && response.content) {
            cleanResponse = response.content;
        }
        cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleanResponse);
    } catch (error) {
        console.error('AI分析生成失败:', error.message);
        console.error('Response:', response?.substring(0, 200));
        return null;
    }
}

module.exports = {
    getStockData,
    getBatchStockData,
    getStockNews,
    generateAIAnalysis,
    convertToTencentSymbol
};
