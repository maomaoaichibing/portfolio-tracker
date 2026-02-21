/**
 * 监控提醒服务 - 定时检查持仓并发送提醒
 */

const stockService = require('./stock-service');
const aiService = require('./ai-service');

/**
 * 检查所有监控指标
 * @param {Object} db - SQLite 数据库实例
 * @returns {Promise<Array>} 触发的提醒列表
 */
async function checkMonitoringMetrics(db) {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT m.*, p.name as stock_name, p.price as current_price, p.symbol
            FROM monitoring m
            JOIN portfolio p ON m.symbol = p.symbol
            WHERE m.status = 'active'
        `, [], async (err, metrics) => {
            if (err) return reject(err);
            
            const alerts = [];
            
            for (const metric of metrics) {
                try {
                    const triggered = await evaluateMetric(metric);
                    if (triggered) {
                        alerts.push({
                            symbol: metric.symbol,
                            stockName: metric.stock_name,
                            metricName: metric.metric_name,
                            metricType: metric.metric_type,
                            currentValue: metric.current_value,
                            thresholdValue: metric.threshold_value,
                            description: metric.description
                        });
                        
                        // 保存提醒到数据库
                        saveAlert(db, {
                            symbol: metric.symbol,
                            alert_type: 'metric_triggered',
                            priority: 'medium',
                            title: `${metric.stock_name} ${metric.metric_name}触发提醒`,
                            content: `当前值: ${metric.current_value}, 阈值: ${metric.threshold_value}`
                        });
                    }
                } catch (err) {
                    console.error(`检查指标 ${metric.metric_name} 失败:`, err.message);
                }
            }
            
            resolve(alerts);
        });
    });
}

/**
 * 评估单个监控指标
 */
async function evaluateMetric(metric) {
    // 根据指标类型进行评估
    switch (metric.metric_type) {
        case 'price_change':
            // 价格变动百分比
            const changePercent = parseFloat(metric.current_value);
            const threshold = parseFloat(metric.threshold_value);
            return Math.abs(changePercent) >= Math.abs(threshold);
            
        case 'price_above':
            return parseFloat(metric.current_value) >= parseFloat(metric.threshold_value);
            
        case 'price_below':
            return parseFloat(metric.current_value) <= parseFloat(metric.threshold_value);
            
        case 'pe_ratio':
            // PE 估值
            const pe = parseFloat(metric.current_value);
            const peThreshold = parseFloat(metric.threshold_value);
            return pe >= peThreshold;
            
        default:
            return false;
    }
}

/**
 * 检查投资逻辑变化
 * @param {Object} db - SQLite 数据库实例
 * @param {string} symbol - 股票代码
 */
async function checkLogicChange(db, symbol) {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT * FROM analysis 
            WHERE symbol = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `, [symbol], async (err, lastAnalysis) => {
            if (err) return reject(err);
            if (!lastAnalysis) return resolve(null);
            
            try {
                // 获取最新分析
                const stockInfo = await getStockInfo(db, symbol);
                if (!stockInfo) return resolve(null);
                
                const newAnalysis = await aiService.analyzeStockLogic(symbol, stockInfo.name);
                
                // 对比分析结果
                const changes = detectChanges(lastAnalysis, newAnalysis);
                
                if (changes.hasSignificantChange) {
                    const alert = {
                        symbol,
                        alert_type: 'logic_change',
                        priority: changes.changeLevel === 'high' ? 'high' : 'medium',
                        title: `${stockInfo.name} 投资逻辑发生变化`,
                        content: changes.summary
                    };
                    
                    saveAlert(db, alert);
                    resolve(alert);
                } else {
                    resolve(null);
                }
            } catch (err) {
                console.error(`检查逻辑变化失败 ${symbol}:`, err.message);
                resolve(null);
            }
        });
    });
}

/**
 * 检测分析结果变化
 */
function detectChanges(oldAnalysis, newAnalysis) {
    const changes = {
        hasSignificantChange: false,
        changeLevel: 'low',
        summary: '',
        details: []
    };
    
    // 检查涨跌幅变化
    const oldChange = oldAnalysis.year_change || 0;
    const newChange = newAnalysis.year_change || 0;
    const changeDiff = Math.abs(newChange - oldChange);
    
    if (changeDiff > 20) {
        changes.hasSignificantChange = true;
        changes.changeLevel = 'high';
        changes.details.push(`年内涨跌幅变化 ${changeDiff.toFixed(2)}%`);
    } else if (changeDiff > 10) {
        changes.hasSignificantChange = true;
        changes.changeLevel = 'medium';
        changes.details.push(`年内涨跌幅变化 ${changeDiff.toFixed(2)}%`);
    }
    
    // 检查驱动因素变化
    const oldDrivers = JSON.parse(oldAnalysis.key_drivers || '[]');
    const newDrivers = newAnalysis.key_drivers || [];
    
    // 对比关键驱动因素
    const oldFactors = oldDrivers.map(d => d.factor).sort();
    const newFactors = newDrivers.map(d => d.factor).sort();
    
    if (JSON.stringify(oldFactors) !== JSON.stringify(newFactors)) {
        changes.hasSignificantChange = true;
        changes.details.push('核心驱动因素发生变化');
    }
    
    if (changes.details.length > 0) {
        changes.summary = changes.details.join('；');
    }
    
    return changes;
}

/**
 * 获取股票信息
 */
function getStockInfo(db, symbol) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM portfolio WHERE symbol = ?', [symbol], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

/**
 * 保存提醒
 */
function saveAlert(db, alert) {
    db.run(`
        INSERT INTO alerts (symbol, alert_type, priority, title, content)
        VALUES (?, ?, ?, ?, ?)
    `, [alert.symbol, alert.alert_type, alert.priority, alert.title, alert.content], (err) => {
        if (err) console.error('保存提醒失败:', err.message);
    });
}

/**
 * 获取未读提醒
 */
function getUnreadAlerts(db, limit = 10) {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM alerts 
            WHERE is_read = 0 
            ORDER BY created_at DESC 
            LIMIT ?
        `, [limit], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

/**
 * 标记提醒为已读
 */
function markAlertAsRead(db, alertId) {
    return new Promise((resolve, reject) => {
        db.run('UPDATE alerts SET is_read = 1 WHERE id = ?', [alertId], (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

/**
 * 生成监控报告
 */
async function generateMonitoringReport(db) {
    const alerts = await getUnreadAlerts(db, 50);
    const portfolio = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM portfolio', [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
    
    return {
        totalAlerts: alerts.length,
        highPriorityAlerts: alerts.filter(a => a.priority === 'high').length,
        portfolioCount: portfolio.length,
        latestAlerts: alerts.slice(0, 5),
        generatedAt: new Date().toISOString()
    };
}

module.exports = {
    checkMonitoringMetrics,
    checkLogicChange,
    getUnreadAlerts,
    markAlertAsRead,
    generateMonitoringReport,
    saveAlert
};
