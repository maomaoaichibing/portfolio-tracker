/**
 * 智投镜头服务 - 多视角投资组合分析
 * 
 * 镜头类型：
 * 1. 趋势镜头 - 关注动量、技术形态、资金流向
 * 2. 价值镜头 - 关注估值、安全边际、ROE
 * 3. 红利镜头 - 关注股息率、分红稳定性、派息率
 * 4. 防御镜头 - 关注回撤控制、波动率、Beta
 * 5. 成长镜头 - 关注营收增长、利润增长、行业空间
 * 6. 机构镜头 - 关注机构持仓、北向资金、分析师评级
 */

const dataService = require('./data-service');

// 镜头配置
const LENSES = {
    trend: {
        id: 'trend',
        name: '趋势镜头',
        icon: '📈',
        description: '关注价格动量、技术形态、资金流向',
        metrics: ['momentum', 'technical', 'volume_trend', 'money_flow'],
        weights: { momentum: 0.4, technical: 0.3, volume_trend: 0.2, money_flow: 0.1 }
    },
    value: {
        id: 'value',
        name: '价值镜头',
        icon: '💎',
        description: '关注估值水平、安全边际、盈利能力',
        metrics: ['pe_ratio', 'pb_ratio', 'roe', 'margin_safety'],
        weights: { pe_ratio: 0.3, pb_ratio: 0.25, roe: 0.25, margin_safety: 0.2 }
    },
    dividend: {
        id: 'dividend',
        name: '红利镜头',
        icon: '💰',
        description: '关注股息率、分红稳定性、派息能力',
        metrics: ['dividend_yield', 'payout_ratio', 'dividend_growth', 'dividend_stability'],
        weights: { dividend_yield: 0.35, payout_ratio: 0.25, dividend_growth: 0.25, dividend_stability: 0.15 }
    },
    defense: {
        id: 'defense',
        name: '防御镜头',
        icon: '🛡️',
        description: '关注回撤控制、波动率、抗跌能力',
        metrics: ['max_drawdown', 'volatility', 'beta', 'sharpe_ratio'],
        weights: { max_drawdown: 0.35, volatility: 0.25, beta: 0.25, sharpe_ratio: 0.15 }
    },
    growth: {
        id: 'growth',
        name: '成长镜头',
        icon: '🚀',
        description: '关注营收增长、利润增长、行业空间',
        metrics: ['revenue_growth', 'profit_growth', 'industry_space', 'rd_ratio'],
        weights: { revenue_growth: 0.3, profit_growth: 0.3, industry_space: 0.25, rd_ratio: 0.15 }
    },
    institution: {
        id: 'institution',
        name: '机构镜头',
        icon: '🏦',
        description: '关注机构持仓、北向资金、分析师评级',
        metrics: ['institution_holdings', 'northbound_flow', 'analyst_rating', 'fund_ownership'],
        weights: { institution_holdings: 0.3, northbound_flow: 0.25, analyst_rating: 0.25, fund_ownership: 0.2 }
    }
};

/**
 * 获取所有可用镜头
 */
function getAvailableLenses() {
    return Object.values(LENSES).map(lens => ({
        id: lens.id,
        name: lens.name,
        icon: lens.icon,
        description: lens.description
    }));
}

/**
 * 通过指定镜头分析投资组合
 * @param {Array} portfolio - 持仓列表
 * @param {string} lensId - 镜头ID
 * @returns {Promise<Object>} 分析结果
 */
async function analyzeWithLens(portfolio, lensId) {
    const lens = LENSES[lensId];
    if (!lens) {
        throw new Error(`未知镜头: ${lensId}`);
    }

    // 获取每只股票在该镜头下的评分
    const stockScores = [];
    for (const stock of portfolio) {
        const score = await calculateStockLensScore(stock, lens);
        stockScores.push({
            symbol: stock.symbol,
            name: stock.name,
            score: score.total,
            details: score.details,
            suggestion: generateSuggestion(score, lensId)
        });
    }

    // 计算组合整体评分
    const portfolioScore = calculatePortfolioScore(stockScores, portfolio);

    // 生成镜头专属建议
    const recommendations = generateLensRecommendations(stockScores, lensId);

    return {
        lens: {
            id: lens.id,
            name: lens.name,
            icon: lens.icon,
            description: lens.description
        },
        portfolioScore: portfolioScore.total,
        scoreLevel: getScoreLevel(portfolioScore.total),
        stockScores: stockScores.sort((a, b) => b.score - a.score),
        strengths: portfolioScore.strengths,
        weaknesses: portfolioScore.weaknesses,
        recommendations,
        generatedAt: new Date().toISOString()
    };
}

/**
 * 计算单只股票在指定镜头下的评分
 */
