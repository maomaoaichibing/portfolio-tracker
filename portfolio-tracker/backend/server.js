const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const aiService = require('./ai-service');
const stockService = require('./stock-service');
const monitoringService = require('./monitoring-service');
const feishuService = require('./feishu-service');
const newsService = require('./news-service');
const hotStocksService = require('./hot-stocks-service');
const lensService = require('./lens-service');
const cacheMiddleware = require('./cache-middleware');
const workflowService = require('./workflow-service');
const earningsCalendarService = require('./earnings-calendar-service');
const newsMonitorService = require('./news-monitor-service');
const apiCache = require('./api-cache-service');
const reflectionService = require('./reflection-service');
const { authenticateToken, optionalAuth } = require('./auth');
const dataService = require('./data-service');
const memoryOpt = require('./memory-optimization');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 内存优化中间件
memoryOpt.applyMemoryOptimizations(app, express);

// 缓存中间件（放在路由之前）
app.use(cacheMiddleware.cacheMiddleware);

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// 小程序路由
const wxRoutes = require('./wx-routes');
app.use('/api/wx', wxRoutes);

// 文件上传配置
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// 数据库初始化
const db = new sqlite3.Database(path.join(__dirname, '../database/portfolio.db'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS portfolio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        market TEXT NOT NULL,
        shares REAL NOT NULL,
        avg_cost REAL,
        price REAL,
        currency TEXT DEFAULT 'CNY',
        year_change REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS monitoring (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        description TEXT,
        threshold_value TEXT,
        current_value TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        year_change REAL,
        trend_summary TEXT,
        key_drivers TEXT,
        risk_factors TEXT,
        monitoring_checklist TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS price_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        target_price REAL NOT NULL,
        current_price REAL,
        is_triggered INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        triggered_at DATETIME
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        priority TEXT DEFAULT 'medium',
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    /* 历史价格数据表 */
    db.run(`CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        date TEXT NOT NULL,
        open REAL,
        high REAL,
        low REAL,
        close REAL,
        volume INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, date)
    )`);

    /* 新闻表 */
    db.run(`CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT,
        summary TEXT,
        source TEXT,
        published_at DATETIME,
        relevance_score REAL DEFAULT 0,
        sentiment TEXT DEFAULT 'neutral',
        matched_metrics TEXT,
        is_important INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    /* 创建索引 */
    db.run(`CREATE INDEX IF NOT EXISTS idx_price_history_symbol ON price_history(symbol)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_news_symbol ON news(symbol)`);

    /* 用户表（小程序登录用） */
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        openid TEXT UNIQUE NOT NULL,
        unionid TEXT,
        nickname TEXT,
        avatar TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
    )`);

    /* 研报分析表 */
    db.run(`CREATE TABLE IF NOT EXISTS research_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT 1,
        symbol TEXT,
        source TEXT,
        content_summary TEXT,
        summary TEXT,
        key_points TEXT,
        risks TEXT,
        outlook TEXT,
        sentiment TEXT DEFAULT 'neutral',
        rating TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    /* 对话历史表 */
    db.run(`CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT 1,
        message TEXT NOT NULL,
        reply TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    /* 自选股表 */
    db.run(`CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT 1,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        market TEXT DEFAULT 'A股',
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        UNIQUE(user_id, symbol)
    )`);

    /* 添加缺失的列到现有表 */
    db.all("PRAGMA table_info(portfolio)", [], (err, rows) => {
        if (!err && rows.length > 0 && !rows.find(r => r.name === 'year_change')) {
            db.run(`ALTER TABLE portfolio ADD COLUMN year_change REAL`);
            console.log('[DB Migration] Added year_change column to portfolio');
        }
    });

    db.all("PRAGMA table_info(alerts)", [], (err, rows) => {
        if (!err && !rows.find(r => r.name === 'user_id')) {
            db.run(`ALTER TABLE alerts ADD COLUMN user_id INTEGER DEFAULT 1`);
        }
    });
    db.all("PRAGMA table_info(analysis)", [], (err, rows) => {
        if (!err && !rows.find(r => r.name === 'user_id')) {
            db.run(`ALTER TABLE analysis ADD COLUMN user_id INTEGER DEFAULT 1`);
        }
    });
    db.all("PRAGMA table_info(monitoring)", [], (err, rows) => {
        if (!err && !rows.find(r => r.name === 'user_id')) {
            db.run(`ALTER TABLE monitoring ADD COLUMN user_id INTEGER DEFAULT 1`);
        }
    });
});

// ============ API 路由 ============

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 上传持仓截图并识别（支持多用户）
app.post('/api/portfolio/upload', authenticateToken, upload.array('screenshots', 5), async (req, res) => {
    try {
        const userId = req.userId;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: '没有上传文件' });
        }

        // 使用第一张图片进行识别
        const portfolio = await aiService.recognizePortfolio(files[0].buffer);

        // 保存到数据库（关联用户）
        if (portfolio && portfolio.length > 0) {
            savePortfolio(portfolio, userId);
        }

        res.json({
            success: true,
            portfolio,
            message: `成功识别 ${portfolio.length} 只标的`
        });

    } catch (error) {
        console.error('上传失败:', error);
        res.status(500).json({ error: '识别失败: ' + error.message });
    }
});

// AI 分析持仓（支持多用户）
app.post('/api/portfolio/analyze', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { portfolio } = req.body;

        if (!portfolio || portfolio.length === 0) {
            return res.status(400).json({ error: '没有持仓数据' });
        }

        // 调用 AI 分析
        const analysisResult = await aiService.analyzePortfolio(portfolio);

        // 为每只股票单独分析逻辑
        const stockAnalyses = [];
        for (const stock of portfolio) {
            try {
                const logicAnalysis = await aiService.analyzeStockLogic(stock.symbol, stock.name);
                stockAnalyses.push({
                    symbol: stock.symbol,
                    ...logicAnalysis
                });

                // 保存到数据库（关联用户）
                saveStockAnalysis(stock.symbol, logicAnalysis, userId);
            } catch (err) {
                console.error(`分析 ${stock.symbol} 失败:`, err.message);
            }
        }

        // 生成监控指标
        const monitoring = generateMonitoringMetrics(stockAnalyses);

        // 保存持仓（关联用户）
        savePortfolio(portfolio, userId);
        saveMonitoringMetrics(monitoring, userId);

        res.json({
            success: true,
            analysis: {
                summary: analysisResult.portfolio_summary,
                sectors: analysisResult.sector_analysis,
                risks: analysisResult.risk_factors,
                opportunities: analysisResult.opportunities
            },
            stockAnalyses,
            monitoring
        });

    } catch (error) {
        console.error('分析失败:', error);
        res.status(500).json({ error: '分析失败: ' + error.message });
    }
});

// 获取持仓列表（支持多用户）
app.get('/api/portfolio', authenticateToken, (req, res) => {
    const userId = req.userId;

    db.all(
        'SELECT * FROM portfolio WHERE user_id = ? ORDER BY updated_at DESC',
        [userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ portfolio: rows });
        }
    );
});

// 刷新持仓价格（支持多用户）
app.post('/api/portfolio/refresh-prices', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const result = await dataService.updatePortfolioPrices(db, userId);

        res.json({
            success: true,
            message: `已更新 ${result.updated}/${result.total} 只股票价格`,
            ...result
        });
    } catch (error) {
        console.error('刷新价格失败:', error);
        res.status(500).json({ error: '刷新价格失败: ' + error.message });
    }
});

// 获取单只股票实时价格
app.get('/api/stock/price/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const data = await stockService.getStockPrice(symbol);

        if (!data) {
            return res.status(404).json({ error: '未找到股票数据' });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('获取股价失败:', error);
        res.status(500).json({ error: '获取股价失败: ' + error.message });
    }
});

// 获取股票历史价格
app.get('/api/stock/history/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const days = parseInt(req.query.days) || 30;

        // 使用统一数据服务获取历史数据
        const history = await dataService.getStockHistory(symbol, days);

        res.json({
            success: true,
            symbol,
            days: history.length,
            data: history
        });
    } catch (error) {
        console.error('获取历史价格失败:', error);
        res.status(500).json({ error: '获取历史价格失败: ' + error.message });
    }
});

// 投资组合对比分析
app.get('/api/portfolio/comparison', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { benchmark = '000001.SH' } = req.query; // 默认对比上证指数

        // 获取用户持仓
        const portfolio = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM portfolio WHERE user_id = ?',
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        if (portfolio.length === 0) {
            return res.json({
                success: true,
                message: '没有持仓数据',
                comparison: null
            });
        }

        // 获取持仓和基准指数的历史数据
        const days = 90;
        const portfolioHistory = await calculatePortfolioHistory(portfolio, days);
        const benchmarkHistory = await dataService.getStockHistory(benchmark, days);

        // 计算对比指标
        const comparison = {
            portfolio: {
                totalReturn: calculateTotalReturn(portfolioHistory),
                volatility: calculateVolatility(portfolioHistory),
                maxDrawdown: calculateMaxDrawdown(portfolioHistory),
                sharpeRatio: calculateSharpeRatio(portfolioHistory)
            },
            benchmark: {
                symbol: benchmark,
                name: getBenchmarkName(benchmark),
                totalReturn: calculateTotalReturn(benchmarkHistory),
                volatility: calculateVolatility(benchmarkHistory),
                maxDrawdown: calculateMaxDrawdown(benchmarkHistory),
                sharpeRatio: calculateSharpeRatio(benchmarkHistory)
            },
            history: mergeHistories(portfolioHistory, benchmarkHistory)
        };

        res.json({
            success: true,
            comparison
        });

    } catch (error) {
        console.error('组合对比分析失败:', error);
        res.status(500).json({ error: '分析失败: ' + error.message });
    }
});

// 组合诊断报告（智能投顾核心功能）
app.get('/api/portfolio/diagnosis', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;

        // 获取用户持仓
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        if (!portfolio || portfolio.length === 0) {
            return res.json({
                success: true,
                diagnosis: {
                    overallScore: 0,
                    riskLevel: 'none',
                    message: '暂无持仓数据，请先添加持仓'
                }
            });
        }

        // 计算诊断指标
        const diagnosis = await calculatePortfolioDiagnosis(portfolio, userId);

        res.json({
            success: true,
            diagnosis
        });

    } catch (error) {
        console.error('组合诊断失败:', error);
        res.status(500).json({ error: '诊断失败: ' + error.message });
    }
});

// 计算组合诊断指标
async function calculatePortfolioDiagnosis(portfolio, userId) {
    const totalValue = portfolio.reduce((sum, s) => sum + (s.shares * (s.price || s.avg_cost || 0)), 0);

    // 1. 集中度分析
    const concentration = analyzeConcentration(portfolio, totalValue);

    // 2. 风险评分
    const riskAnalysis = analyzeRisk(portfolio);

    // 3. 行业分布
    const sectorDistribution = await analyzeSectorDistribution(portfolio);

    // 4. 流动性分析
    const liquidityAnalysis = analyzeLiquidity(portfolio);

    // 5. 生成优化建议
    const suggestions = generateOptimizationSuggestions(portfolio, concentration, riskAnalysis, sectorDistribution);

    // 6. 综合评分 (0-100)
    const overallScore = calculateOverallScore(concentration, riskAnalysis, sectorDistribution, liquidityAnalysis);

    // 7. 风险等级
    const riskLevel = determineRiskLevel(overallScore, riskAnalysis);

    return {
        overallScore,
        riskLevel,
        riskLevelText: getRiskLevelText(riskLevel),
        totalValue,
        stockCount: portfolio.length,
        concentration,
        riskAnalysis,
        sectorDistribution,
        liquidityAnalysis,
        suggestions,
        generatedAt: new Date().toISOString()
    };
}

