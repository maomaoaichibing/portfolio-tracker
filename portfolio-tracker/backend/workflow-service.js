/**
 * AI Agent 工作流服务
 * 自动化投资研究流程：发现 → 分析 → 监控 → 提醒
 */

const aiService = require('./ai-service');
const stockService = require('./stock-service');
const hotStocksService = require('./hot-stocks-service');
const newsService = require('./news-service');

// 工作流动作类型
const ACTION_TYPES = {
    SCAN_SECTOR: 'scan_sector',           // 扫描板块
    FILTER_STOCKS: 'filter_stocks',       // 筛选股票
    ANALYZE_STOCK: 'analyze_stock',       // 分析个股
    CHECK_PRICE: 'check_price',           // 检查价格
    CHECK_NEWS: 'check_news',             // 检查新闻
    GENERATE_REPORT: 'generate_report',   // 生成报告
    SEND_ALERT: 'send_alert',             // 发送提醒
    ADD_TO_WATCHLIST: 'add_to_watchlist'  // 加入自选
};

/**
 * 执行工作流
 * @param {Object} workflow - 工作流配置
 * @param {Object} db - 数据库实例
 */
async function executeWorkflow(workflow, db) {
    console.log(`[Workflow] 开始执行: ${workflow.name} (ID: ${workflow.id})`);
    
    const logId = await createWorkflowLog(db, workflow.id);
    const actions = JSON.parse(workflow.actions);
    const triggerConfig = JSON.parse(workflow.trigger_config || '{}');
    
    let context = {
        workflowId: workflow.id,
        userId: workflow.user_id,
        triggerConfig,
        results: [],
        errors: []
    };
    
    try {
        for (const action of actions) {
            console.log(`[Workflow] 执行动作: ${action.type}`);
            const result = await executeAction(action, context, db);
            context.results.push({
                action: action.type,
                result,
                timestamp: new Date().toISOString()
            });
            
            // 如果动作失败且配置了停止条件
            if (result.error && action.stopOnError) {
                throw new Error(`动作 ${action.type} 失败: ${result.error}`);
            }
        }
        
        await completeWorkflowLog(db, logId, 'success', context);
        await updateWorkflowRun(db, workflow.id, 'success');
        
        console.log(`[Workflow] 执行完成: ${workflow.name}`);
        return { success: true, context };
        
    } catch (error) {
        console.error(`[Workflow] 执行失败: ${error.message}`);
        context.errors.push(error.message);
        await completeWorkflowLog(db, logId, 'failed', context, error.message);
        await updateWorkflowRun(db, workflow.id, 'failed');
        return { success: false, error: error.message, context };
    }
}

/**
 * 执行单个动作
 */
async function executeAction(action, context, db) {
    switch (action.type) {
        case ACTION_TYPES.SCAN_SECTOR:
            return await scanSector(action.config, context);
        
        case ACTION_TYPES.FILTER_STOCKS:
            return await filterStocks(action.config, context);
        
        case ACTION_TYPES.ANALYZE_STOCK:
            return await analyzeStock(action.config, context);
        
        case ACTION_TYPES.CHECK_PRICE:
            return await checkPrice(action.config, context);
        
        case ACTION_TYPES.CHECK_NEWS:
            return await checkNews(action.config, context);
        
        case ACTION_TYPES.GENERATE_REPORT:
            return await generateReport(action.config, context);
        
        case ACTION_TYPES.SEND_ALERT:
            return await sendAlert(action.config, context);
        
        case ACTION_TYPES.ADD_TO_WATCHLIST:
            return await addToWatchlist(action.config, context, db);
        
        default:
            return { error: `未知动作类型: ${action.type}` };
    }
}

/**
 * 扫描板块
 */
