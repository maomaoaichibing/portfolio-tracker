/**
 * 定时监控任务 - 每日检查持仓并生成报告
 * 
 * 这个脚本可以被 cron 调用，执行以下任务：
 * 1. 更新所有持仓的最新价格
 * 2. 检查监控指标是否触发
 * 3. 检查投资逻辑是否发生变化
 * 4. 生成监控报告
 * 5. 发送飞书推送（如配置了 webhook）
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const stockService = require('./stock-service');
const monitoringService = require('./monitoring-service');
const feishuService = require('./feishu-service');

const DB_PATH = path.join(__dirname, '..', 'database', 'portfolio.db');

async function runDailyMonitoring() {
    console.log('========================================');
    console.log('开始执行每日监控任务:', new Date().toISOString());
    console.log('========================================\n');
    
    const db = new sqlite3.Database(DB_PATH);
    
    try {
        // 1. 获取所有持仓
        const portfolio = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM portfolio', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        if (portfolio.length === 0) {
            console.log('没有持仓数据，跳过监控');
            return;
        }
        
        console.log(`共有 ${portfolio.length} 只持仓:\n`);
        portfolio.forEach(p => {
            console.log(`  - ${p.name} (${p.symbol}): ${p.shares}股 @ ${p.price}`);
        });
        console.log();
        
        // 2. 更新所有持仓价格
        console.log('正在更新股价...');
        const priceUpdate = await stockService.updatePortfolioPrices(db);
        console.log(`✓ 已更新 ${priceUpdate.updated}/${priceUpdate.total} 只股票价格\n`);
        
        // 3. 检查监控指标
        console.log('正在检查监控指标...');
        const metricAlerts = await monitoringService.checkMonitoringMetrics(db);
        console.log(`✓ 监控指标检查完成，触发 ${metricAlerts.length} 条提醒\n`);
        
        // 4. 检查每只股票的逻辑变化
        console.log('正在检查投资逻辑变化...');
        const logicAlerts = [];
        for (const stock of portfolio) {
            try {
                const alert = await monitoringService.checkLogicChange(db, stock.symbol);
                if (alert) {
                    logicAlerts.push(alert);
                    console.log(`  ! ${stock.name} 逻辑发生变化`);
                }
            } catch (err) {
                console.error(`  ✗ 检查 ${stock.symbol} 失败:`, err.message);
            }
        }
        console.log(`✓ 逻辑变化检查完成，发现 ${logicAlerts.length} 条变化\n`);
        
        // 5. 生成监控报告
        console.log('正在生成监控报告...');
        const report = await monitoringService.generateMonitoringReport(db);
        console.log('✓ 报告生成完成\n');
        
        // 6. 发送飞书推送
        console.log('正在发送飞书通知...');
        const feishuResult = await sendFeishuNotification(report, metricAlerts, logicAlerts, portfolio);
        if (feishuResult.success) {
            console.log('✓ 飞书通知发送成功\n');
        } else {
            console.log('○ 飞书通知:', feishuResult.error || '未发送\n');
        }
        
        // 输出总结
        console.log('========================================');
        console.log('监控任务执行完成');
        console.log('========================================');
        console.log(`  持仓数量: ${portfolio.length}`);
        console.log(`  价格更新: ${priceUpdate.updated}/${priceUpdate.total}`);
        console.log(`  指标提醒: ${metricAlerts.length}`);
        console.log(`  逻辑变化: ${logicAlerts.length}`);
        console.log(`  总提醒数: ${report.totalAlerts}`);
        console.log(`  高优先级: ${report.highPriorityAlerts}`);
        console.log('========================================');
        
    } catch (error) {
        console.error('监控任务执行失败:', error.message);
        console.error(error.stack);
    } finally {
        db.close();
    }
}

/**
 * 发送飞书通知
 */
async function sendFeishuNotification(report, metricAlerts, logicAlerts, portfolio) {
    try {
        // 构建文本消息
        let message = `📊 持仓智投 - 每日监控报告\n\n`;
        message += `监控时间: ${new Date().toLocaleString('zh-CN')}\n`;
        message += `持仓数量: ${report.portfolioCount} 只\n`;
        message += `总提醒数: ${report.totalAlerts} 条\n\n`;
        
        // 添加持仓明细
        if (portfolio.length > 0) {
            message += `📈 持仓明细:\n`;
            portfolio.forEach(p => {
                message += `• ${p.name} (${p.symbol}): ${p.shares}股 @ ¥${p.price}\n`;
            });
            message += `\n`;
        }
        
        // 添加指标提醒
        if (metricAlerts.length > 0) {
            message += `⚠️ 指标提醒 (${metricAlerts.length}):\n`;
            metricAlerts.slice(0, 5).forEach(alert => {
                message += `• ${alert.stockName}: ${alert.metricName} 触发 (${alert.currentValue})\n`;
            });
            message += `\n`;
        }
        
        // 添加逻辑变化
        if (logicAlerts.length > 0) {
            message += `🔔 逻辑变化 (${logicAlerts.length}):\n`;
            logicAlerts.slice(0, 5).forEach(alert => {
                message += `• ${alert.title}\n  ${alert.content}\n`;
            });
        }
        
        return await feishuService.sendTextMessage(message);
    } catch (error) {
        console.error('发送飞书通知失败:', error.message);
        return { success: false, error: error.message };
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    runDailyMonitoring().then(() => {
        console.log('\n任务完成，退出');
        process.exit(0);
    }).catch(err => {
        console.error('任务失败:', err);
        process.exit(1);
    });
}

module.exports = { runDailyMonitoring };
