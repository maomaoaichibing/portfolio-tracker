/**
 * AI 服务 - 调用 Kimi API 进行截图识别和分析
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 直接读取 .env 文件获取 API key（避免被系统环境变量覆盖）
function loadApiKey() {
    try {
        const envPath = path.join(__dirname, '..', '.env');
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/KIMI_API_KEY=(.+)/);
        return match ? match[1].trim() : '';
    } catch (e) {
        return process.env.KIMI_API_KEY || '';
    }
}

const KIMI_API_KEY = loadApiKey();
const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';

// 模拟模式：没有 API key 时返回模拟数据
const MOCK_MODE = !KIMI_API_KEY || KIMI_API_KEY === 'your_kimi_api_key_here' || KIMI_API_KEY.length < 10;

console.log('[AI Service] MOCK_MODE:', MOCK_MODE, 'Key available:', !!KIMI_API_KEY);

/**
 * 识别持仓截图
 * @param {Buffer} imageBuffer - 图片数据
 * @returns {Promise<Array>} 持仓列表
 */
async function recognizePortfolio(imageBuffer) {
    // 模拟模式：返回截图中的港股数据
    if (MOCK_MODE) {
        console.log('[模拟模式] 识别持仓截图 - 东方财富港股自选股');
        // 根据截图中的数据返回
        return [
            { symbol: '03968.HK', name: '招商银行', market: '港股', shares: 1000, avgCost: 45.00, price: 48.90, currency: 'HKD', year_change: 5.2 },
            { symbol: '01364.HK', name: '古茗', market: '港股', shares: 500, avgCost: 30.00, price: 29.32, currency: 'HKD', year_change: -8.5 },
            { symbol: '03986.HK', name: '兆易创新', market: '港股', shares: 200, avgCost: 350.00, price: 406.20, currency: 'HKD', year_change: 28.4 },
            { symbol: '01347.HK', name: '华虹半导体', market: '港股', shares: 800, avgCost: 95.00, price: 99.90, currency: 'HKD', year_change: 12.3 },
            { symbol: '00522.HK', name: 'ASMPT', market: '港股', shares: 300, avgCost: 105.00, price: 103.30, currency: 'HKD', year_change: -3.2 },
            { symbol: '02525.HK', name: '禾赛-W', market: '港股', shares: 400, avgCost: 180.00, price: 201.80, currency: 'HKD', year_change: 45.6 },
            { symbol: '01072.HK', name: '东方电气', market: '港股', shares: 600, avgCost: 35.00, price: 32.84, currency: 'HKD', year_change: -5.8 },
            { symbol: '01133.HK', name: '哈尔滨电气', market: '港股', shares: 1000, avgCost: 20.00, price: 22.90, currency: 'HKD', year_change: 8.9 },
            { symbol: '00179.HK', name: '德昌电机控股', market: '港股', shares: 500, avgCost: 28.00, price: 27.30, currency: 'HKD', year_change: -2.1 },
            { symbol: '02600.HK', name: '中国铝业', market: '港股', shares: 2000, avgCost: 11.00, price: 13.17, currency: 'HKD', year_change: 18.5 },
            { symbol: '00400.HK', name: '硬蛋创新', market: '港股', shares: 5000, avgCost: 3.50, price: 4.09, currency: 'HKD', year_change: 25.3 }
        ];
    }

    const base64Image = imageBuffer.toString('base64');
    
    const prompt = `请识别这张股票持仓截图，提取以下信息并以 JSON 格式返回：

需要提取的字段：
- symbol: 股票代码（如 00700.HK、AAPL、600519.SH）
- name: 股票名称
- market: 市场（港股/美股/A股）
- shares: 持仓数量
- avgCost: 成本价（如有显示）
- price: 当前价格
- currency: 货币（HKD/USD/CNY）

返回格式示例：
{
  "portfolio": [
    {
      "symbol": "00700.HK",
      "name": "腾讯控股",
      "market": "港股",
      "shares": 100,
      "avgCost": 380.5,
      "price": 385.2,
      "currency": "HKD"
    }
  ]
}

只返回 JSON，不要其他文字。`;

    try {
        const response = await axios.post(KIMI_API_URL, {
            model: 'kimi-latest',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { 
                            type: 'image_url', 
                            image_url: { url: `data:image/jpeg;base64,${base64Image}` }
                        }
                    ]
                }
            ],
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${KIMI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000
        });

        const content = response.data.choices[0].message.content;
        const result = JSON.parse(content);
        
        return result.portfolio || [];
    } catch (error) {
        console.error('Kimi API 调用失败:', error.message);
        throw new Error('截图识别失败: ' + error.message);
    }
}