// 集中度分析
function analyzeConcentration(portfolio, totalValue) {
    const weights = portfolio.map(s => ({
        symbol: s.symbol,
        name: s.name,
        weight: ((s.shares * (s.price || s.avg_cost || 0)) / totalValue * 100).toFixed(2),
        value: s.shares * (s.price || s.avg_cost || 0)
    })).sort((a, b) => b.weight - a.weight);

    const topHolding = weights[0];
    const top3Weight = weights.slice(0, 3).reduce((sum, w) => sum + parseFloat(w.weight), 0);
    const top5Weight = weights.slice(0, 5).reduce((sum, w) => sum + parseFloat(w.weight), 0);

    // 集中度风险等级
    let concentrationRisk = 'low';
    if (topHolding.weight > 50) concentrationRisk = 'high';
    else if (topHolding.weight > 30) concentrationRisk = 'medium';

    return {
        holdings: weights,
        topHolding,
        top3Concentration: top3Weight.toFixed(2),
        top5Concentration: top5Weight.toFixed(2),
        concentrationRisk,
        isDiversified: topHolding.weight <= 30 && portfolio.length >= 5
    };
}

// 风险分析
function analyzeRisk(portfolio) {
    const yearChanges = portfolio.map(s => s.year_change || 0);
    const avgChange = yearChanges.reduce((a, b) => a + b, 0) / yearChanges.length;
    const volatility = Math.sqrt(yearChanges.reduce((sq, n) => sq + Math.pow(n - avgChange, 2), 0) / yearChanges.length);

    // 最大回撤估算
    const maxYearChange = Math.max(...yearChanges);
    const minYearChange = Math.min(...yearChanges);
    const estimatedDrawdown = maxYearChange - minYearChange;

    // 风险评分 (0-100，越低越好)
    let riskScore = 50;
    if (volatility > 50) riskScore += 20;
    else if (volatility > 30) riskScore += 10;

    if (estimatedDrawdown > 80) riskScore += 20;
    else if (estimatedDrawdown > 50) riskScore += 10;

    // 根据涨跌幅调整
    const negativeCount = yearChanges.filter(c => c < 0).length;
    if (negativeCount / yearChanges.length > 0.5) riskScore += 10;

    return {
        score: Math.min(100, riskScore),
        volatility: volatility.toFixed(2),
        estimatedDrawdown: estimatedDrawdown.toFixed(2),
        avgYearChange: avgChange.toFixed(2),
        negativeStockCount: negativeCount,
        riskFactors: identifyRiskFactors(portfolio, volatility, estimatedDrawdown)
    };
}

// 识别风险因素
function identifyRiskFactors(portfolio, volatility, drawdown) {
    const factors = [];

    if (volatility > 40) {
        factors.push({
            type: 'volatility',
            level: 'high',
            description: '组合波动率较高，短期内可能出现较大涨跌'
        });
    }

    if (drawdown > 60) {
        factors.push({
            type: 'drawdown',
            level: 'high',
            description: '持仓个股年内表现差异大，存在较大回撤风险'
        });
    }

    const negativeStocks = portfolio.filter(s => (s.year_change || 0) < -20);
    if (negativeStocks.length > 0) {
        factors.push({
            type: 'underperforming',
            level: 'medium',
            description: `有 ${negativeStocks.length} 只持仓年内跌幅超过20%，需关注`
        });
    }

    if (portfolio.length < 5) {
        factors.push({
            type: 'concentration',
            level: 'medium',
            description: '持仓数量较少，分散度不足'
        });
    }

    return factors;
}

// 行业分布分析
async function analyzeSectorDistribution(portfolio) {
    // 简化版：基于股票代码前缀判断行业
    const sectorMap = {
        '60': '金融',
        '00': '消费',
        '30': '科技',
        '68': '科技',
        '8': '北交所',
        '9': '北交所'
    };

    const sectors = {};
    portfolio.forEach(s => {
        const prefix = s.symbol.substring(0, 2);
        const sector = sectorMap[prefix] || '其他';
        if (!sectors[sector]) sectors[sector] = { count: 0, value: 0, symbols: [] };
        sectors[sector].count++;
        sectors[sector].value += s.shares * (s.price || s.avg_cost || 0);
        sectors[sector].symbols.push(s.symbol);
    });

    // 转换为数组并排序
    const sectorArray = Object.entries(sectors).map(([name, data]) => ({
        name,
        count: data.count,
        value: data.value,
        symbols: data.symbols
    })).sort((a, b) => b.value - a.value);

    // 检查行业集中度
    const topSector = sectorArray[0];
    const sectorRisk = topSector && (topSector.value / portfolio.reduce((sum, s) => sum + s.shares * (s.price || s.avg_cost || 0), 0)) > 0.5 ? 'high' : 'low';

    return {
        sectors: sectorArray,
        topSector: topSector ? topSector.name : null,
        sectorRisk,
        isBalanced: sectorArray.length >= 3
    };
}

// 流动性分析
function analyzeLiquidity(portfolio) {
    const totalShares = portfolio.reduce((sum, s) => sum + s.shares, 0);
    const avgPosition = totalShares / portfolio.length;

    // 检查是否有异常大仓位
    const largePositions = portfolio.filter(s => s.shares > avgPosition * 3);

    return {
        totalShares: totalShares.toFixed(0),
        averagePosition: avgPosition.toFixed(0),
        largePositionCount: largePositions.length,
        liquidityRisk: largePositions.length > 0 ? 'medium' : 'low'
    };
}

// 生成优化建议
function generateOptimizationSuggestions(portfolio, concentration, riskAnalysis, sectorDistribution) {
    const suggestions = [];

    // 集中度建议
    if (concentration.concentrationRisk === 'high') {
        suggestions.push({
            priority: 'high',
            category: 'concentration',
            title: '降低单一持仓集中度',
            description: `${concentration.topHolding.name} 占组合 ${concentration.topHolding.weight}%，建议逐步减仓至30%以下`,
            action: 'consider_reduce',
            target: concentration.topHolding.symbol
        });
    } else if (!concentration.isDiversified) {
        suggestions.push({
            priority: 'medium',
            category: 'concentration',
            title: '增加持仓分散度',
            description: `当前持仓 ${portfolio.length} 只，建议分散至5-10只不同行业股票`,
            action: 'diversify'
        });
    }

    // 风险建议
    if (riskAnalysis.score > 70) {
        suggestions.push({
            priority: 'high',
            category: 'risk',
            title: '降低组合风险',
            description: `当前风险评分 ${riskAnalysis.score}/100，建议增加防御性资产配置`,
            action: 'reduce_risk'
        });
    }

    // 行业建议
    if (sectorDistribution.sectorRisk === 'high') {
        suggestions.push({
            priority: 'medium',
            category: 'sector',
            title: '分散行业配置',
            description: `${sectorDistribution.topSector} 行业占比过高，建议配置其他行业`,
            action: 'sector_balance'
        });
    }

    // 表现不佳股票建议
    const underperforming = portfolio.filter(s => (s.year_change || 0) < -30);
    if (underperforming.length > 0) {
        suggestions.push({
            priority: 'medium',
            category: 'performance',
            title: '关注表现不佳持仓',
            description: `${underperforming.map(s => s.name).join('、')} 年内跌幅较大，建议评估是否继续持有`,
            action: 'review',
            targets: underperforming.map(s => s.symbol)
        });
    }

    // 正面建议
    if (concentration.isDiversified && riskAnalysis.score < 50) {
        suggestions.push({
            priority: 'low',
            category: 'positive',
            title: '组合配置良好',
            description: '当前组合分散度适中，风险可控，建议定期监控即可',
            action: 'monitor'
        });
    }

    return suggestions.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
}

// 计算综合评分
function calculateOverallScore(concentration, riskAnalysis, sectorDistribution, liquidityAnalysis) {
    let score = 70; // 基础分

    // 集中度加分/扣分
    if (concentration.isDiversified) score += 10;
    else if (concentration.concentrationRisk === 'high') score -= 15;

    // 风险扣分
    score -= (riskAnalysis.score - 50) * 0.3;

    // 行业分散加分
    if (sectorDistribution.isBalanced) score += 5;
    else if (sectorDistribution.sectorRisk === 'high') score -= 10;

    // 流动性
    if (liquidityAnalysis.liquidityRisk === 'medium') score -= 5;

    return Math.max(0, Math.min(100, Math.round(score)));
}

// 确定风险等级
function determineRiskLevel(overallScore, riskAnalysis) {
    if (overallScore >= 80) return 'low';
    if (overallScore >= 60) return 'medium';
    if (riskAnalysis.score > 80) return 'very_high';
    return 'high';
}

// 风险等级文本
function getRiskLevelText(level) {
    const texts = {
        low: '低风险',
        medium: '中等风险',
        high: '高风险',
        very_high: '极高风险',
        none: '无风险'
    };
    return texts[level] || '未知';
}

// 动态调仓建议 API
app.post('/api/portfolio/rebalance', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { targetRisk, constraints } = req.body;

        // 获取用户持仓
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        if (!portfolio || portfolio.length === 0) {
            return res.status(400).json({ error: '暂无持仓数据' });
        }

        // 生成调仓建议
        const rebalanceAdvice = await generateRebalanceAdvice(portfolio, targetRisk, constraints);

        res.json({
            success: true,
            advice: rebalanceAdvice
        });

    } catch (error) {
        console.error('生成调仓建议失败:', error);
        res.status(500).json({ error: '生成调仓建议失败: ' + error.message });
    }
});

// 生成调仓建议
async function generateRebalanceAdvice(portfolio, targetRisk = 'medium', constraints = {}) {
    const totalValue = portfolio.reduce((sum, s) => sum + (s.shares * (s.price || s.avg_cost || 0)), 0);

    // 1. 分析当前组合
    const currentAnalysis = {
        totalValue,
        stockCount: portfolio.length,
        avgWeight: 100 / portfolio.length,
        riskStocks: portfolio.filter(s => (s.year_change || 0) < -20),
        highWeightStocks: portfolio.filter(s => {
            const weight = (s.shares * (s.price || s.avg_cost || 0)) / totalValue * 100;
            return weight > 30;
        })
    };

    // 2. 计算目标权重
    const targetWeights = calculateTargetWeights(portfolio, targetRisk);

    // 3. 生成具体建议
    const trades = [];
    const holds = [];

    portfolio.forEach(stock => {
        const currentValue = stock.shares * (stock.price || stock.avg_cost || 0);
        const currentWeight = (currentValue / totalValue * 100);
        const targetWeight = targetWeights[stock.symbol] || currentWeight;
        const targetValue = totalValue * (targetWeight / 100);
        const diffValue = targetValue - currentValue;
        const diffPercent = targetWeight - currentWeight;

        if (Math.abs(diffPercent) > 5) {
            // 需要调仓
            const action = diffPercent > 0 ? 'buy' : 'sell';
            const shares = Math.abs(Math.round(diffValue / (stock.price || stock.avg_cost || 1)));

            if (shares > 0) {
                trades.push({
                    symbol: stock.symbol,
                    name: stock.name,
                    action,
                    shares,
                    estimatedValue: Math.abs(diffValue).toFixed(2),
                    reason: generateTradeReason(stock, action, diffPercent),
                    priority: Math.abs(diffPercent) > 15 ? 'high' : 'medium'
                });
            }
        } else {
            // 保持
            holds.push({
                symbol: stock.symbol,
                name: stock.name,
                currentWeight: currentWeight.toFixed(2),
                reason: '权重在合理范围内，建议保持'
            });
        }
    });

    // 4. 生成策略说明
    const strategy = generateRebalanceStrategy(portfolio, targetRisk, currentAnalysis);

    // 5. 风险评估
    const riskAssessment = assessRebalanceRisk(trades, portfolio);

    return {
        currentAnalysis,
        targetRisk,
        trades: trades.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }),
        holds,
        strategy,
        riskAssessment,
        estimatedImpact: calculateEstimatedImpact(trades, portfolio, totalValue),
        generatedAt: new Date().toISOString()
    };
}

// 计算目标权重
function calculateTargetWeights(portfolio, targetRisk) {
    const weights = {};
    const totalValue = portfolio.reduce((sum, s) => sum + (s.shares * (s.price || s.avg_cost || 0)), 0);

    // 基于风险等级和风险因子计算权重
    portfolio.forEach(stock => {
        const currentValue = stock.shares * (stock.price || stock.avg_cost || 0);
        const currentWeight = (currentValue / totalValue * 100);
        const yearChange = stock.year_change || 0;

        let targetWeight = currentWeight;

        // 根据风险等级调整
        if (targetRisk === 'low') {
            // 降低高风险股票权重
            if (yearChange < -20) {
                targetWeight = Math.max(5, currentWeight * 0.7);
            } else if (yearChange > 50) {
                // 止盈：降低涨幅过大的股票权重
                targetWeight = Math.max(10, currentWeight * 0.85);
            }
        } else if (targetRisk === 'high') {
            // 增加高增长股票权重
            if (yearChange > 30) {
                targetWeight = Math.min(25, currentWeight * 1.2);
            }
        }

        // 确保单只股票不超过30%
        targetWeight = Math.min(30, targetWeight);

        weights[stock.symbol] = targetWeight;
    });

    // 归一化到100%
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    Object.keys(weights).forEach(symbol => {
        weights[symbol] = (weights[symbol] / totalWeight * 100);
    });

    return weights;
}

