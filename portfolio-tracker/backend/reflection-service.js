/**
 * 自我反思服务 - 实现投资建议的自我评估和改进
 * 设计模式来自 OpenClaw Skills: self-improvement, evolver
 */

const fs = require('fs');
const path = require('path');

const REFLECTION_DB = path.join(__dirname, '..', 'database', 'reflections.db');

class ReflectionService {
    constructor() {
        this.reflections = this.loadReflections();
    }

    /**
     * 加载历史反思记录
     */
    loadReflections() {
        try {
            if (fs.existsSync(REFLECTION_DB)) {
                return JSON.parse(fs.readFileSync(REFLECTION_DB, 'utf8'));
            }
        } catch (e) {
            console.error('[Reflection] 加载失败:', e);
        }
        return [];
    }

    /**
     * 保存反思记录
     */
    saveReflections() {
        try {
            fs.writeFileSync(REFLECTION_DB, JSON.stringify(this.reflections, null, 2));
        } catch (e) {
            console.error('[Reflection] 保存失败:', e);
        }
    }

    /**
     * 记录投资建议
     * @param {Object} recommendation - 建议详情
     * @param {string} recommendation.symbol - 股票代码
     * @param {string} recommendation.action - 建议动作 (buy/sell/hold)
     * @param {number} recommendation.confidence - 信心度 0-100
     * @param {string} recommendation.reasoning - 推理过程
     * @param {Array} recommendation.factors - 考虑的因素
     */
    recordRecommendation(recommendation) {
        const record = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            ...recommendation,
            status: 'pending', // pending, validated, failed
            actualOutcome: null, // 实际结果
            reflection: null // 反思分析
        };
        
        this.reflections.push(record);
        this.saveReflections();
        
