const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const aiService = require('./ai-service');
const stockService = require('./stock-service');
const monitoringService = require('./monitoring-service');
const feishuService = require('./feishu-service');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

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
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// ============ API 路由 ============

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 上传持仓截图并识别
app.post('/api/portfolio/upload', upload.array('screenshots', 5), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({ error: '没有上传文件' });
        }

        // 使用第一张图片进行识别
        const portfolio = await aiService.recognizePortfolio(files[0].buffer);

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

// AI 分析持仓
app.post('/api/portfolio/analyze', async (req, res) => {
    try {
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
                
                // 保存到数据库
                saveStockAnalysis(stock.symbol, logicAnalysis);
            } catch (err) {
                console.error(`分析 ${stock.symbol} 失败:`, err.message);
            }
        }

        // 生成监控指标
        const monitoring = generateMonitoringMetrics(stockAnalyses);

        // 保存持仓
        savePortfolio(portfolio);
        saveMonitoringMetrics(monitoring);

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

// 获取持仓列表
app.get('/api/portfolio', (req, res) => {
    db.all('SELECT * FROM portfolio ORDER BY updated_at DESC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ portfolio: rows });
    });
});

// 刷新持仓价格
app.post('/api/portfolio/refresh-prices', async (req, res) => {
    try {
        const result = await stockService.updatePortfolioPrices(db);
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

// 获取监控列表
app.get('/api/monitoring', (req, res) => {
    db.all('SELECT * FROM monitoring WHERE status = ?', ['active'], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ monitoring: rows });
    });
});

// 获取提醒列表
app.get('/api/alerts', (req, res) => {
    const { unreadOnly } = req.query;
    let sql = 'SELECT * FROM alerts';
    const params = [];
    
    if (unreadOnly === 'true') {
        sql += ' WHERE is_read = 0';
    }
    sql += ' ORDER BY created_at DESC';

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ alerts: rows });
    });
});

// 获取标的分析详情
app.get('/api/analysis/:symbol', (req, res) => {
    const { symbol } = req.params;
    
    db.get('SELECT * FROM analysis WHERE symbol = ? ORDER BY created_at DESC LIMIT 1', [symbol], (err, row) => {
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
    });
});

// 手动刷新监控数据
app.post('/api/monitoring/refresh', async (req, res) => {
    try {
        // 获取所有持仓
        db.all('SELECT * FROM portfolio', [], async (err, stocks) => {
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
                                    saveAlert(alert);
                                    newAlerts.push(alert);
                                }
                            }
                            
                            // 保存新分析
                            saveStockAnalysis(stock.symbol, newAnalysis);
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

function savePortfolio(portfolio) {
    portfolio.forEach(stock => {
        db.run(`INSERT INTO portfolio (symbol, name, market, shares, avg_cost, price, currency, year_change)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol) DO UPDATE SET
                shares = excluded.shares, 
                price = excluded.price, 
                year_change = excluded.year_change,
                updated_at = CURRENT_TIMESTAMP`,
            [stock.symbol, stock.name, stock.market, stock.shares, stock.avgCost, stock.price, stock.currency, stock.year_change]);
    });
}

function saveStockAnalysis(symbol, analysis) {
    db.run(`INSERT INTO analysis (symbol, year_change, trend_summary, key_drivers, risk_factors, monitoring_checklist)
            VALUES (?, ?, ?, ?, ?, ?)`,
        [
            symbol,
            analysis.year_change,
            analysis.trend_summary,
            JSON.stringify(analysis.key_drivers),
            JSON.stringify(analysis.risk_factors),
            JSON.stringify(analysis.monitoring_checklist)
        ]);
}

function saveMonitoringMetrics(metrics) {
    metrics.forEach(m => {
        db.run(`INSERT INTO monitoring (symbol, metric_name, metric_type, description, threshold_value)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(symbol, metric_name) DO UPDATE SET
                description = excluded.description,
                threshold_value = excluded.threshold_value`,
            [m.symbol, m.metric, m.type, m.description, m.threshold]);
    });
}

function saveAlert(alert) {
    db.run(`INSERT INTO alerts (symbol, alert_type, priority, title, content)
            VALUES (?, ?, ?, ?, ?)`,
        [alert.symbol, alert.alert_type, alert.priority, alert.title, alert.content]);
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

// 启动服务器（本地开发时）
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`持仓智投服务已启动: http://localhost:${PORT}`);
        console.log(`API Key 状态: ${process.env.KIMI_API_KEY ? '已配置' : '未配置'}`);
    });
}

// 导出给 Vercel 使用
module.exports = app;