// 生成交易理由
function generateTradeReason(stock, action, diffPercent) {
    const yearChange = stock.year_change || 0;

    if (action === 'sell') {
        if (yearChange < -20) {
            return `年内跌幅 ${yearChange.toFixed(1)}%，建议减仓止损`;
        } else if (yearChange > 50) {
            return `年内涨幅 ${yearChange.toFixed(1)}%，建议适当止盈`;
        } else {
            return `当前权重过高，建议减仓以分散风险`;
        }
    } else {
        if (yearChange > 0 && yearChange < 30) {
            return `表现稳健，建议适当加仓`;
        } else if (yearChange < -10) {
            return `估值较低，建议逢低加仓`;
        } else {
            return `建议加仓以达到目标配置比例`;
        }
    }
}

// 生成调仓策略说明
function generateRebalanceStrategy(portfolio, targetRisk, currentAnalysis) {
    const strategies = {
        low: {
            name: '稳健型策略',
            description: '以降低波动、控制回撤为主要目标',
            actions: [
                '减仓跌幅超过20%的股票，控制单只持仓不超过20%',
                '适当止盈涨幅超过50%的股票',
                '保持现金比例不低于10%'
            ]
        },
        medium: {
            name: '平衡型策略',
            description: '在收益和风险之间寻求平衡',
            actions: [
                '分散持仓，单只股票权重控制在15-25%',
                '定期再平衡，保持目标配置',
                '关注基本面变化，及时调整'
            ]
        },
        high: {
            name: '积极型策略',
            description: '追求更高收益，承受较大波动',
            actions: [
                '增加高增长股票配置',
                '容忍单只股票最高30%权重',
                '积极把握市场机会'
            ]
        }
    };

    return strategies[targetRisk] || strategies.medium;
}

// 评估调仓风险
function assessRebalanceRisk(trades, portfolio) {
    const sellTrades = trades.filter(t => t.action === 'sell');
    const buyTrades = trades.filter(t => t.action === 'buy');

    const totalSellValue = sellTrades.reduce((sum, t) => sum + parseFloat(t.estimatedValue), 0);
    const totalBuyValue = buyTrades.reduce((sum, t) => sum + parseFloat(t.estimatedValue), 0);

    const totalValue = portfolio.reduce((sum, s) => sum + (s.shares * (s.price || s.avg_cost || 0)), 0);
    const turnoverRate = (totalSellValue + totalBuyValue) / 2 / totalValue * 100;

    let riskLevel = 'low';
    if (turnoverRate > 50) riskLevel = 'high';
    else if (turnoverRate > 30) riskLevel = 'medium';

    return {
        turnoverRate: turnoverRate.toFixed(2),
        riskLevel,
        sellCount: sellTrades.length,
        buyCount: buyTrades.length,
        totalSellValue: totalSellValue.toFixed(2),
        totalBuyValue: totalBuyValue.toFixed(2),
        warnings: generateRebalanceWarnings(trades, turnoverRate)
    };
}

// 生成调仓警告
function generateRebalanceWarnings(trades, turnoverRate) {
    const warnings = [];

    if (turnoverRate > 50) {
        warnings.push({
            type: 'high_turnover',
            message: '调仓比例过高，可能产生较大交易成本',
            suggestion: '建议分批次执行，或适当减少调仓幅度'
        });
    }

    const highPriorityTrades = trades.filter(t => t.priority === 'high');
    if (highPriorityTrades.length > 3) {
        warnings.push({
            type: 'many_changes',
            message: `有 ${highPriorityTrades.length} 项高优先级调仓建议`,
            suggestion: '建议优先处理高优先级项目，逐步调整'
        });
    }

    return warnings;
}

// 计算预估影响
function calculateEstimatedImpact(trades, portfolio, totalValue) {
    const sellTrades = trades.filter(t => t.action === 'sell');
    const buyTrades = trades.filter(t => t.action === 'buy');

    const sellValue = sellTrades.reduce((sum, t) => sum + parseFloat(t.estimatedValue), 0);
    const buyValue = buyTrades.reduce((sum, t) => sum + parseFloat(t.estimatedValue), 0);

    // 估算交易成本 (0.1% 佣金 + 0.1% 印花税)
    const estimatedCost = (sellValue + buyValue) * 0.002;

    return {
        estimatedSellValue: sellValue.toFixed(2),
        estimatedBuyValue: buyValue.toFixed(2),
        estimatedTransactionCost: estimatedCost.toFixed(2),
        netCashFlow: (sellValue - buyValue).toFixed(2),
        newStockCount: portfolio.length + buyTrades.length - sellTrades.filter(t => t.shares >= portfolio.find(s => s.symbol === t.symbol)?.shares).length
    };
}

// 智能问答系统 API
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { question } = req.body;

        if (!question || question.trim().length === 0) {
            return res.status(400).json({ error: '请输入问题' });
        }

        // 解析用户意图
        const intent = parseUserIntent(question);

        // 获取相关数据
        const contextData = await getContextData(userId, intent);

        // 生成回答
        const answer = await generateAnswer(question, intent, contextData);

        res.json({
            success: true,
            question,
            answer,
            intent: intent.type,
            relatedData: contextData
        });

    } catch (error) {
        console.error('智能问答失败:', error);
        res.status(500).json({ error: '问答失败: ' + error.message });
    }
});

// 解析用户意图
function parseUserIntent(question) {
    const lowerQuestion = question.toLowerCase();

    // 定义意图模式
    const intents = [
        {
            type: 'portfolio_status',
            patterns: ['持仓', '我的股票', '组合', '仓位', '买了什么', '持有'],
            confidence: 0
        },
        {
            type: 'risk_assessment',
            patterns: ['风险', '安全吗', '危险', '会不会跌', '回撤'],
            confidence: 0
        },
        {
            type: 'stock_analysis',
            patterns: ['怎么样', '分析', '看好', '能买吗', '建议'],
            confidence: 0
        },
        {
            type: 'market_overview',
            patterns: ['市场', '行情', '大盘', '走势', '今天'],
            confidence: 0
        },
        {
            type: 'performance_query',
            patterns: ['收益', '赚', '亏', '表现', '涨跌', '多少'],
            confidence: 0
        },
        {
            type: 'recommendation',
            patterns: ['推荐', '买什么', '建议', '选什么', '哪个好'],
            confidence: 0
        }
    ];

    // 计算每个意图的匹配度
    intents.forEach(intent => {
        intent.patterns.forEach(pattern => {
            if (lowerQuestion.includes(pattern)) {
                intent.confidence += 1;
            }
        });
    });

    // 选择最匹配的意图
    const bestIntent = intents.reduce((best, current) =>
        current.confidence > best.confidence ? current : best
    );

    // 提取股票代码（如果有）
    const stockMatch = question.match(/(\d{6})/);
    const stockSymbol = stockMatch ? stockMatch[1] : null;

    return {
        type: bestIntent.confidence > 0 ? bestIntent.type : 'general',
        confidence: bestIntent.confidence,
        stockSymbol,
        originalQuestion: question
    };
}