        console.log(`[Reflection] 记录建议: ${recommendation.symbol} ${recommendation.action}`);
        return record.id;
    }

    /**
     * 验证建议结果（定期执行）
     * @param {number} recommendationId - 建议ID
     * @param {Object} outcome - 实际结果
     * @param {number} outcome.returnRate - 收益率
     * @param {number} outcome.daysHeld - 持有天数
     * @param {string} outcome.marketCondition - 市场状况
     */
    validateRecommendation(recommendationId, outcome) {
        const record = this.reflections.find(r => r.id === recommendationId);
        if (!record) return null;

        record.status = outcome.returnRate > 0 ? 'validated' : 'failed';
        record.actualOutcome = outcome;
        
        // 自动生成反思
        record.reflection = this.generateReflection(record, outcome);
        
        this.saveReflections();
        
        console.log(`[Reflection] 验证建议 ${recommendationId}: ${record.status}`);
        return record.reflection;
    }

    /**
     * 生成反思分析
     */
    generateReflection(record, outcome) {
        const reflections = [];
        
        // 1. 分析准确性
        if (record.action === 'buy' && outcome.returnRate > 0) {
            reflections.push({
                type: 'success',
                point: '买入建议正确，股价上涨',
                factor: record.factors?.find(f => f.includes('资金流入') || f.includes('业绩'))
            });
        } else if (record.action === 'buy' && outcome.returnRate < 0) {
            reflections.push({
                type: 'failure',
                point: '买入建议错误，股价下跌',
                lesson: '可能忽略了市场风险或宏观因素'
            });
        }
        
        // 2. 分析信心度
        if (record.confidence > 80 && outcome.returnRate < 0) {
            reflections.push({
                type: 'warning',
                point: '高信心度建议失败',
                lesson: '需要调整信心度计算模型，避免过度自信'
            });
        }
        
        // 3. 分析持有期
        if (outcome.daysHeld < 3 && Math.abs(outcome.returnRate) > 5) {
            reflections.push({
                type: 'insight',
                point: '短期波动较大',
                lesson: '建议延长观察期，避免短期噪音干扰'
            });
        }
        
        return {
            summary: `${record.action} 建议${record.status === 'validated' ? '成功' : '失败'}，收益率 ${outcome.returnRate.toFixed(2)}%`,
            details: reflections,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 获取改进建议（基于历史反思）
     */
    getImprovementSuggestions() {
        const suggestions = [];
        
        // 分析失败模式
        const failures = this.reflections.filter(r => r.status === 'failed');
        if (failures.length > 0) {
            const commonFactors = this.analyzeCommonFactors(failures);
            if (commonFactors.length > 0) {
                suggestions.push({
                    area: 'factor_weighting',
                    issue: `这些因素经常导致失败: ${commonFactors.join(', ')}`,
                    action: '降低这些因素在决策中的权重，或增加验证条件'
                });
            }
        }
        
        // 分析信心度偏差
        const highConfidenceFailures = this.reflections.filter(
            r => r.confidence > 80 && r.status === 'failed'
        );
        if (highConfidenceFailures.length > 3) {
            suggestions.push({
                area: 'confidence_calibration',
                issue: '高信心度建议失败率较高',
                action: '重新校准信心度计算模型，引入更多不确定性指标'
            });
        }
        
        // 分析时间因素
        const shortTerm = this.reflections.filter(r => 
            r.actualOutcome?.daysHeld < 3
        );
        const shortTermAccuracy = shortTerm.filter(r => r.status === 'validated').length / shortTerm.length;
        if (shortTermAccuracy < 0.5) {
            suggestions.push({
                area: 'time_horizon',
                issue: '短期建议准确率较低',
                action: '延长建议验证期，关注中期趋势而非短期波动'
            });
        }
        
        return suggestions;
    }

    /**
     * 分析常见失败因素
     */
    analyzeCommonFactors(records) {
        const factorCounts = {};
        records.forEach(r => {
            r.factors?.forEach(f => {
                factorCounts[f] = (factorCounts[f] || 0) + 1;
            });
        });
        
        return Object.entries(factorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([factor]) => factor);
    }

    /**
     * 生成反思报告
     */
    generateReport() {
        const total = this.reflections.length;
        const validated = this.reflections.filter(r => r.status === 'validated').length;
        const failed = this.reflections.filter(r => r.status === 'failed').length;
        const pending = this.reflections.filter(r => r.status === 'pending').length;
        
        const accuracy = total > 0 ? (validated / (validated + failed) * 100).toFixed(1) : 0;
        
        return {
            summary: {
                total,
                validated,
                failed,
                pending,
                accuracy: `${accuracy}%`
            },
            improvements: this.getImprovementSuggestions(),
            recentReflections: this.reflections.slice(-5).map(r => ({
                symbol: r.symbol,
                action: r.action,
                status: r.status,
                reflection: r.reflection?.summary
            }))
        };
    }

    /**
     * 应用到投资建议（整合到现有流程）
     */
    enhanceRecommendation(symbol, baseRecommendation) {
        // 1. 检查历史表现
        const history = this.reflections.filter(r => r.symbol === symbol);
        const successRate = history.filter(r => r.status === 'validated').length / history.length;
        
        // 2. 应用改进建议
        const suggestions = this.getImprovementSuggestions();
        
        // 3. 调整信心度
        let adjustedConfidence = baseRecommendation.confidence;
        if (successRate < 0.5 && history.length > 2) {
            adjustedConfidence *= 0.8; // 历史表现差，降低信心度
        }
        
        // 4. 添加反思提示
        const reflectionHints = suggestions
            .filter(s => baseRecommendation.factors?.some(f => s.issue.includes(f)))
            .map(s => s.action);
        
        return {
            ...baseRecommendation,
            confidence: Math.round(adjustedConfidence),
            reflectionHints,
            historicalAccuracy: history.length > 0 ? `${(successRate * 100).toFixed(1)}%` : '无历史数据'
        };
    }
}

module.exports = new ReflectionService();