async function calculateStockLensScore(stock, lens) {
    const details = {};
    let totalScore = 0;

    // 根据镜头类型计算各项指标
    switch (lens.id) {
        case 'trend':
            details.momentum = calculateMomentumScore(stock);
            details.technical = calculateTechnicalScore(stock);
            details.volume_trend = calculateVolumeTrendScore(stock);
            details.money_flow = calculateMoneyFlowScore(stock);
            break;
        
        case 'value':
            details.pe_ratio = calculatePERatioScore(stock);
            details.pb_ratio = calculatePBRatioScore(stock);
            details.roe = calculateROEScore(stock);
            details.margin_safety = calculateMarginSafetyScore(stock);
            break;
        
        case 'dividend':
            details.dividend_yield = calculateDividendYieldScore(stock);
            details.payout_ratio = calculatePayoutRatioScore(stock);
            details.dividend_growth = calculateDividendGrowthScore(stock);
            details.dividend_stability = calculateDividendStabilityScore(stock);
            break;
        
        case 'defense':
            details.max_drawdown = calculateDrawdownScore(stock);
            details.volatility = calculateVolatilityScore(stock);
            details.beta = calculateBetaScore(stock);
            details.sharpe_ratio = calculateSharpeScore(stock);
            break;
        
        case 'growth':
            details.revenue_growth = calculateRevenueGrowthScore(stock);
            details.profit_growth = calculateProfitGrowthScore(stock);
            details.industry_space = calculateIndustrySpaceScore(stock);
            details.rd_ratio = calculateRDRatioScore(stock);
            break;
        
        case 'institution':
            details.institution_holdings = calculateInstitutionScore(stock);
            details.northbound_flow = calculateNorthboundScore(stock);
            details.analyst_rating = calculateAnalystScore(stock);
            details.fund_ownership = calculateFundOwnershipScore(stock);
            break;
    }

    // 加权计算总分
    for (const [metric, weight] of Object.entries(lens.weights)) {
        totalScore += (details[metric] || 50) * weight;
    }

    return {
        total: Math.round(totalScore),
        details
    };
}

/**
 * 计算组合整体评分
 */
function calculatePortfolioScore(stockScores, portfolio) {
    if (stockScores.length === 0) return { total: 0, strengths: [], weaknesses: [] };

    // 加权平均（按市值权重）
    const totalValue = portfolio.reduce((sum, s) => sum + (s.shares * (s.price || s.avg_cost || 0)), 0);
    let weightedScore = 0;
    
    stockScores.forEach((score, index) => {
        const stock = portfolio[index];
        const weight = totalValue > 0 ? (stock.shares * (stock.price || stock.avg_cost || 0)) / totalValue : 1 / portfolio.length;
        weightedScore += score.score * weight;
    });

    // 找出强项和弱项
    const sortedScores = [...stockScores].sort((a, b) => b.score - a.score);
    const strengths = sortedScores.slice(0, Math.min(3, sortedScores.length)).filter(s => s.score >= 70);
    const weaknesses = sortedScores.slice(-Math.min(3, sortedScores.length)).filter(s => s.score < 50);

    return {
        total: Math.round(weightedScore),
        strengths: strengths.map(s => ({ symbol: s.symbol, name: s.name, score: s.score })),
        weaknesses: weaknesses.map(s => ({ symbol: s.symbol, name: s.name, score: s.score }))
    };
}

/**
 * 根据评分生成建议
 */
function generateSuggestion(score, lensId) {
    if (score.total >= 80) return '表现优异，建议保持';
    if (score.total >= 60) return '表现良好，可继续持有';
    if (score.total >= 40) return '表现一般，建议关注';
    return '表现较弱，建议评估';
}

/**
 * 生成镜头专属建议
 */
function generateLensRecommendations(stockScores, lensId) {
    const recommendations = [];
    const avgScore = stockScores.reduce((sum, s) => sum + s.score, 0) / stockScores.length;
    
    const lowScoreStocks = stockScores.filter(s => s.score < 40);
    const highScoreStocks = stockScores.filter(s => s.score >= 80);

    const lensSuggestions = {
        trend: {
            high: '趋势强劲，可考虑适当加仓',
            low: '趋势较弱，建议关注技术形态变化',
            general: '关注成交量和资金流向变化'
        },
        value: {
            high: '估值合理，具备安全边际',
            low: '估值偏高，注意风险',
            general: '定期评估估值水平变化'
        },
        dividend: {
            high: '分红稳定，适合长期持有',
            low: '分红能力较弱',
            general: '关注派息政策和股息变化'
        },
        defense: {
            high: '抗风险能力强',
            low: '波动较大，注意回撤风险',
            general: '关注市场波动时的表现'
        },
        growth: {
            high: '成长性良好',
            low: '增长动力不足',
            general: '关注业绩增长持续性'
        },
        institution: {
            high: '机构看好',
            low: '机构关注度低',
            general: '关注机构持仓变化'
        }
    };

    const suggestions = lensSuggestions[lensId] || lensSuggestions.trend;

    if (avgScore >= 70) {
        recommendations.push({
            type: 'positive',
            title: '组合整体表现良好',
            content: `从${LENSES[lensId].name}看，您的投资组合整体得分${Math.round(avgScore)}分，${suggestions.high}`
        });
    } else if (avgScore < 50) {
        recommendations.push({
            type: 'warning',
            title: '组合需要关注',
            content: `从${LENSES[lensId].name}看，您的投资组合整体得分${Math.round(avgScore)}分，${suggestions.low}`
        });
    }

    if (lowScoreStocks.length > 0) {
        recommendations.push({
            type: 'action',
            title: '建议关注的持仓',
            content: `${lowScoreStocks.map(s => s.name).join('、')} 在该视角下表现较弱，建议评估是否继续持有`
        });
    }

    recommendations.push({
        type: 'general',
        title: '一般建议',
        content: suggestions.general
    });

    return recommendations;
}

