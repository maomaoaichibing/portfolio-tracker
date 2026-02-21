/**
 * 飞书推送服务 - 发送持仓提醒到飞书
 */

const axios = require('axios');

// 飞书 webhook 地址（需要在环境变量中配置）
const FEISHU_WEBHOOK = process.env.FEISHU_WEBHOOK || '';

/**
 * 发送文本消息到飞书
 * @param {string} content - 消息内容
 */
async function sendTextMessage(content) {
    if (!FEISHU_WEBHOOK) {
        console.log('[飞书] 未配置 webhook，跳过发送');
        console.log('[飞书] 消息内容:', content);
        return { success: false, error: '未配置 webhook' };
    }

    try {
        const response = await axios.post(FEISHU_WEBHOOK, {
            msg_type: 'text',
            content: {
                text: content
            }
        }, {
            timeout: 10000
        });

        if (response.data.code === 0) {
            console.log('[飞书] 消息发送成功');
            return { success: true };
        } else {
            console.error('[飞书] 发送失败:', response.data.msg);
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[飞书] 发送错误:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * 发送富文本消息到飞书
 * @param {Object} data - 消息数据
 */
async function sendRichMessage(data) {
    if (!FEISHU_WEBHOOK) {
        console.log('[飞书] 未配置 webhook，跳过发送');
        return { success: false, error: '未配置 webhook' };
    }

    try {
        const response = await axios.post(FEISHU_WEBHOOK, {
            msg_type: 'post',
            content: {
                post: {
                    zh_cn: data
                }
            }
        }, {
            timeout: 10000
        });

        if (response.data.code === 0) {
            console.log('[飞书] 富文本消息发送成功');
            return { success: true };
        } else {
            console.error('[飞书] 发送失败:', response.data.msg);
            return { success: false, error: response.data.msg };
        }
    } catch (error) {
        console.error('[飞书] 发送错误:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * 发送持仓变动提醒
 * @param {Array} alerts - 提醒列表
 */
async function sendPortfolioAlerts(alerts) {
    if (!alerts || alerts.length === 0) {
        return { success: true, message: '无提醒需要发送' };
    }

    const content = alerts.map(alert => {
        const emoji = alert.priority === 'high' ? '🔴' : alert.priority === 'medium' ? '🟡' : '🟢';
        return `${emoji} ${alert.title}\n   ${alert.content}`;
    }).join('\n\n');

    const message = `📊 持仓监控提醒\n\n${content}\n\n⏰ ${new Date().toLocaleString('zh-CN')}`;

    return await sendTextMessage(message);
}

/**
 * 发送每日持仓报告
 * @param {Object} report - 报告数据
 */
async function sendDailyReport(report) {
    const { portfolio, totalValue, todayPnL, alerts } = report;

    const pnlEmoji = todayPnL >= 0 ? '📈' : '📉';
    const pnlText = todayPnL >= 0 ? `+${todayPnL.toFixed(2)}` : todayPnL.toFixed(2);

    const content = {
        title: '📊 每日持仓报告',
        content: [
            [
                { tag: 'text', text: `总市值: ¥${totalValue.toFixed(2)}\n` },
                { tag: 'text', text: `${pnlEmoji} 今日盈亏: ${pnlText}\n\n` }
            ],
            [
                { tag: 'text', text: '持仓明细:\n', style: { bold: true } }
            ],
            ...portfolio.map(stock => [
                { tag: 'text', text: `• ${stock.name} (${stock.symbol}): ` },
                { tag: 'text', text: `¥${stock.price}`, style: { bold: true } },
                { tag: 'text', text: ` ${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent}%\n` }
            ]),
            [
                { tag: 'text', text: `\n⚠️ 提醒: ${alerts.length} 条待处理`, style: { bold: true } }
            ]
        ]
    };

    return await sendRichMessage(content);
}

/**
 * 发送价格预警
 * @param {string} symbol - 股票代码
 * @param {string} name - 股票名称
 * @param {number} currentPrice - 当前价格
 * @param {number} targetPrice - 目标价格
 * @param {string} type - 预警类型 (above/below)
 */
async function sendPriceAlert(symbol, name, currentPrice, targetPrice, type) {
    const emoji = type === 'above' ? '🚀' : '⚠️';
    const action = type === 'above' ? '突破' : '跌破';

    const message = `${emoji} 价格预警\n\n${name} (${symbol}) ${action}目标价！\n\n当前价格: ¥${currentPrice.toFixed(2)}\n目标价格: ¥${targetPrice.toFixed(2)}\n\n⏰ ${new Date().toLocaleString('zh-CN')}`;

    return await sendTextMessage(message);
}

module.exports = {
    sendTextMessage,
    sendRichMessage,
    sendPortfolioAlerts,
    sendDailyReport,
    sendPriceAlert,
    FEISHU_WEBHOOK
};