// 获取上下文数据
async function getContextData(userId, intent) {
    const data = {};

    try {
        // 获取用户持仓
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        data.portfolio = portfolio;
        data.totalValue = portfolio.reduce((sum, s) =>
            sum + (s.shares * (s.price || s.avg_cost || 0)), 0
        );

        // 根据意图获取额外数据
        if (intent.type === 'risk_assessment' || intent.type === 'portfolio_status') {
            // 获取最新诊断
            data.diagnosis = await calculatePortfolioDiagnosis(portfolio, userId);
        }

        if (intent.stockSymbol) {
            // 获取特定股票信息
            const stock = portfolio.find(s => s.symbol === intent.stockSymbol);
            data.targetStock = stock;

            // 获取分析记录
            const analysis = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM analysis WHERE symbol = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1',
                    [intent.stockSymbol, userId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            data.stockAnalysis = analysis;
        }

    } catch (error) {
        console.error('获取上下文数据失败:', error);
    }

    return data;
}

// 生成回答
async function generateAnswer(question, intent, contextData) {
    const { portfolio, totalValue, diagnosis, targetStock, stockAnalysis } = contextData;

    // 根据意图类型生成回答
    switch (intent.type) {
        case 'portfolio_status':
            return generatePortfolioStatusAnswer(portfolio, totalValue);

        case 'risk_assessment':
            return generateRiskAnswer(diagnosis);

        case 'stock_analysis':
            return generateStockAnswer(targetStock, stockAnalysis);

        case 'performance_query':
            return generatePerformanceAnswer(portfolio, totalValue);

        case 'recommendation':
            return generateRecommendationAnswer(portfolio, diagnosis);

        case 'market_overview':
            return generateMarketOverviewAnswer(portfolio);

        default:
            return generateGeneralAnswer(question, contextData);
    }
}

// 生成持仓状态回答
function generatePortfolioStatusAnswer(portfolio, totalValue) {
    if (!portfolio || portfolio.length === 0) {
        return '您当前没有持仓。可以通过上传持仓截图或手动添加股票来开始。';
    }

    const stockList = portfolio.map(s =>
        `${s.name}(${s.symbol}): ${s.shares}股, 现价${s.price || s.avg_cost || 0}元`
    ).join('\n');

    const avgChange = portfolio.reduce((sum, s) => sum + (s.year_change || 0), 0) / portfolio.length;
    const trend = avgChange >= 0 ? '上涨' : '下跌';

    return `您当前持有 ${portfolio.length} 只股票，总市值约 ${totalValue.toFixed(2)} 元。

持仓明细：
${stockList}

整体年内平均${trend} ${Math.abs(avgChange).toFixed(2)}%。`;
}

// 生成风险回答
function generateRiskAnswer(diagnosis) {
    if (!diagnosis) {
        return '暂无风险分析数据，请先生成组合诊断报告。';
    }

    const { overallScore, riskLevelText, riskAnalysis, concentration } = diagnosis;

    let answer = `组合风险评分：${overallScore}/100，风险等级：${riskLevelText}。\n\n`;

    if (riskAnalysis && riskAnalysis.riskFactors && riskAnalysis.riskFactors.length > 0) {
        answer += '主要风险因素：\n';
        riskAnalysis.riskFactors.forEach(factor => {
            const levelEmoji = factor.level === 'high' ? '🔴' : factor.level === 'medium' ? '🟡' : '🟢';
            answer += `${levelEmoji} ${factor.description}\n`;
        });
    }

    if (concentration && concentration.concentrationRisk === 'high') {
        answer += `\n⚠️ 集中度风险：${concentration.topHolding.name} 占比 ${concentration.topHolding.weight}%，建议适当分散。`;
    }

    return answer;
}

// 生成股票分析回答
function generateStockAnswer(stock, analysis) {
    if (!stock) {
        return '未找到该股票的持仓信息。';
    }

    let answer = `${stock.name}(${stock.symbol}) 持仓分析：\n\n`;
    answer += `持有数量：${stock.shares} 股\n`;
    answer += `当前价格：${stock.price || stock.avg_cost || 0} 元\n`;
    answer += `年内涨跌：${stock.year_change || 0}%\n`;

    if (analysis) {
        answer += `\nAI 分析摘要：${analysis.trend_summary || '暂无分析'}\n`;
    }

    // 给出简单建议
    if ((stock.year_change || 0) < -20) {
        answer += '\n⚠️ 该股票年内跌幅较大，建议关注基本面变化，考虑是否继续持有。';
    } else if ((stock.year_change || 0) > 50) {
        answer += '\n📈 该股票表现优异，可考虑适当止盈。';
    } else {
        answer += '\n✅ 该股票表现正常，建议继续观察。';
    }

    return answer;
}

// 生成收益回答
function generatePerformanceAnswer(portfolio, totalValue) {
    if (!portfolio || portfolio.length === 0) {
        return '暂无持仓数据。';
    }

    const totalCost = portfolio.reduce((sum, s) =>
        sum + (s.shares * (s.avg_cost || s.price || 0)), 0
    );
    const unrealizedPnL = totalValue - totalCost;
    const pnlPercent = totalCost > 0 ? (unrealizedPnL / totalCost * 100) : 0;

    const emoji = unrealizedPnL >= 0 ? '📈' : '📉';
    const status = unrealizedPnL >= 0 ? '盈利' : '亏损';

    return `${emoji} 当前持仓${status} ${Math.abs(unrealizedPnL).toFixed(2)} 元 (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)\n\n` +
        `总市值：${totalValue.toFixed(2)} 元\n` +
        `总成本：${totalCost.toFixed(2)} 元\n\n` +
        `表现最好：${getBestPerformer(portfolio)}\n` +
        `表现最差：${getWorstPerformer(portfolio)}`;
}

// 生成推荐回答
function generateRecommendationAnswer(portfolio, diagnosis) {
    if (!diagnosis || !diagnosis.suggestions || diagnosis.suggestions.length === 0) {
        return '暂无具体推荐建议。建议先生成组合诊断报告。';
    }

    const highPriority = diagnosis.suggestions.filter(s => s.priority === 'high');

    let answer = '基于当前组合分析，建议关注以下方面：\n\n';

    if (highPriority.length > 0) {
        answer += '🔴 高优先级：\n';
        highPriority.forEach(s => {
            answer += `• ${s.title}：${s.description}\n`;
        });
    }

    const mediumPriority = diagnosis.suggestions.filter(s => s.priority === 'medium');
    if (mediumPriority.length > 0) {
        answer += '\n🟡 中优先级：\n';
        mediumPriority.slice(0, 3).forEach(s => {
            answer += `• ${s.title}\n`;
        });
    }

    return answer;
}

// 生成市场概览回答
function generateMarketOverviewAnswer(portfolio) {
    if (!portfolio || portfolio.length === 0) {
        return '暂无持仓数据，无法分析市场关联。';
    }

    const upCount = portfolio.filter(s => (s.year_change || 0) > 0).length;
    const downCount = portfolio.filter(s => (s.year_change || 0) < 0).length;
    const avgChange = portfolio.reduce((sum, s) => sum + (s.year_change || 0), 0) / portfolio.length;

    return `您的持仓市场概览：\n\n` +
        `上涨股票：${upCount} 只\n` +
        `下跌股票：${downCount} 只\n` +
        `平均涨跌：${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%\n\n` +
        `整体趋势：${avgChange > 10 ? '强势上涨 📈' : avgChange > 0 ? '温和上涨 📊' : avgChange > -10 ? '震荡调整 ➡️' : '弱势下跌 📉'}`;
}

// 生成通用回答
function generateGeneralAnswer(question, contextData) {
    const { portfolio } = contextData;

    if (!portfolio || portfolio.length === 0) {
        return '您好！我是您的 AI 投资助手。您可以问我关于持仓、风险、股票分析等方面的问题。\n\n例如：\n• 我的持仓风险大吗？\n• 分析一下 000001\n• 今天市场怎么样？\n• 有什么投资建议？';
    }

    return `您好！我是您的 AI 投资助手。您当前持有 ${portfolio.length} 只股票。\n\n您可以问我：\n• 我的持仓怎么样？\n• 风险大吗？\n• 分析一下某只股票\n• 有什么投资建议？\n\n请问有什么可以帮您的？`;
}

// 获取表现最好的股票
function getBestPerformer(portfolio) {
    const best = portfolio.reduce((best, current) =>
        (current.year_change || 0) > (best.year_change || 0) ? current : best
    );
    return best ? `${best.name} (+${best.year_change?.toFixed(2) || 0}%)` : '无';
}

// 获取表现最差的股票
function getWorstPerformer(portfolio) {
    const worst = portfolio.reduce((worst, current) =>
        (current.year_change || 0) < (worst.year_change || 0) ? current : worst
    );
    return worst ? `${worst.name} (${worst.year_change?.toFixed(2) || 0}%)` : '无';
}

// 研报解读 API
app.post('/api/research/analyze', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { content, symbol, source } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: '请输入研报内容' });
        }

        // 使用 AI 分析研报
        const analysis = await aiService.analyzeResearchReport(content, symbol);

        // 保存分析结果
        await saveResearchAnalysis(userId, symbol, source, content, analysis);

        res.json({
            success: true,
            analysis
        });

    } catch (error) {
        console.error('研报分析失败:', error);
        res.status(500).json({ error: '研报分析失败: ' + error.message });
    }
});

// 获取研报历史
app.get('/api/research/history', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { symbol, limit = 10 } = req.query;

        let sql = 'SELECT * FROM research_analysis WHERE user_id = ?';
        const params = [userId];

        if (symbol) {
            sql += ' AND symbol = ?';
            params.push(symbol);
        }

        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(limit));

        db.all(sql, params, (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // 解析 JSON 字段
            const analyses = rows.map(row => ({
                ...row,
                summary: JSON.parse(row.summary || '{}'),
                key_points: JSON.parse(row.key_points || '[]'),
                risks: JSON.parse(row.risks || '[]'),
                outlook: JSON.parse(row.outlook || '{}')
            }));

            res.json({ success: true, analyses });
        });

    } catch (error) {
        console.error('获取研报历史失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 保存研报分析
async function saveResearchAnalysis(userId, symbol, source, content, analysis) {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO research_analysis
            (user_id, symbol, source, content_summary, summary, key_points, risks, outlook, sentiment, rating)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                symbol || null,
                source || null,
                content.substring(0, 500),
                JSON.stringify(analysis.summary || {}),
                JSON.stringify(analysis.keyPoints || []),
                JSON.stringify(analysis.risks || []),
                JSON.stringify(analysis.outlook || {}),
                analysis.sentiment || 'neutral',
                analysis.rating || null
            ],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

// 语音/文字交互 API - 智能助手
app.post('/api/assistant/chat', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { message, type = 'text' } = req.body;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: '请输入消息' });
        }

        // 获取用户上下文
        const context = await getAssistantContext(userId);

        // 处理用户消息
        const response = await processAssistantMessage(message, context, type);

        // 保存对话历史
        await saveChatHistory(userId, message, response.reply);

        res.json({
            success: true,
            reply: response.reply,
            suggestions: response.suggestions,
            actions: response.actions,
            type: response.type
        });

    } catch (error) {
        console.error('助手处理失败:', error);
        res.status(500).json({ error: '处理失败: ' + error.message });
    }
});

// 获取助手上下文
async function getAssistantContext(userId) {
    const context = {
        portfolio: [],
        recentAlerts: [],
        lastDiagnosis: null,
        chatHistory: []
    };

    try {
        // 获取持仓
        context.portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // 获取最近提醒
        context.recentAlerts = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
                [userId], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
        });

        // 获取最近对话
        context.chatHistory = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
                [userId], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.reverse());
                });
        });

    } catch (error) {
        console.error('获取助手上下文失败:', error);
    }

    return context;
}

// 处理助手消息
async function processAssistantMessage(message, context, type) {
    const lowerMsg = message.toLowerCase();

    // 1. 问候和介绍
    if (/你好|嗨|hi|hello/.test(lowerMsg)) {
        return {
            type: 'greeting',
            reply: generateGreeting(context),
            suggestions: ['查看持仓', '风险分析', '调仓建议', '市场热点'],
            actions: []
        };
    }

    // 2. 持仓相关
    if (/持仓|我的股票|组合|仓位/.test(lowerMsg)) {
        return generatePortfolioResponse(context);
    }

    // 3. 风险相关
    if (/风险|安全|危险|回撤/.test(lowerMsg)) {
        return generateRiskResponse(context);
    }

    // 4. 分析相关
    if (/分析|诊断|评估/.test(lowerMsg)) {
        return {
            type: 'analysis',
            reply: '我来为您生成组合诊断报告...',
            suggestions: ['查看详细报告', '获取调仓建议'],
            actions: [{ type: 'navigate', target: '/diagnosis', label: '查看诊断报告' }]
        };
    }

    // 5. 调仓建议
    if (/调仓|建议|买卖|操作/.test(lowerMsg)) {
        return {
            type: 'rebalance',
            reply: '我可以为您提供调仓建议。请告诉我您的风险偏好（稳健/平衡/积极）？',
            suggestions: ['稳健型', '平衡型', '积极型'],
            actions: []
        };
    }

    // 6. 市场热点
    if (/市场|热点|行情|新闻/.test(lowerMsg)) {
        return generateMarketResponse(context);
    }

    // 7. 帮助
    if (/帮助|help|能做什么|功能/.test(lowerMsg)) {
        return generateHelpResponse();
    }

    // 默认回复
    return {
        type: 'general',
        reply: '抱歉，我没有完全理解您的问题。您可以问我关于持仓、风险分析、调仓建议等方面的问题。',
        suggestions: ['查看持仓', '风险分析', '调仓建议', '帮助'],
        actions: []
    };
}

// 生成问候语
function generateGreeting(context) {
    const hour = new Date().getHours();
    let timeGreeting = '您好';
    if (hour < 12) timeGreeting = '早上好';
    else if (hour < 18) timeGreeting = '下午好';
    else timeGreeting = '晚上好';

    if (!context.portfolio || context.portfolio.length === 0) {
        return `${timeGreeting}！我是您的 AI 投资助手。您还没有添加持仓，可以通过上传截图或手动添加来开始。`;
    }

    const totalValue = context.portfolio.reduce((sum, s) =>
        sum + (s.shares * (s.price || s.avg_cost || 0)), 0
    );
    const avgChange = context.portfolio.reduce((sum, s) => sum + (s.year_change || 0), 0) / context.portfolio.length;
    const trend = avgChange >= 0 ? '📈' : '📉';

    return `${timeGreeting}！我是您的 AI 投资助手。\n\n您当前持有 ${context.portfolio.length} 只股票，总市值 ${totalValue.toFixed(2)} 元。${trend} 整体年内平均涨跌 ${avgChange.toFixed(2)}%。\n\n有什么可以帮您的吗？`;
}

// 生成持仓回复
function generatePortfolioResponse(context) {
    if (!context.portfolio || context.portfolio.length === 0) {
        return {
            type: 'portfolio',
            reply: '您当前没有持仓。可以通过以下方式添加：\n1. 上传持仓截图\n2. 手动添加股票\n3. 从自选股导入',
            suggestions: ['上传截图', '手动添加', '查看示例'],
            actions: [{ type: 'navigate', target: '/upload', label: '上传截图' }]
        };
    }

    const topHoldings = context.portfolio
        .map(s => ({ name: s.name, change: s.year_change || 0 }))
        .sort((a, b) => b.change - a.change)
        .slice(0, 3);

    const reply = `您当前持有 ${context.portfolio.length} 只股票。\n\n表现前三：\n${topHoldings.map((h, i) => `${i+1}. ${h.name}: ${h.change >= 0 ? '+' : ''}${h.change.toFixed(2)}%`).join('\n')}\n\n需要查看详细持仓或进行分析吗？`;

    return {
        type: 'portfolio',
        reply,
        suggestions: ['详细持仓', '组合诊断', '调仓建议', '刷新价格'],
        actions: [
            { type: 'navigate', target: '/portfolio', label: '查看详细持仓' },
            { type: 'navigate', target: '/diagnosis', label: '组合诊断' }
        ]
    };
}