/**
 * 获取评分等级
 */
function getScoreLevel(score) {
    if (score >= 80) return { level: 'excellent', text: '优秀', color: '#52c41a' };
    if (score >= 60) return { level: 'good', text: '良好', color: '#1890ff' };
    if (score >= 40) return { level: 'average', text: '一般', color: '#faad14' };
    return { level: 'poor', text: '较弱', color: '#f5222d' };
}

// ============== 各指标评分函数 ==============

// 趋势镜头
function calculateMomentumScore(stock) {
    // 基于年内涨跌幅计算
    const yearChange = stock.year_change || 0;
    if (yearChange > 50) return 90;
    if (yearChange > 20) return 80;
    if (yearChange > 0) return 60;
    if (yearChange > -20) return 40;
    return 20;
}

function calculateTechnicalScore(stock) {
    // 简化为基于价格位置的评分
    return 50; // 需要更多数据
}

function calculateVolumeTrendScore(stock) {
    return 50; // 需要成交量趋势数据
}

function calculateMoneyFlowScore(stock) {
    return 50; // 需要资金流向数据
}

// 价值镜头
function calculatePERatioScore(stock) {
    // PE越低越好（价值视角）
    const pe = stock.pe || 20;
    if (pe < 10) return 90;
    if (pe < 15) return 80;
    if (pe < 25) return 60;
    if (pe < 40) return 40;
    return 20;
}

function calculatePBRatioScore(stock) {
    const pb = stock.pb || 2;
    if (pb < 1) return 90;
    if (pb < 1.5) return 80;
    if (pb < 3) return 60;
    if (pb < 5) return 40;
    return 20;
}

function calculateROEScore(stock) {
    const roe = stock.roe || 10;
    if (roe > 20) return 90;
    if (roe > 15) return 80;
    if (roe > 10) return 60;
    if (roe > 5) return 40;
    return 20;
}

function calculateMarginSafetyScore(stock) {
    return 50; // 需要更多财务数据
}

// 红利镜头
function calculateDividendYieldScore(stock) {
    const yield_rate = stock.dividend_yield || 0;
    if (yield_rate > 5) return 90;
    if (yield_rate > 3) return 80;
    if (yield_rate > 2) return 60;
    if (yield_rate > 1) return 40;
    return 20;
}

function calculatePayoutRatioScore(stock) {
    const ratio = stock.payout_ratio || 50;
    if (ratio > 30 && ratio < 70) return 80; // 合理区间
    if (ratio > 70) return 50; // 过高可能不可持续
    return 60;
}

function calculateDividendGrowthScore(stock) {
    return 50; // 需要历史分红数据
}

function calculateDividendStabilityScore(stock) {
    return 50; // 需要历史分红数据
}

// 防御镜头
function calculateDrawdownScore(stock) {
    const yearChange = stock.year_change || 0;
    // 年内跌幅小的得分高
    if (yearChange > -10) return 90;
    if (yearChange > -20) return 70;
    if (yearChange > -30) return 50;
    return 30;
}

function calculateVolatilityScore(stock) {
    return 50; // 需要历史波动率数据
}

function calculateBetaScore(stock) {
    return 50; // 需要Beta数据
}

function calculateSharpeScore(stock) {
    return 50; // 需要夏普比率数据
}

// 成长镜头
function calculateRevenueGrowthScore(stock) {
    return 50; // 需要营收增长数据
}

function calculateProfitGrowthScore(stock) {
    return 50; // 需要利润增长数据
}

function calculateIndustrySpaceScore(stock) {
    return 50; // 需要行业数据
}

function calculateRDRatioScore(stock) {
    return 50; // 需要研发投入数据
}

// 机构镜头
function calculateInstitutionScore(stock) {
    return 50; // 需要机构持仓数据
}

function calculateNorthboundScore(stock) {
    return 50; // 需要北向资金数据
}

function calculateAnalystScore(stock) {
    return 50; // 需要分析师评级数据
}

function calculateFundOwnershipScore(stock) {
    return 50; // 需要基金持仓数据
}

module.exports = {
    getAvailableLenses,
    analyzeWithLens,
    LENSES
};
