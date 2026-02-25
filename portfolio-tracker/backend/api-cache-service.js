/**
 * API响应缓存服务
 * 减少重复调用，提升性能
 */

class ApiCacheService {
    constructor() {
        this.cache = new Map();
        this.defaultTTL = 5 * 60 * 1000; // 默认5分钟
        
        // 不同API的缓存时间配置
        this.ttlConfig = {
            'stockPrice': 30 * 1000,      // 股价30秒
            'stockHistory': 5 * 60 * 1000, // 历史数据5分钟
            'earnings': 60 * 60 * 1000,    // 财报数据1小时
            'news': 10 * 60 * 1000,        // 新闻10分钟
            'portfolio': 60 * 1000,        // 持仓1分钟
            'analysis': 30 * 60 * 1000     // 分析结果30分钟
        };
    }

    /**
     * 生成缓存key
     */
    generateKey(apiType, params) {
        const paramStr = typeof params === 'object' ? JSON.stringify(params) : String(params);
        return `${apiType}_${paramStr}`;
    }

    /**
     * 获取缓存数据
     */
    get(apiType, params) {
        const key = this.generateKey(apiType, params);
        const cached = this.cache.get(key);
        
        if (!cached) return null;
        
        // 检查是否过期
        const ttl = this.ttlConfig[apiType] || this.defaultTTL;
        if (Date.now() - cached.timestamp > ttl) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    /**
     * 设置缓存数据
     */
    set(apiType, params, data) {
        const key = this.generateKey(apiType, params);
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * 删除缓存
     */
    delete(apiType, params) {
        const key = this.generateKey(apiType, params);
        this.cache.delete(key);
    }

    /**
     * 清空某类型缓存
     */
    clearByType(apiType) {
        for (const [key, value] of this.cache.entries()) {
            if (key.startsWith(`${apiType}_`)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * 清空所有缓存
     */
    clearAll() {
        this.cache.clear();
    }

    /**
     * 获取缓存统计
     */
    getStats() {
        const stats = {
            total: this.cache.size,
            byType: {}
        };
        
        for (const key of this.cache.keys()) {
            const type = key.split('_')[0];
            stats.byType[type] = (stats.byType[type] || 0) + 1;
        }
        
        return stats;
    }

    /**
     * 缓存包装器 - 自动处理缓存逻辑
     */
    async wrap(apiType, params, fetchFn) {
        // 先尝试从缓存获取
        const cached = this.get(apiType, params);
        if (cached !== null) {
            return { ...cached, _cached: true };
        }
        
        // 执行实际请求
        const data = await fetchFn();
        
        // 存入缓存
        this.set(apiType, params, data);
        
        return { ...data, _cached: false };
    }
}

// 单例模式
module.exports = new ApiCacheService();