// 生成风险回复
function generateRiskResponse(context) {
    if (!context.portfolio || context.portfolio.length === 0) {
        return {
            type: 'risk',
            reply: '暂无持仓数据，无法评估风险。请先添加持仓。',
            suggestions: ['添加持仓', '上传截图'],
            actions: []
        };
    }

    const negativeStocks = context.portfolio.filter(s => (s.year_change || 0) < -20);
    const highConcentration = context.portfolio.length < 5;

    let riskLevel = 'low';
    let reply = '您的组合风险可控。';

    if (negativeStocks.length > 0 || highConcentration) {
        riskLevel = 'medium';
        reply = '您的组合存在以下风险点：\n';
        if (negativeStocks.length > 0) {
            reply += `• ${negativeStocks.length} 只股票年内跌幅超过20%\n`;
        }
        if (highConcentration) {
            reply += '• 持仓数量较少，分散度不足\n';
        }
        reply += '\n建议进行组合诊断以获取详细分析和优化建议。';
    }

    return {
        type: 'risk',
        reply,
        suggestions: ['组合诊断', '查看详细分析', '获取优化建议'],
        actions: [{ type: 'navigate', target: '/diagnosis', label: '组合诊断' }],
        riskLevel
    };
}

// 生成市场回复
function generateMarketResponse(context) {
    const upCount = context.portfolio.filter(s => (s.year_change || 0) > 0).length;
    const downCount = context.portfolio.filter(s => (s.year_change || 0) < 0).length;

    return {
        type: 'market',
        reply: `您的持仓市场概况：\n📈 上涨：${upCount} 只\n📉 下跌：${downCount} 只\n\n可以通过"新闻监控"功能获取持仓相关最新资讯。`,
        suggestions: ['新闻监控', '行业分析', '持仓对比'],
        actions: [{ type: 'navigate', target: '/news', label: '新闻监控' }]
    };
}

// 生成帮助回复
function generateHelpResponse() {
    return {
        type: 'help',
        reply: `我可以帮您：

📊 **持仓管理**
• 查看持仓明细
• 上传截图识别
• 刷新实时价格

🔍 **投资分析**
• 组合诊断报告
• 风险评估
• 调仓建议

📰 **资讯服务**
• 新闻监控
• 研报解读
• 市场热点

💬 **随时提问**
• "我的持仓怎么样？"
• "风险大吗？"
• "有什么建议？"`,
        suggestions: ['查看持仓', '组合诊断', '调仓建议', '新闻监控'],
        actions: []
    };
}

// 保存对话历史
async function saveChatHistory(userId, message, reply) {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO chat_history (user_id, message, reply) VALUES (?, ?, ?)`,
            [userId, message, reply],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

// 获取监控列表（支持多用户）
app.get('/api/monitoring', authenticateToken, (req, res) => {
    const userId = req.userId;

    db.all('SELECT * FROM monitoring WHERE status = ? AND user_id = ?', ['active', userId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ monitoring: rows });
    });
});

// 财报日历API
app.get('/api/earnings/calendar', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { days = 30 } = req.query;
        
        // 获取用户持仓
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        if (!portfolio || portfolio.length === 0) {
            return res.json({ earnings: [], message: '暂无持仓' });
        }
        
        // 获取财报日历
        const earnings = await earningsCalendarService.getUpcomingEarnings(portfolio, parseInt(days));
        
        res.json({ 
            earnings,
            total: earnings.length,
            within7Days: earnings.filter(e => e.daysUntil <= 7).length,
            within30Days: earnings.filter(e => e.daysUntil <= 30).length
        });
    } catch (error) {
        console.error('[EarningsCalendar API] 错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取单只股票财报信息
app.get('/api/earnings/:symbol', authenticateToken, async (req, res) => {
    try {
        const { symbol } = req.params;
        const { market = 'US' } = req.query;
        
        const earnings = await earningsCalendarService.getEarningsDate(symbol, market);
        
        if (!earnings) {
            return res.status(404).json({ error: '未找到财报信息' });
        }
        
        res.json({ earnings });
    } catch (error) {
        console.error('[EarningsCalendar API] 错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 新闻监控API - 获取持仓股票新闻
app.get('/api/news/monitor', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { limit = 20 } = req.query;
        
        // 获取用户持仓
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        if (!portfolio || portfolio.length === 0) {
            return res.json({ news: [], message: '暂无持仓' });
        }
        
        // 获取新闻
        const news = await newsMonitorService.getPortfolioNews(portfolio, parseInt(limit));
        
        // 统计
        const positiveCount = news.filter(n => n.sentiment === 'positive').length;
        const negativeCount = news.filter(n => n.sentiment === 'negative').length;
        const neutralCount = news.filter(n => n.sentiment === 'neutral').length;
        
        res.json({
            news,
            total: news.length,
            positive: positiveCount,
            negative: negativeCount,
            neutral: neutralCount
        });
    } catch (error) {
        console.error('[NewsMonitor API] 错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取重要新闻
app.get('/api/news/important', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        if (!portfolio || portfolio.length === 0) {
            return res.json({ news: [] });
        }
        
        const news = await newsMonitorService.getImportantNews(portfolio);
        
        res.json({ news, total: news.length });
    } catch (error) {
        console.error('[NewsMonitor API] 错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取提醒列表（支持多用户）
app.get('/api/alerts', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { unreadOnly } = req.query;

    let sql = 'SELECT * FROM alerts WHERE user_id = ?';
    const params = [userId];

    if (unreadOnly === 'true') {
        sql += ' AND is_read = 0';
    }
    sql += ' ORDER BY created_at DESC';

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ alerts: rows });
    });
});

// 获取标的分析详情（支持多用户）
app.get('/api/analysis/:symbol', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { symbol } = req.params;

    db.get('SELECT * FROM analysis WHERE symbol = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1',
        [symbol, userId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!row) {
                return res.status(404).json({ error: '未找到分析记录' });
            }

            // 解析 JSON 字段
            const analysis = {
                ...row,
                key_drivers: JSON.parse(row.key_drivers || '[]'),
                risk_factors: JSON.parse(row.risk_factors || '[]'),
                monitoring_checklist: JSON.parse(row.monitoring_checklist || '[]')
            };

            res.json({ analysis });
        }
    );
});

// 手动刷新监控数据（支持多用户）
app.post('/api/monitoring/refresh', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;

        // 获取用户的持仓
        db.all('SELECT * FROM portfolio WHERE user_id = ?', [userId], async (err, stocks) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            const newAlerts = [];

            // 重新分析每只股票
            for (const stock of stocks) {
                try {
                    const newAnalysis = await aiService.analyzeStockLogic(stock.symbol, stock.name);

                    // 对比之前的分析，检测变化
                    db.get('SELECT * FROM analysis WHERE symbol = ? ORDER BY created_at DESC LIMIT 1',
                        [stock.symbol], async (err, oldAnalysis) => {
                            if (oldAnalysis && newAnalysis) {
                                // 检测重大变化
                                if (Math.abs(newAnalysis.year_change - (oldAnalysis.year_change || 0)) > 10) {
                                    const alert = {
                                        symbol: stock.symbol,
                                        alert_type: 'price_change',
                                        priority: 'high',
                                        title: `${stock.name} 涨跌幅发生重大变化`,
                                        content: `年内涨跌幅从 ${oldAnalysis.year_change}% 变为 ${newAnalysis.year_change}%`
                                    };
                                    saveAlert(alert, userId);
                                    newAlerts.push(alert);
                                }
                            }

                            // 保存新分析
                            saveStockAnalysis(stock.symbol, newAnalysis, userId);
                        });
                } catch (err) {
                    console.error(`刷新 ${stock.symbol} 失败:`, err.message);
                }
            }

            res.json({
                success: true,
                newAlerts: newAlerts.length,
                message: `刷新完成，新增 ${newAlerts.length} 条提醒`
            });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ 数据库操作 ============

function savePortfolio(portfolio, userId = 1) {
    portfolio.forEach(stock => {
        // 先尝试更新，如果不存在则插入
        db.get('SELECT id FROM portfolio WHERE symbol = ? AND user_id = ?', [stock.symbol, userId], (err, row) => {
            if (err) {
                console.error('查询持仓失败:', err.message);
                return;
            }

            if (row) {
                // 更新现有记录
                db.run(`UPDATE portfolio SET
                    shares = ?,
                    price = ?,
                    year_change = ?,
                    updated_at = CURRENT_TIMESTAMP
                    WHERE symbol = ? AND user_id = ?`,
                    [stock.shares, stock.price, stock.year_change, stock.symbol, userId],
                    (err) => {
                        if (err) console.error('更新持仓失败:', err.message);
                    }
                );
            } else {
                // 插入新记录
                db.run(`INSERT INTO portfolio (symbol, name, market, shares, avg_cost, price, currency, year_change, user_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [stock.symbol, stock.name, stock.market, stock.shares, stock.avgCost, stock.price, stock.currency, stock.year_change, userId],
                    (err) => {
                        if (err) console.error('插入持仓失败:', err.message);
                    }
                );
            }
        });
    });
}

