/**
 * 新闻监控定时任务 - 定期抓取持仓相关新闻并分析
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const newsService = require('./news-service');

const DB_PATH = '/root/.openclaw/workspace/portfolio-tracker/database/portfolio.db';

/**
 * 执行新闻监控任务
 */
async function runNewsMonitoring() {
    console.log('========================================');
    console.log('开始执行新闻监控任务:', new Date().toISOString());
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
            console.log('没有持仓数据，跳过新闻监控');
            return;
        }
        
        console.log(`共有 ${portfolio.length} 只持仓需要监控新闻\n`);
        
        let totalNews = 0;
        let relevantNews = 0;
        let importantNews = 0;
        
        for (const stock of portfolio) {
            try {
                console.log(`正在获取 ${stock.name} (${stock.symbol}) 的新闻...`);
                
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
                
                // 搜索新闻
                const news = await newsService.searchStockNews(stock.symbol, stock.name);
                console.log(`  找到 ${news.length} 条新闻`);
                
                // 分析每条新闻
                for (const item of news) {
                    const analysis = await newsService.analyzeNewsRelevance(item, metrics);
                    
                    // 保存到数据库
                    await saveNews(db, stock.symbol, item, analysis);
                    
                    totalNews++;
                    if (analysis.isRelevant) relevantNews++;
                    if (analysis.importance === 'high') {
                        importantNews++;
                        console.log(`  ⚠️ 重要新闻: ${item.title.substring(0, 50)}...`);
                    }
                }
                
                // 延迟一下，避免请求过快
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (err) {
                console.error(`  ✗ 获取 ${stock.symbol} 新闻失败:`, err.message);
            }
        }
        
        // 清理旧新闻（保留30天）
        await cleanupOldNews(db);
        
        console.log('\n========================================');
        console.log('新闻监控任务完成');
        console.log('========================================');
        console.log(`  总新闻数: ${totalNews}`);
        console.log(`  相关新闻: ${relevantNews}`);
        console.log(`  重要新闻: ${importantNews}`);
        console.log('========================================');
        
    } catch (error) {
        console.error('新闻监控任务失败:', error.message);
    } finally {
        db.close();
    }
}

/**
 * 保存新闻到数据库
 */
function saveNews(db, symbol, newsItem, analysis) {
    return new Promise((resolve, reject) => {
        // 检查是否已存在
        db.get(
            'SELECT id FROM news WHERE symbol = ? AND title = ?',
            [symbol, newsItem.title],
            (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (row) {
                    // 已存在，更新相关性分析
                    db.run(
                        `UPDATE news SET 
                            relevance_score = ?,
                            sentiment = ?,
                            matched_metrics = ?,
                            is_important = ?
                         WHERE id = ?`,
                        [
                            analysis.relevanceScore || 0,
                            analysis.sentiment,
                            JSON.stringify(analysis.matchedMetrics || []),
                            analysis.importance === 'high' ? 1 : 0,
                            row.id
                        ],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                } else {
                    // 插入新新闻
                    db.run(
                        `INSERT INTO news 
                            (symbol, title, url, summary, source, published_at, 
                             relevance_score, sentiment, matched_metrics, is_important)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            symbol,
                            newsItem.title,
                            newsItem.url,
                            newsItem.summary,
                            newsItem.source,
                            newsItem.publishedAt,
                            analysis.relevanceScore || 0,
                            analysis.sentiment,
                            JSON.stringify(analysis.matchedMetrics || []),
                            analysis.importance === 'high' ? 1 : 0
                        ],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                }
            }
        );
    });
}

/**
 * 清理旧新闻
 */
function cleanupOldNews(db) {
    return new Promise((resolve, reject) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        
        db.run(
            'DELETE FROM news WHERE created_at < ?',
            [cutoffDate.toISOString()],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// 如果直接运行此脚本
if (require.main === module) {
    runNewsMonitoring().then(() => {
        console.log('\n任务完成，退出');
        process.exit(0);
    }).catch(err => {
        console.error('任务失败:', err);
        process.exit(1);
    });
}

module.exports = { runNewsMonitoring };