async function scanSector(config, context) {
    const { sector, limit = 20 } = config;
    
    try {
        // 获取热门板块或行业股票
        const stocks = await hotStocksService.getGainers('A股', limit);
        
        // 这里可以根据 sector 过滤特定行业的股票
        // 简化处理，返回所有股票
        return {
            stocks: stocks.map(s => ({
                symbol: s.symbol,
                name: s.name,
                price: s.price,
                changePercent: s.changePercent
            }))
        };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * 筛选股票
 */
async function filterStocks(config, context) {
    const { 
        minPe, maxPe, 
        minPb, maxPb,
        minChange, maxChange,
        conditions = []
    } = config;
    
    // 从上一个动作获取股票列表
    const previousResult = context.results[context.results.length - 1];
    if (!previousResult || !previousResult.result.stocks) {
        return { error: '没有可筛选的股票列表' };
    }
    
    let stocks = previousResult.result.stocks;
    
    // 应用筛选条件
    const filtered = stocks.filter(stock => {
        if (minPe && stock.pe < minPe) return false;
        if (maxPe && stock.pe > maxPe) return false;
        if (minChange && stock.changePercent < minChange) return false;
        if (maxChange && stock.changePercent > maxChange) return false;
        return true;
    });
    
    return {
        originalCount: stocks.length,
        filteredCount: filtered.length,
        stocks: filtered
    };
}

/**
 * 分析个股
 */
async function analyzeStock(config, context) {
    const { symbol, name } = config;
    
    try {
        // 使用 AI 分析股票
        const analysis = await aiService.analyzeStockLogic(symbol, name);
        
        return {
            symbol,
            name,
            analysis: {
                trendSummary: analysis.trend_summary,
                keyDrivers: analysis.key_drivers,
                riskFactors: analysis.risk_factors,
                yearChange: analysis.year_change
            }
        };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * 检查价格
 */
async function checkPrice(config, context) {
    const { symbol, threshold, condition } = config;
    
    try {
        const stockData = await stockService.getStockPrice(symbol);
        if (!stockData) {
            return { error: '无法获取股票价格' };
        }
        
        const price = stockData.price;
        let triggered = false;
        
        if (condition === 'above' && price > threshold) triggered = true;
        if (condition === 'below' && price < threshold) triggered = true;
        
        return {
            symbol,
            price,
            threshold,
            condition,
            triggered
        };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * 检查新闻
 */
async function checkNews(config, context) {
    const { symbol, name, keywords = [] } = config;
    
    try {
        const news = await newsService.searchStockNews(symbol, name);
        
        // 筛选包含关键词的新闻
        const relevantNews = keywords.length > 0 
            ? news.filter(n => keywords.some(k => n.title.includes(k) || n.summary.includes(k)))
            : news;
        
        return {
            symbol,
            totalNews: news.length,
            relevantNews: relevantNews.length,
            news: relevantNews.slice(0, 5) // 返回前5条
        };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * 生成报告
 */
async function generateReport(config, context) {
    const { title, template } = config;
    
    // 汇总所有动作的结果
    const summary = context.results.map(r => ({
        action: r.action,
        result: r.result
    }));
    
    const report = {
        title: title || '工作流执行报告',
        generatedAt: new Date().toISOString(),
        workflowId: context.workflowId,
        summary,
        recommendations: generateRecommendations(summary)
    };
    
    return { report };
}

/**
 * 生成建议
 */
function generateRecommendations(results) {
    const recommendations = [];
    
    // 基于结果生成建议
    const analysisResult = results.find(r => r.action === ACTION_TYPES.ANALYZE_STOCK);
    if (analysisResult && analysisResult.result.analysis) {
        const { yearChange } = analysisResult.result.analysis;
        if (yearChange > 20) {
            recommendations.push('股票年内涨幅较大，建议关注回调风险');
        } else if (yearChange < -20) {
            recommendations.push('股票年内跌幅较大，可能存在反弹机会');
        }
    }
    
    const priceResult = results.find(r => r.action === ACTION_TYPES.CHECK_PRICE);
    if (priceResult && priceResult.result.triggered) {
        recommendations.push(`价格触发条件：${priceResult.result.condition} ${priceResult.result.threshold}`);
    }
    
    return recommendations;
}

/**
 * 发送提醒
 */
async function sendAlert(config, context) {
    const { message, channels = ['web'] } = config;
    
    // 构建提醒内容
    const alertContent = message || buildDefaultAlert(context);
    
    // 这里可以集成飞书、微信等推送
    console.log(`[Alert] ${alertContent}`);
    
    return {
        sent: true,
        content: alertContent,
        channels
    };
}

/**
 * 构建默认提醒内容
 */
function buildDefaultAlert(context) {
    const results = context.results;
    const stockResult = results.find(r => r.action === ACTION_TYPES.ANALYZE_STOCK);
    
    if (stockResult) {
        const { symbol, name, analysis } = stockResult.result;
        return `工作流发现：${name}(${symbol}) - ${analysis?.trendSummary || '分析完成'}`;
    }
    
    return '工作流执行完成';
}

/**
 * 加入自选
 */
async function addToWatchlist(config, context, db) {
    const { symbol, name, notes = '' } = config;
    
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR REPLACE INTO watchlist (user_id, symbol, name, notes) VALUES (?, ?, ?, ?)',
            [context.userId, symbol, name, notes],
            function(err) {
                if (err) {
                    resolve({ error: err.message });
                } else {
                    resolve({ 
                        added: true, 
                        symbol, 
                        name,
                        id: this.lastID 
                    });
                }
            }
        );
    });
}

/**
 * 创建工作流日志
 */
async function createWorkflowLog(db, workflowId) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO workflow_logs (workflow_id, status, started_at) VALUES (?, ?, ?)',
            [workflowId, 'running', new Date().toISOString()],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

/**
 * 完成工作流日志
 */
async function completeWorkflowLog(db, logId, status, context, errorMessage = null) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE workflow_logs SET status = ?, output_data = ?, error_message = ?, completed_at = ? WHERE id = ?',
            [status, JSON.stringify(context), errorMessage, new Date().toISOString(), logId],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

/**
 * 更新工作流运行状态
 */
async function updateWorkflowRun(db, workflowId, status) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE agent_workflows SET 
                last_run_at = ?, 
                run_count = run_count + 1,
                updated_at = ?
             WHERE id = ?`,
            [new Date().toISOString(), new Date().toISOString(), workflowId],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

/**
 * 获取预设工作流模板
 */
function getWorkflowTemplates() {
    return [
        {
            id: 'value_hunter',
            name: '价值发现者',
            description: '自动扫描低估值股票，分析基本面，生成投资建议',
            trigger_type: 'schedule',
            trigger_config: { cron: '0 9 * * 1-5' }, // 工作日早上9点
            actions: [
                { type: ACTION_TYPES.SCAN_SECTOR, config: { sector: 'all', limit: 50 } },
                { type: ACTION_TYPES.FILTER_STOCKS, config: { maxPe: 15, maxPb: 2 } },
                { type: ACTION_TYPES.ANALYZE_STOCK, config: {} },
                { type: ACTION_TYPES.GENERATE_REPORT, config: { title: '价值发现报告' } },
                { type: ACTION_TYPES.SEND_ALERT, config: { channels: ['web'] } }
            ]
        },
        {
            id: 'momentum_tracker',
            name: '动量追踪者',
            description: '追踪强势股，发现趋势机会',
            trigger_type: 'schedule',
            trigger_config: { cron: '0 15 * * 1-5' }, // 工作日下午3点
            actions: [
                { type: ACTION_TYPES.SCAN_SECTOR, config: { sector: 'all', limit: 30 } },
                { type: ACTION_TYPES.FILTER_STOCKS, config: { minChange: 5 } },
                { type: ACTION_TYPES.CHECK_NEWS, config: { keywords: ['利好', '增长'] } },
                { type: ACTION_TYPES.GENERATE_REPORT, config: { title: '动量追踪报告' } },
                { type: ACTION_TYPES.SEND_ALERT, config: { channels: ['web'] } }
            ]
        },
        {
            id: 'price_watcher',
            name: '价格守望者',
            description: '监控特定股票价格，触发条件时提醒',
            trigger_type: 'schedule',
            trigger_config: { interval: '30m' }, // 每30分钟
            actions: [
                { type: ACTION_TYPES.CHECK_PRICE, config: { symbol: '', threshold: 0, condition: 'below' } },
                { type: ACTION_TYPES.SEND_ALERT, config: { channels: ['web'] } }
            ]
        }
    ];
}

module.exports = {
    executeWorkflow,
    getWorkflowTemplates,
    ACTION_TYPES
};