function saveStockAnalysis(symbol, analysis, userId = 1) {
    db.run(`INSERT INTO analysis (symbol, year_change, trend_summary, key_drivers, risk_factors, monitoring_checklist, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            symbol,
            analysis.year_change,
            analysis.trend_summary,
            JSON.stringify(analysis.key_drivers || []),
            JSON.stringify(analysis.risk_factors || []),
            JSON.stringify(analysis.monitoring_checklist || []),
            userId
        ],
        (err) => {
            if (err) console.error('保存分析失败:', err.message);
        }
    );
}

function saveMonitoringMetrics(metrics, userId = 1) {
    metrics.forEach(m => {
        db.get('SELECT id FROM monitoring WHERE symbol = ? AND metric_name = ? AND user_id = ?',
            [m.symbol, m.metric, userId],
            (err, row) => {
                if (err) {
                    console.error('查询监控指标失败:', err.message);
                    return;
                }

                if (row) {
                    db.run(`UPDATE monitoring SET
                        description = ?,
                        threshold_value = ?
                        WHERE id = ?`,
                        [m.description, m.threshold, row.id],
                        (err) => {
                            if (err) console.error('更新监控指标失败:', err.message);
                        }
                    );
                } else {
                    db.run(`INSERT INTO monitoring (symbol, metric_name, metric_type, description, threshold_value, user_id)
                        VALUES (?, ?, ?, ?, ?, ?)`,
                        [m.symbol, m.metric, m.type, m.description, m.threshold, userId],
                        (err) => {
                            if (err) console.error('插入监控指标失败:', err.message);
                        }
                    );
                }
            }
        );
    });
}

function saveAlert(alert, userId = 1) {
    db.run(`INSERT INTO alerts (symbol, alert_type, priority, title, content, user_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
        [alert.symbol, alert.alert_type, alert.priority, alert.title, alert.content, userId],
        (err) => {
            if (err) console.error('保存提醒失败:', err.message);
        }
    );
}

/**
 * 保存历史价格数据
 * @param {string} symbol - 股票代码
 * @param {Array} historyData - 历史价格数组
 */
function savePriceHistory(symbol, historyData) {
    if (!historyData || historyData.length === 0) return;

    const stmt = db.prepare(`INSERT OR REPLACE INTO price_history
        (symbol, date, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);

    historyData.forEach(item => {
        stmt.run([
            symbol,
            item.date,
            item.open,
            item.high,
            item.low,
            item.close,
            item.volume
        ]);
    });

    stmt.finalize();
    console.log(`[价格历史] 已保存 ${symbol} 的 ${historyData.length} 条记录`);
}

/**
 * 从数据库获取历史价格
 * @param {string} symbol - 股票代码
 * @param {number} days - 天数
 * @returns {Promise<Array>} 历史价格数组
 */
function getPriceHistoryFromDB(symbol, days) {
    return new Promise((resolve, reject) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffStr = cutoffDate.toISOString().split('T')[0];

        db.all(
            `SELECT * FROM price_history
             WHERE symbol = ? AND date >= ?
             ORDER BY date ASC`,
            [symbol, cutoffStr],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

/**
 * 计算组合历史净值
 */
async function calculatePortfolioHistory(portfolio, days) {
    const histories = [];

    for (const stock of portfolio) {
        const history = await dataService.getStockHistory(stock.symbol, days);
        if (history.length > 0) {
            histories.push({
                symbol: stock.symbol,
                shares: stock.shares,
                history: history
            });
        }
    }

    if (histories.length === 0) return [];

    // 按日期合并计算组合净值
    const dates = histories[0].history.map(h => h.date);

    return dates.map(date => {
        let totalValue = 0;

        histories.forEach(({ shares, history }) => {
            const dayData = history.find(h => h.date === date);
            if (dayData) {
                totalValue += shares * dayData.close;
            }
        });

        return {
            date,
            value: totalValue
        };
    });
}

/**
 * 计算总收益率
 */
function calculateTotalReturn(history) {
    if (history.length < 2) return 0;
    const start = history[0].value;
    const end = history[history.length - 1].value;
    return start > 0 ? ((end - start) / start * 100).toFixed(2) : 0;
}

/**
 * 计算波动率
 */
function calculateVolatility(history) {
    if (history.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < history.length; i++) {
        const dailyReturn = (history[i].value - history[i-1].value) / history[i-1].value;
        returns.push(dailyReturn);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return (stdDev * Math.sqrt(252) * 100).toFixed(2); // 年化波动率
}

/**
 * 计算最大回撤
 */
function calculateMaxDrawdown(history) {
    if (history.length < 2) return 0;

    let maxDrawdown = 0;
    let peak = history[0].value;

    for (const day of history) {
        if (day.value > peak) {
            peak = day.value;
        }
        const drawdown = (peak - day.value) / peak;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return (maxDrawdown * 100).toFixed(2);
}

/**
 * 计算夏普比率
 */
function calculateSharpeRatio(history) {
    if (history.length < 2) return 0;

    const totalReturn = parseFloat(calculateTotalReturn(history));
    const volatility = parseFloat(calculateVolatility(history));

    // 假设无风险利率为 3%
    const riskFreeRate = 3;

    return volatility > 0 ? ((totalReturn - riskFreeRate) / volatility).toFixed(2) : 0;
}

/**
 * 获取基准名称
 */
function getBenchmarkName(symbol) {
    const benchmarks = {
        '000001.SH': '上证指数',
        '399001.SZ': '深证成指',
        '399006.SZ': '创业板指',
        '000300.SH': '沪深300',
        '000905.SH': '中证500'
    };
    return benchmarks[symbol] || symbol;
}

/**
 * 合并历史数据
 */
function mergeHistories(portfolioHistory, benchmarkHistory) {
    return portfolioHistory.map((day, index) => ({
        date: day.date,
        portfolio: day.value,
        benchmark: benchmarkHistory[index]?.close || 0
    }));
}

// ============ 监控提醒 API ============

// 手动检查监控指标
app.post('/api/monitoring/check', async (req, res) => {
    try {
        const alerts = await monitoringService.checkMonitoringMetrics(db);
        res.json({
            success: true,
            alertsTriggered: alerts.length,
            alerts
        });
    } catch (error) {
        console.error('检查监控指标失败:', error);
        res.status(500).json({ error: '检查失败: ' + error.message });
    }
});

// 检查单只股票的逻辑变化
app.post('/api/monitoring/check-logic/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const alert = await monitoringService.checkLogicChange(db, symbol);

        if (alert) {
            res.json({
                success: true,
                hasChange: true,
                alert
            });
        } else {
            res.json({
                success: true,
                hasChange: false,
                message: '未检测到重大逻辑变化'
            });
        }
    } catch (error) {
        console.error('检查逻辑变化失败:', error);
        res.status(500).json({ error: '检查失败: ' + error.message });
    }
});

// 获取监控报告
app.get('/api/monitoring/report', async (req, res) => {
    try {
        const report = await monitoringService.generateMonitoringReport(db);
        res.json({
            success: true,
            report
        });
    } catch (error) {
        console.error('生成监控报告失败:', error);
        res.status(500).json({ error: '生成报告失败: ' + error.message });
    }
});

// 标记提醒为已读
app.post('/api/alerts/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        await monitoringService.markAlertAsRead(db, id);
        res.json({ success: true, message: '已标记为已读' });
    } catch (error) {
        console.error('标记已读失败:', error);
        res.status(500).json({ error: '操作失败: ' + error.message });
    }
});

// ============ 飞书推送 API ============

// 发送测试消息到飞书
app.post('/api/feishu/test', async (req, res) => {
    try {
        const result = await feishuService.sendTextMessage('🎉 测试消息：持仓智投飞书推送功能已配置！');
        res.json(result);
    } catch (error) {
        console.error('飞书测试失败:', error);
        res.status(500).json({ error: '发送失败: ' + error.message });
    }
});

// 发送持仓提醒到飞书
app.post('/api/feishu/alerts', async (req, res) => {
    try {
        const { alerts } = req.body;
        const result = await feishuService.sendPortfolioAlerts(alerts);
        res.json(result);
    } catch (error) {
        console.error('飞书提醒发送失败:', error);
        res.status(500).json({ error: '发送失败: ' + error.message });
    }
});

// 发送每日报告到飞书
app.post('/api/feishu/daily-report', async (req, res) => {
    try {
        const report = await monitoringService.generateMonitoringReport(db);

        // 获取持仓数据
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio', [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });

        const totalValue = portfolio.reduce((sum, item) => sum + (item.price * item.shares), 0);
        const todayPnL = portfolio.reduce((sum, item) => {
            const pnl = item.price && item.avg_cost ? (item.price - item.avg_cost) * item.shares : 0;
            return sum + pnl;
        }, 0);

        const result = await feishuService.sendDailyReport({
            portfolio: portfolio.map(p => ({
                symbol: p.symbol,
                name: p.name,
                price: p.price || 0,
                changePercent: p.year_change || 0
            })),
            totalValue,
            todayPnL,
            alerts: report.latestAlerts
        });

        res.json(result);
    } catch (error) {
        console.error('飞书日报发送失败:', error);
        res.status(500).json({ error: '发送失败: ' + error.message });
    }
});

// ============ 价格预警 API ============

// 获取价格预警列表
app.get('/api/price-alerts', (req, res) => {
    const { symbol } = req.query;
    let sql = 'SELECT * FROM price_alerts WHERE is_active = 1';
    const params = [];

    if (symbol) {
        sql += ' AND symbol = ?';
        params.push(symbol);
    }
    sql += ' ORDER BY created_at DESC';

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ alerts: rows });
    });
});

// 创建价格预警
app.post('/api/price-alerts', async (req, res) => {
    try {
        const { symbol, alertType, targetPrice } = req.body;

        if (!symbol || !alertType || !targetPrice) {
            return res.status(400).json({ error: '缺少必要参数' });
        }

        // 获取当前价格
        const stockData = await stockService.getStockPrice(symbol);
        const currentPrice = stockData ? parseFloat(stockData.price) : null;

        db.run(
            'INSERT INTO price_alerts (symbol, alert_type, target_price, current_price) VALUES (?, ?, ?, ?)',
            [symbol, alertType, targetPrice, currentPrice],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({
                    success: true,
                    alertId: this.lastID,
                    message: `已创建${alertType === 'above' ? '突破' : '跌破'}预警：${symbol} 目标价 ${targetPrice}`
                });
            }
        );
    } catch (error) {
        console.error('创建价格预警失败:', error);
        res.status(500).json({ error: '创建失败: ' + error.message });
    }
});

// 删除价格预警
app.delete('/api/price-alerts/:id', (req, res) => {
    const { id } = req.params;
    db.run('UPDATE price_alerts SET is_active = 0 WHERE id = ?', [id], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: '预警已删除' });
    });
});

// 检查价格预警
app.post('/api/price-alerts/check', async (req, res) => {
    try {
        const triggeredAlerts = await checkPriceAlerts();
        res.json({
            success: true,
            triggered: triggeredAlerts.length,
            alerts: triggeredAlerts
        });
    } catch (error) {
        console.error('检查价格预警失败:', error);
        res.status(500).json({ error: '检查失败: ' + error.message });
    }
});

// ============ 新闻监控 API ============

// 获取股票相关新闻
app.get('/api/news/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { limit = 10 } = req.query;

        // 先从数据库获取已存储的新闻
        const cachedNews = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM news WHERE symbol = ? ORDER BY published_at DESC LIMIT ?',
                [symbol, parseInt(limit)],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // 如果缓存的新闻太旧（超过2小时），重新抓取
        const shouldRefresh = cachedNews.length === 0 ||
            (cachedNews[0] && new Date() - new Date(cachedNews[0].created_at) > 2 * 60 * 60 * 1000);

        if (shouldRefresh) {
            // 获取股票名称
            const stock = await new Promise((resolve, reject) => {
                db.get('SELECT name FROM portfolio WHERE symbol = ?', [symbol], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (stock) {
                // 抓取新新闻
                const freshNews = await newsService.searchStockNews(symbol, stock.name);

                // 获取监控指标用于相关性分析
                const metrics = await new Promise((resolve, reject) => {
                    db.all(
                        'SELECT * FROM monitoring WHERE symbol = ? AND status = ?',
                        [symbol, 'active'],
                        (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows);
                        }
                    );
                });

                // 分析并保存新闻
                for (const item of freshNews) {
                    const analysis = await newsService.analyzeNewsRelevance(item, metrics);

                    db.run(
                        `INSERT INTO news (symbol, title, url, summary, source, published_at,
                         relevance_score, sentiment, matched_metrics, is_important)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            symbol,
                            item.title,
                            item.url,
                            item.summary,
                            item.source,
                            item.publishedAt,
                            analysis.isRelevant ? 0.8 : item.relevanceScore || 0.5,
                            analysis.sentiment,
                            JSON.stringify(analysis.matchedMetrics),
                            analysis.importance === 'high' ? 1 : 0
                        ]
                    );
                }

                // 重新查询
                const updatedNews = await new Promise((resolve, reject) => {
                    db.all(
                        'SELECT * FROM news WHERE symbol = ? ORDER BY published_at DESC LIMIT ?',
                        [symbol, parseInt(limit)],
                        (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows);
                        }
                    );
                });

                return res.json({
                    success: true,
                    news: updatedNews,
                    refreshed: true
                });
            }
        }

        res.json({
            success: true,
            news: cachedNews,
            refreshed: false
        });

    } catch (error) {
        console.error('获取新闻失败:', error);
        res.status(500).json({ error: '获取新闻失败: ' + error.message });
    }
});

// 获取所有重要新闻
app.get('/api/news', async (req, res) => {
    try {
        const { importantOnly = 'false', limit = 20 } = req.query;

        let sql = 'SELECT * FROM news';
        const params = [];

        if (importantOnly === 'true') {
            sql += ' WHERE is_important = 1';
        }

        sql += ' ORDER BY published_at DESC LIMIT ?';
        params.push(parseInt(limit));

        db.all(sql, params, (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                news: rows
            });
        });

    } catch (error) {
        console.error('获取新闻列表失败:', error);
        res.status(500).json({ error: '获取失败: ' + error.message });
    }
});