/**
 * 分析持仓涨跌逻辑
 * @param {Array} portfolio - 持仓列表
 * @returns {Promise<Object>} 分析结果
 */
async function analyzePortfolio(portfolio) {
    // 模拟模式：返回模拟数据
    if (MOCK_MODE) {
        console.log('[模拟模式] 分析投资组合');
        return generateMockPortfolioAnalysis(portfolio);
    }

    const symbols = portfolio.map(s => s.symbol).join(', ');
    
    const prompt = `请分析以下持仓股票的投资组合，并给出详细分析：

持仓列表：
${portfolio.map(s => `- ${s.name}(${s.symbol}): ${s.shares}股，成本${s.avgCost || '未知'}，现价${s.price}`).join('\n')}

请提供以下分析（以 JSON 格式返回）：

1. portfolio_summary: 持仓整体概览（2-3句话）
2. sector_analysis: 行业分布分析，每项包含 name(行业名) 和 weight(占比%)
3. risk_factors: 风险因素列表（3-5条）
4. opportunities: 机会点列表（3-5条）
5. stock_analysis: 每只股票的详细分析，包含：
   - symbol: 股票代码
   - year_performance: 过去一年表现简述
   - key_drivers: 涨跌核心驱动因素（3-5条）
   - monitoring_metrics: 建议监控的指标列表，每项包含 name(指标名)、description(说明)、threshold(阈值)

返回格式示例：
{
  "portfolio_summary": "...",
  "sector_analysis": [{"name": "互联网", "weight": 40}],
  "risk_factors": ["..."],
  "opportunities": ["..."],
  "stock_analysis": [
    {
      "symbol": "00700.HK",
      "year_performance": "上涨15%",
      "key_drivers": ["视频号商业化", "游戏复苏"],
      "monitoring_metrics": [
        {"name": "PE估值", "description": "市盈率水平", "threshold": "PE>40警戒"}
      ]
    }
  ]
}

只返回 JSON，不要其他文字。`;

    try {
        const response = await axios.post(KIMI_API_URL, {
            model: 'kimi-latest',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${KIMI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 120000
        });

        const content = response.data.choices[0].message.content;
        return JSON.parse(content);
    } catch (error) {
        console.error('Kimi API 分析失败:', error.message);
        throw new Error('持仓分析失败: ' + error.message);
    }
}

/**
 * 分析单只股票的涨跌逻辑
 * @param {string} symbol - 股票代码
 * @param {string} name - 股票名称
 * @returns {Promise<Object>} 分析结果
 */
async function analyzeStockLogic(symbol, name) {
    // 模拟模式：返回模拟数据
    if (MOCK_MODE) {
        console.log(`[模拟模式] 分析 ${symbol} 涨跌逻辑`);
        return generateMockStockLogic(symbol, name);
    }

    const prompt = `请分析 ${name}(${symbol}) 过去一年（2024年至今）的股价涨跌逻辑。

请提供以下分析（以 JSON 格式返回）：

1. year_change: 年内涨跌幅（百分比数字）
2. trend_summary: 走势简述（1-2句话）
3. key_drivers: 核心驱动因素分析，每项包含：
   - factor: 因素名称
   - impact: 影响程度（positive/negative/neutral）
   - description: 详细说明
4. risk_factors: 风险因素（2-3条）
5. monitoring_checklist: 监控清单，每项包含：
   - item: 监控项
   - frequency: 监控频率（daily/weekly/monthly/quarterly）
   - data_source: 数据来源建议

返回格式示例：
{
  "year_change": 15.3,
  "trend_summary": "...",
  "key_drivers": [
    {"factor": "视频号商业化", "impact": "positive", "description": "..."}
  ],
  "risk_factors": ["..."],
  "monitoring_checklist": [
    {"item": "季度营收增速", "frequency": "quarterly", "data_source": "财报"}
  ]
}

只返回 JSON，不要其他文字。`;

    try {
        const response = await axios.post(KIMI_API_URL, {
            model: 'kimi-latest',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${KIMI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 120000
        });

        const content = response.data.choices[0].message.content;
        return JSON.parse(content);
    } catch (error) {
        console.error('股票逻辑分析失败:', error.message);
        throw new Error('分析失败: ' + error.message);
    }
}

/**
 * 检测逻辑变化
 * @param {string} symbol - 股票代码
 * @param {Object} previousLogic - 之前的逻辑分析
 * @param {Object} currentNews - 最新新闻/数据
 * @returns {Promise<Object>} 变化检测结果
 */
async function detectLogicChange(symbol, previousLogic, currentNews) {
    const prompt = `请检测 ${symbol} 的投资逻辑是否发生变化。

之前的逻辑假设：
${JSON.stringify(previousLogic, null, 2)}

最新信息：
${JSON.stringify(currentNews, null, 2)}

请分析：
1. 是否有重大逻辑变化
2. 哪些监控指标触发了阈值
3. 是否需要调整投资策略

以 JSON 格式返回：
{
  "has_change": true/false,
  "change_level": "high/medium/low",
  "summary": "变化简述",
  "affected_factors": ["受影响的因素1", "因素2"],
  "triggered_metrics": [{"metric": "指标名", "old_value": "旧值", "new_value": "新值"}],
  "recommendation": "建议操作"
}`;

    try {
        const response = await axios.post(KIMI_API_URL, {
            model: 'kimi-latest',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${KIMI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000
        });

        const content = response.data.choices[0].message.content;
        return JSON.parse(content);
    } catch (error) {
        console.error('逻辑变化检测失败:', error.message);
        throw new Error('检测失败: ' + error.message);
    }
}

// ============ 模拟数据生成（用于测试） ============

function generateMockStockLogic(symbol, name) {
    const isPositive = Math.random() > 0.5;
    const yearChange = (Math.random() * 40 - 10).toFixed(2);
    
    const drivers = [
        { factor: "业绩表现", impact: isPositive ? "positive" : "negative", description: "季度营收超预期，净利润同比增长20%" },
        { factor: "行业政策", impact: "positive", description: "受益于行业利好政策，市场空间扩大" },
        { factor: "竞争格局", impact: "neutral", description: "行业竞争加剧，但公司保持领先地位" },
        { factor: "估值水平", impact: Math.random() > 0.5 ? "positive" : "negative", description: "当前估值处于历史中位水平" }
    ];
    
    const risks = [
        "宏观经济波动可能影响需求",
        "原材料价格波动风险",
        "行业监管政策变化"
    ];
    
    const monitoringChecklist = [
        { item: "季度营收增速", frequency: "quarterly", data_source: "公司财报" },
        { item: "毛利率变化", frequency: "quarterly", data_source: "公司财报" },
        { item: "行业政策动态", frequency: "weekly", data_source: "财经新闻" },
        { item: "竞品动态", frequency: "monthly", data_source: "行业研报" },
        { item: "机构持仓变化", frequency: "monthly", data_source: "交易所披露" }
    ];
    
    return {
        year_change: parseFloat(yearChange),
        trend_summary: `${name}年内${isPositive ? '上涨' : '下跌'}${Math.abs(yearChange)}%，主要受业绩${isPositive ? '超预期' : '承压'}和行业政策影响。`,
        key_drivers: drivers,
        risk_factors: risks,
        monitoring_checklist: monitoringChecklist
    };
}

function generateMockPortfolioAnalysis(portfolio) {
    const sectors = [...new Set(portfolio.map(p => p.market))];
    const sectorAnalysis = sectors.map((s, i) => ({
        name: s,
        weight: Math.round(100 / sectors.length)
    }));
    
    return {
        portfolio_summary: `持仓共${portfolio.length}只股票，分散于${sectors.join('、')}市场，整体风格偏成长。`,
        sector_analysis: sectorAnalysis,
        risk_factors: [
            "市场系统性风险",
            "个股集中度过高",
            "行业政策不确定性"
        ],
        opportunities: [
            "结构性行情机会",
            "估值修复空间",
            "行业龙头溢价"
        ],
        stock_analysis: portfolio.map(p => ({
            symbol: p.symbol,
            year_performance: "波动较大",
            key_drivers: ["业绩增长", "市场情绪"],
            monitoring_metrics: [
                { name: "PE估值", description: "市盈率水平", threshold: "PE>30警戒" },
                { name: "营收增速", description: "季度营收同比增长", threshold: "增速<10%关注" }
            ]
        }))
    };
}

module.exports = {
    recognizePortfolio,
    analyzePortfolio,
    analyzeStockLogic,
    detectLogicChange,
    MOCK_MODE
};