// 手动刷新所有持仓的新闻
app.post('/api/news/refresh', async (req, res) => {
    try {
        // 获取所有持仓
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const results = [];

        for (const stock of portfolio) {
            // 获取监控指标
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

            // 抓取新闻
            const news = await newsService.searchStockNews(stock.symbol, stock.name);
            let savedCount = 0;
            let importantCount = 0;

            for (const item of news) {
                const analysis = await newsService.analyzeNewsRelevance(item, metrics);

                // 检查是否已存在
                const exists = await new Promise((resolve) => {
                    db.get(
                        'SELECT id FROM news WHERE symbol = ? AND title = ?',
                        [stock.symbol, item.title],
                        (err, row) => resolve(!!row)
                    );
                });

                if (!exists) {
                    db.run(
                        `INSERT INTO news (symbol, title, url, summary, source, published_at,
                         relevance_score, sentiment, matched_metrics, is_important)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            stock.symbol,
                            item.title,
                            item.url,
                            item.summary,
                            item.source,
                            item.publishedAt,
                            analysis.isRelevant ? 0.8 : item.relevanceScore || 0.5,
                            analysis.sentiment,
                            JSON.stringify(analysis.matchedMetrics),
                            analysis.importance === 'high' ? 1 : 0
                        ]
                    );
                    savedCount++;
                    if (analysis.importance === 'high') importantCount++;
                }
            }

            results.push({
                symbol: stock.symbol,
                name: stock.name,
                newNews: savedCount,
                importantNews: importantCount
            });
        }

        res.json({
            success: true,
            message: `新闻刷新完成`,
            results
        });

    } catch (error) {
        console.error('刷新新闻失败:', error);
        res.status(500).json({ error: '刷新失败: ' + error.message });
    }
});

// 生成每日新闻摘要
app.get('/api/news/summary/daily', async (req, res) => {
    try {
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const summary = await newsService.generateDailyNewsSummary(portfolio, db);

        res.json({
            success: true,
            summary
        });

    } catch (error) {
        console.error('生成新闻摘要失败:', error);
        res.status(500).json({ error: '生成失败: ' + error.message });
    }
});

// 检查价格预警实现
async function checkPriceAlerts() {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM price_alerts WHERE is_active = 1 AND is_triggered = 0',
            [],
            async (err, alerts) => {
                if (err) return reject(err);

                const triggered = [];

                for (const alert of alerts) {
                    try {
                        const stockData = await stockService.getStockPrice(alert.symbol);
                        if (!stockData) continue;

                        const currentPrice = parseFloat(stockData.price);
                        const targetPrice = parseFloat(alert.target_price);

                        let isTriggered = false;

                        if (alert.alert_type === 'above' && currentPrice >= targetPrice) {
                            isTriggered = true;
                        } else if (alert.alert_type === 'below' && currentPrice <= targetPrice) {
                            isTriggered = true;
                        }

                        if (isTriggered) {
                            // 更新预警状态
                            db.run(
                                'UPDATE price_alerts SET is_triggered = 1, triggered_at = CURRENT_TIMESTAMP, current_price = ? WHERE id = ?',
                                [currentPrice, alert.id]
                            );

                            // 保存提醒
                            const alertRecord = {
                                symbol: alert.symbol,
                                alert_type: 'price_alert',
                                priority: 'high',
                                title: `价格预警触发：${alert.symbol}`,
                                content: `${alert.alert_type === 'above' ? '突破' : '跌破'}目标价 ${targetPrice}，当前价格 ${currentPrice}`
                            };
                            saveAlert(alertRecord);

                            // 发送飞书通知
                            await feishuService.sendPriceAlert(
                                alert.symbol,
                                alert.symbol,
                                currentPrice,
                                targetPrice,
                                alert.alert_type
                            );

                            triggered.push({
                                ...alert,
                                currentPrice,
                                triggeredAt: new Date().toISOString()
                            });
                        }
                    } catch (err) {
                        console.error(`检查预警 ${alert.symbol} 失败:`, err.message);
                    }
                }

                resolve(triggered);
            }
        );
    });
}

// 生成监控指标
function generateMonitoringMetrics(stockAnalyses) {
    const metrics = [];

    stockAnalyses.forEach(analysis => {
        if (analysis.monitoring_checklist) {
            analysis.monitoring_checklist.forEach(item => {
                metrics.push({
                    symbol: analysis.symbol,
                    metric: item.item,
                    type: item.frequency,
                    description: item.description || '',
                    threshold: item.threshold || ''
                });
            });
        }
    });

    return metrics;
}

// ============ 内存监控 API ============

// 获取内存使用统计
app.get('/api/system/memory', authenticateToken, (req, res) => {
    const stats = memoryOpt.getMemoryStats();
    res.json({
        success: true,
        memory: stats
    });
});

// 手动触发资源清理
app.post('/api/system/cleanup', authenticateToken, (req, res) => {
    memoryOpt.cleanupResources();
    res.json({
        success: true,
        message: '资源清理已触发',
        memory: memoryOpt.getMemoryStats()
    });
});

// ============ 热门股票 API ============

// 获取热门股票概览（涨幅榜、跌幅榜、成交量榜、热门板块）
app.get('/api/hot-stocks/overview', async (req, res) => {
    try {
        const overview = await hotStocksService.getHotStocksOverview();
        res.json({
            success: true,
            data: overview
        });
    } catch (error) {
        console.error('获取热门股票概览失败:', error);
        res.status(500).json({ error: '获取失败: ' + error.message });
    }
});

// 获取涨幅榜
app.get('/api/hot-stocks/gainers', async (req, res) => {
    try {
        const { market = 'A股', limit = 20 } = req.query;
        const gainers = await hotStocksService.getGainers(market, parseInt(limit));
        res.json({
            success: true,
            market,
            count: gainers.length,
            data: gainers
        });
    } catch (error) {
        console.error('获取涨幅榜失败:', error);
        res.status(500).json({ error: '获取失败: ' + error.message });
    }
});

// 获取跌幅榜
app.get('/api/hot-stocks/losers', async (req, res) => {
    try {
        const { market = 'A股', limit = 20 } = req.query;
        const losers = await hotStocksService.getLosers(market, parseInt(limit));
        res.json({
            success: true,
            market,
            count: losers.length,
            data: losers
        });
    } catch (error) {
        console.error('获取跌幅榜失败:', error);
        res.status(500).json({ error: '获取失败: ' + error.message });
    }
});

// 获取成交量榜
app.get('/api/hot-stocks/volume', async (req, res) => {
    try {
        const { market = 'A股', limit = 20 } = req.query;
        const volumeLeaders = await hotStocksService.getVolumeLeaders(market, parseInt(limit));
        res.json({
            success: true,
            market,
            count: volumeLeaders.length,
            data: volumeLeaders
        });
    } catch (error) {
        console.error('获取成交量榜失败:', error);
        res.status(500).json({ error: '获取失败: ' + error.message });
    }
});

// 获取热门板块
app.get('/api/hot-stocks/sectors', async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const sectors = await hotStocksService.getHotSectors(parseInt(limit));
        res.json({
            success: true,
            count: sectors.length,
            data: sectors
        });
    } catch (error) {
        console.error('获取热门板块失败:', error);
        res.status(500).json({ error: '获取失败: ' + error.message });
    }
});

// ============ 自选股 API ============

// 获取自选股列表
app.get('/api/watchlist', authenticateToken, (req, res) => {
    const userId = req.userId;

    db.all(
        'SELECT * FROM watchlist WHERE user_id = ? ORDER BY added_at DESC',
        [userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, watchlist: rows });
        }
    );
});

// 添加自选股
app.post('/api/watchlist', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { symbol, name, market = 'A股', notes = '' } = req.body;

    if (!symbol || !name) {
        return res.status(400).json({ error: '股票代码和名称不能为空' });
    }

    db.run(
        'INSERT OR REPLACE INTO watchlist (user_id, symbol, name, market, notes) VALUES (?, ?, ?, ?, ?)',
        [userId, symbol, name, market, notes],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                message: '已添加到自选',
                id: this.lastID
            });
        }
    );
});

// 删除自选股
app.delete('/api/watchlist/:symbol', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { symbol } = req.params;

    db.run(
        'DELETE FROM watchlist WHERE user_id = ? AND symbol = ?',
        [userId, symbol],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                message: '已从自选移除',
                changes: this.changes
            });
        }
    );
});

// 检查股票是否在自选
app.get('/api/watchlist/check/:symbol', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { symbol } = req.params;

    db.get(
        'SELECT * FROM watchlist WHERE user_id = ? AND symbol = ?',
        [userId, symbol],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                isInWatchlist: !!row,
                item: row
            });
        }
    );
});

// ============ 智投镜头 API ============

// 获取可用镜头列表
app.get('/api/lenses', (req, res) => {
    try {
        const lenses = lensService.getAvailableLenses();
        res.json({
            success: true,
            count: lenses.length,
            data: lenses
        });
    } catch (error) {
        console.error('获取镜头列表失败:', error);
        res.status(500).json({ error: '获取失败: ' + error.message });
    }
});

// 使用指定镜头分析持仓
app.post('/api/lenses/:lensId/analyze', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { lensId } = req.params;

        // 获取用户持仓
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        if (!portfolio || portfolio.length === 0) {
            return res.json({
                success: true,
                message: '暂无持仓数据',
                analysis: null
            });
        }

        // 使用镜头分析
        const analysis = await lensService.analyzeWithLens(portfolio, lensId);

        res.json({
            success: true,
            analysis
        });

    } catch (error) {
        console.error('镜头分析失败:', error);
        res.status(500).json({ error: '分析失败: ' + error.message });
    }
});

// 对比所有镜头分析
app.get('/api/lenses/compare', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;

        // 获取用户持仓
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        if (!portfolio || portfolio.length === 0) {
            return res.json({
                success: true,
                message: '暂无持仓数据',
                comparisons: []
            });
        }

        // 获取所有镜头分析
        const lenses = lensService.getAvailableLenses();
        const comparisons = [];

        for (const lens of lenses) {
            const analysis = await lensService.analyzeWithLens(portfolio, lens.id);
            comparisons.push({
                lensId: lens.id,
                lensName: lens.name,
                lensIcon: lens.icon,
                score: analysis.portfolioScore,
                level: analysis.scoreLevel
            });
        }

        // 按评分排序
        comparisons.sort((a, b) => b.score - a.score);

        res.json({
            success: true,
            comparisons
        });

    } catch (error) {
        console.error('镜头对比失败:', error);
        res.status(500).json({ error: '对比失败: ' + error.message });
    }
});

// ============ 交易记录 API ============

// 获取交易记录列表
app.get('/api/transactions', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { symbol, startDate, endDate, limit = 100 } = req.query;

    let sql = 'SELECT * FROM transactions WHERE user_id = ?';
    const params = [userId];

    if (symbol) {
        sql += ' AND symbol = ?';
        params.push(symbol);
    }
    if (startDate) {
        sql += ' AND date >= ?';
        params.push(startDate);
    }
    if (endDate) {
        sql += ' AND date <= ?';
        params.push(endDate);
    }

    sql += ' ORDER BY date DESC, created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, transactions: rows });
    });
});

// 添加交易记录
app.post('/api/transactions', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { symbol, name, action, shares, price, fee = 0, tax = 0, date, notes = '' } = req.body;

    // 验证必填字段
    if (!symbol || !name || !action || !shares || !price || !date) {
        return res.status(400).json({ error: '缺少必填字段' });
    }

    if (action !== 'buy' && action !== 'sell') {
        return res.status(400).json({ error: 'action 必须是 buy 或 sell' });
    }

    // 计算总金额
    const amount = shares * price;

    db.run(
        `INSERT INTO transactions (user_id, symbol, name, action, shares, price, amount, fee, tax, date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, symbol, name, action, shares, price, amount, fee, tax, date, notes],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // 更新持仓
            updatePortfolioAfterTransaction(userId, symbol, name, action, shares, price);

            res.json({
                success: true,
                message: '交易记录已添加',
                transactionId: this.lastID
            });
        }
    );
});

// 删除交易记录
app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { id } = req.params;

    db.run(
        'DELETE FROM transactions WHERE id = ? AND user_id = ?',
        [id, userId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                message: '交易记录已删除',
                changes: this.changes
            });
        }
    );
});

// 交易后更新持仓
async function updatePortfolioAfterTransaction(userId, symbol, name, action, shares, price) {
    try {
        // 查询当前持仓
        const existing = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM portfolio WHERE user_id = ? AND symbol = ?', [userId, symbol], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (action === 'buy') {
            if (existing) {
                // 更新持仓：加权平均成本
                const totalShares = existing.shares + shares;
                const totalCost = (existing.shares * existing.avg_cost) + (shares * price);
                const newAvgCost = totalCost / totalShares;

                db.run(
                    'UPDATE portfolio SET shares = ?, avg_cost = ?, price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [totalShares, newAvgCost, price, existing.id]
                );
            } else {
                // 新建持仓
                db.run(
                    'INSERT INTO portfolio (user_id, symbol, name, market, shares, avg_cost, price) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [userId, symbol, name, 'A股', shares, price, price]
                );
            }
        } else if (action === 'sell') {
            if (existing) {
                const newShares = existing.shares - shares;
                if (newShares <= 0) {
                    // 清仓
                    db.run('DELETE FROM portfolio WHERE id = ?', [existing.id]);
                } else {
                    // 减仓，成本价不变
                    db.run(
                        'UPDATE portfolio SET shares = ?, price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [newShares, price, existing.id]
                    );
                }
            }
        }
    } catch (err) {
        console.error('更新持仓失败:', err);
    }
}

// ============ 收益分析 API ============

// 获取收益分析
app.get('/api/profit/analysis', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;

        // 获取所有交易记录
        const transactions = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // 获取当前持仓
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // 计算收益指标
        const analysis = calculateProfitAnalysis(transactions, portfolio);

        res.json({
            success: true,
            analysis
        });

    } catch (error) {
        console.error('收益分析失败:', error);
        res.status(500).json({ error: '分析失败: ' + error.message });
    }
});

// 计算收益分析
function calculateProfitAnalysis(transactions, portfolio) {
    // 按股票分组统计
    const stockStats = {};

    transactions.forEach(t => {
        if (!stockStats[t.symbol]) {
            stockStats[t.symbol] = {
                symbol: t.symbol,
                name: t.name,
                buyShares: 0,
                buyAmount: 0,
                sellShares: 0,
                sellAmount: 0,
                totalFee: 0,
                totalTax: 0
            };
        }

        const stats = stockStats[t.symbol];
        if (t.action === 'buy') {
            stats.buyShares += t.shares;
            stats.buyAmount += t.amount;
        } else {
            stats.sellShares += t.shares;
            stats.sellAmount += t.amount;
        }
        stats.totalFee += t.fee || 0;
        stats.totalTax += t.tax || 0;
    });

    // 计算每只股票的收益
    const stockProfits = [];
    let totalRealizedProfit = 0; // 已实现收益
    let totalUnrealizedProfit = 0; // 未实现收益
    let totalCost = 0;
    let totalMarketValue = 0;

    // 处理有持仓的股票
    portfolio.forEach(p => {
        const stats = stockStats[p.symbol] || { buyShares: 0, buyAmount: 0, sellShares: 0, sellAmount: 0, totalFee: 0, totalTax: 0 };

        // 当前持仓成本（基于平均成本）
        const currentCost = p.shares * p.avg_cost;
        const marketValue = p.shares * p.price;
        const unrealizedProfit = marketValue - currentCost;

        // 已实现收益（卖出的部分）
        const soldCost = stats.buyAmount * (stats.sellShares / stats.buyShares) || 0;
        const realizedProfit = stats.sellAmount - soldCost - stats.totalFee - stats.totalTax;

        stockProfits.push({
            symbol: p.symbol,
            name: p.name,
            shares: p.shares,
            avgCost: p.avg_cost,
            currentPrice: p.price,
            currentCost: currentCost,
            marketValue: marketValue,
            unrealizedProfit: unrealizedProfit,
            unrealizedProfitRate: currentCost > 0 ? (unrealizedProfit / currentCost * 100) : 0,
            realizedProfit: realizedProfit,
            totalProfit: unrealizedProfit + realizedProfit,
            totalFee: stats.totalFee,
            totalTax: stats.totalTax
        });

        totalUnrealizedProfit += unrealizedProfit;
        totalRealizedProfit += realizedProfit;
        totalCost += currentCost;
        totalMarketValue += marketValue;
    });

    // 处理已清仓的股票
    Object.values(stockStats).forEach(stats => {
        if (stats.sellShares > 0 && !portfolio.find(p => p.symbol === stats.symbol)) {
            const soldCost = stats.buyAmount * (stats.sellShares / stats.buyShares);
            const realizedProfit = stats.sellAmount - soldCost - stats.totalFee - stats.totalTax;

            stockProfits.push({
                symbol: stats.symbol,
                name: stats.name,
                shares: 0,
                avgCost: 0,
                currentPrice: 0,
                currentCost: 0,
                marketValue: 0,
                unrealizedProfit: 0,
                unrealizedProfitRate: 0,
                realizedProfit: realizedProfit,
                totalProfit: realizedProfit,
                totalFee: stats.totalFee,
                totalTax: stats.totalTax,
                isClosed: true
            });

            totalRealizedProfit += realizedProfit;
        }
    });

    // 计算总体指标
    const totalProfit = totalRealizedProfit + totalUnrealizedProfit;
    const totalReturnRate = totalCost > 0 ? (totalProfit / totalCost * 100) : 0;

    return {
        summary: {
            totalCost: totalCost,
            totalMarketValue: totalMarketValue,
            totalProfit: totalProfit,
            totalReturnRate: totalReturnRate,
            realizedProfit: totalRealizedProfit,
            unrealizedProfit: totalUnrealizedProfit,
            stockCount: portfolio.length,
            closedStockCount: stockProfits.filter(s => s.isClosed).length
        },
        stockProfits: stockProfits.sort((a, b) => b.totalProfit - a.totalProfit),
        generatedAt: new Date().toISOString()
    };
}

// ============ 缓存管理 API ============

// 获取缓存统计
app.get('/api/system/cache/stats', authenticateToken, (req, res) => {
    const stats = cacheMiddleware.getCacheStats();
    res.json({
        success: true,
        stats
    });
});

// 清除当前用户缓存
app.post('/api/system/cache/clear', authenticateToken, (req, res) => {
    const userId = req.userId;
    cacheMiddleware.clearUserCache(userId);
    res.json({
        success: true,
        message: '用户缓存已清除'
    });
});

// 清除所有缓存（仅管理员）
app.post('/api/system/cache/clear-all', authenticateToken, (req, res) => {
    // 这里可以添加管理员权限检查
    cacheMiddleware.clearAllCache();
    res.json({
        success: true,
        message: '所有缓存已清除'
    });
});

// ============ AI Agent 工作流 API ============

// 获取工作流模板
app.get('/api/workflows/templates', authenticateToken, (req, res) => {
    try {
        const templates = workflowService.getWorkflowTemplates();
        res.json({
            success: true,
            templates
        });
    } catch (error) {
        console.error('获取工作流模板失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取用户工作流列表
app.get('/api/workflows', authenticateToken, (req, res) => {
    const userId = req.userId;
    
    db.all(
        'SELECT * FROM agent_workflows WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, workflows: rows });
        }
    );
});

// 创建工作流
app.post('/api/workflows', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { name, description, trigger_type, trigger_config, actions } = req.body;
    
    if (!name || !trigger_type || !actions) {
        return res.status(400).json({ error: '缺少必填字段' });
    }
    
    db.run(
        `INSERT INTO agent_workflows (user_id, name, description, trigger_type, trigger_config, actions)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, name, description, trigger_type, JSON.stringify(trigger_config), JSON.stringify(actions)],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                message: '工作流已创建',
                workflowId: this.lastID
            });
        }
    );
});

// 执行工作流
app.post('/api/workflows/:id/execute', authenticateToken, async (req, res) => {
    const userId = req.userId;
    const { id } = req.params;
    
    try {
        // 获取工作流
        const workflow = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM agent_workflows WHERE id = ? AND user_id = ?',
                [id, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!workflow) {
            return res.status(404).json({ error: '工作流不存在' });
        }
        
        // 执行工作流
        const result = await workflowService.executeWorkflow(workflow, db);
        
        res.json({
            success: result.success,
            message: result.success ? '工作流执行完成' : '工作流执行失败',
            result: result.context
        });
        
    } catch (error) {
        console.error('执行工作流失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取工作流日志
app.get('/api/workflows/:id/logs', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { id } = req.params;
    const { limit = 10 } = req.query;
    
    // 先验证工作流属于当前用户
    db.get(
        'SELECT id FROM agent_workflows WHERE id = ? AND user_id = ?',
        [id, userId],
        (err, workflow) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!workflow) {
                return res.status(404).json({ error: '工作流不存在' });
            }
            
            // 获取日志
            db.all(
                'SELECT * FROM workflow_logs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?',
                [id, parseInt(limit)],
                (err, rows) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({ success: true, logs: rows });
                }
            );
        }
    );
});

// 删除工作流
app.delete('/api/workflows/:id', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { id } = req.params;
    
    db.run(
        'DELETE FROM agent_workflows WHERE id = ? AND user_id = ?',
        [id, userId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                message: '工作流已删除',
                changes: this.changes
            });
        }
    );
});

// ============ AI 市场总结 API ============
app.post('/api/ai/market-summary', authenticateToken, async (req, res) => {
    try {
        const { topGainers, topLosers, topSectors, upCount, downCount } = req.body;
        
        // 构建提示词
        const prompt = `请根据以下A股市场数据，生成一段专业的市场总结（100字左右）：

【涨幅榜前5】
${topGainers.map((s, i) => `${i+1}. ${s.name} +${s.change}%`).join('\n')}

【跌幅榜前5】
${topLosers.map((s, i) => `${i+1}. ${s.name} ${s.change}%`).join('\n')}

【热门板块】
${topSectors.map((s, i) => `${i+1}. ${s.name} ${s.change > 0 ? '+' : ''}${s.change}%`).join('\n')}

【市场概况】
上涨家数: ${upCount}，下跌家数: ${downCount}

请从以下角度分析：
1. 市场整体情绪（偏多/偏空/震荡）
2. 热点板块和领涨概念
3. 风险提示或机会提示

用简洁专业的语言，适合投资者快速了解市场概况。`;

        // 调用 Kimi API
        const response = await aiService.chat([
            { role: 'system', content: '你是一位专业的A股市场分析师，擅长用简洁的语言总结市场动态。' },
            { role: 'user', content: prompt }
        ]);
        
        res.json({
            success: true,
            summary: response.content
        });
        
    } catch (error) {
        console.error('AI市场总结失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '生成总结失败',
            message: error.message 
        });
    }
});

// 启动服务器（本地开发时）
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`持仓智投服务已启动: http://localhost:${PORT}`);
        console.log(`API Key 状态: ${process.env.KIMI_API_KEY ? '已配置' : '未配置'}`);
    });
}

// ============ 自我反思 API ============

// 记录投资建议
app.post('/api/reflections/recommendation', authenticateToken, (req, res) => {
    try {
        const { symbol, action, confidence, reasoning, factors } = req.body;
        
        const id = reflectionService.recordRecommendation({
            symbol,
            action,
            confidence,
            reasoning,
            factors,
            userId: req.userId
        });
        
        res.json({ success: true, id });
    } catch (error) {
        console.error('记录建议失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 验证建议结果
app.post('/api/reflections/:id/validate', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const { returnRate, daysHeld, marketCondition } = req.body;
        
        const reflection = reflectionService.validateRecommendation(parseInt(id), {
            returnRate,
            daysHeld,
            marketCondition
        });
        
        res.json({ success: true, reflection });
    } catch (error) {
        console.error('验证建议失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取反思报告
app.get('/api/reflections/report', authenticateToken, (req, res) => {
    try {
        const report = reflectionService.generateReport();
        res.json({ success: true, report });
    } catch (error) {
        console.error('生成报告失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取改进建议
app.get('/api/reflections/improvements', authenticateToken, (req, res) => {
    try {
        const suggestions = reflectionService.getImprovementSuggestions();
        res.json({ success: true, suggestions });
    } catch (error) {
        console.error('获取改进建议失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ 真实市场分析 API ============
const realMarketService = require('./real-market-service');

// 获取股票真实数据和AI分析
app.get('/api/analysis/realtime/:symbol', authenticateToken, async (req, res) => {
    try {
        const { symbol } = req.params;
        
        // 1. 获取真实股票数据
        const stockData = await realMarketService.getStockData(symbol);
        if (!stockData) {
            return res.status(404).json({ error: '无法获取股票数据' });
        }
        
        // 2. 获取相关新闻
        const news = await realMarketService.getStockNews(symbol, stockData.name || symbol);
        
        // 3. 生成AI分析（使用现有aiService）
        const analysis = await realMarketService.generateAIAnalysis(stockData, news, aiService);
        
        res.json({
            success: true,
            data: stockData,
            news,
            analysis
        });
    } catch (error) {
        console.error('获取实时分析失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 批量获取持仓股票分析
app.post('/api/analysis/portfolio', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        
        // 获取用户持仓
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        if (!portfolio || portfolio.length === 0) {
            return res.json({ analyses: [], message: '暂无持仓' });
        }
        
        // 限制分析数量（避免API调用过多）
        const stocksToAnalyze = portfolio.slice(0, 5);
        
        const analyses = [];
        for (const stock of stocksToAnalyze) {
            try {
                const stockData = await realMarketService.getStockData(stock.symbol);
                if (stockData) {
                    analyses.push({
                        symbol: stock.symbol,
                        name: stock.name,
                        data: stockData
                    });
                }
            } catch (e) {
                console.error(`分析 ${stock.symbol} 失败:`, e.message);
            }
        }
        
        res.json({ analyses, total: portfolio.length, analyzed: analyses.length });
    } catch (error) {
        console.error('批量分析失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 导出给 Vercel 使用
module.exports = app;
