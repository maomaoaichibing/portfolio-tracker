/**
 * API 缓存中间件
 * 缓存热门接口响应，减少数据库查询和外部API调用
 */

// 简单内存缓存
const cache = new Map();

// 缓存配置
const CACHE_CONFIG = {
    // 缓存时间（毫秒）
    ttl: {
        'hot-stocks': 60 * 1000,        // 热门股票 1分钟
        'portfolio': 30 * 1000,         // 持仓 30秒
        'stock-price': 10 * 1000,       // 股价 10秒
        'news': 5 * 60 * 1000,          // 新闻 5分钟
        'analysis': 10 * 60 * 1000,     // 分析 10分钟
        'lenses': 2 * 60 * 1000,        // 镜头分析 2分钟
        'default': 60 * 1000            // 默认 1分钟
    },
    // 最大缓存条目数
    maxSize: 100
};

/**
 * 生成缓存键
 */
function generateCacheKey(req) {
    const url = req.originalUrl || req.url;
    const userId = req.userId || 'anonymous';
    return `${userId}:${url}`;
}

/**
 * 获取缓存TTL
 */
function getTTL(req) {
    const path = req.path;
    if (path.includes('hot-stocks')) return CACHE_CONFIG.ttl['hot-stocks'];
    if (path.includes('portfolio')) return CACHE_CONFIG.ttl['portfolio'];
    if (path.includes('stock') && path.includes('price')) return CACHE_CONFIG.ttl['stock-price'];
    if (path.includes('news')) return CACHE_CONFIG.ttl['news'];
    if (path.includes('analysis')) return CACHE_CONFIG.ttl['analysis'];
    if (path.includes('lenses')) return CACHE_CONFIG.ttl['lenses'];
    return CACHE_CONFIG.ttl['default'];
}

/**
 * 缓存中间件
 */
function cacheMiddleware(req, res, next) {
    // 只缓存GET请求
    if (req.method !== 'GET') {
        return next();
    }

    // 跳过带特定参数的缓存
    if (req.query.noCache === 'true') {
        return next();
    }

    const key = generateCacheKey(req);
    const cached = cache.get(key);

    if (cached && Date.now() - cached.timestamp < cached.ttl) {
        console.log(`[Cache] Hit: ${key}`);
        return res.json(cached.data);
    }

    // 保存原始res.json方法
    const originalJson = res.json.bind(res);

    // 重写res.json以缓存响应
    res.json = function(data) {
        // 只缓存成功的响应
        if (data && data.success !== false) {
            const ttl = getTTL(req);
            cache.set(key, {
                data,
                timestamp: Date.now(),
                ttl
            });
            console.log(`[Cache] Set: ${key}, TTL: ${ttl}ms`);

            // 清理过期缓存
            cleanupCache();
        }
        return originalJson(data);
    };

    next();
}

/**
 * 清理过期缓存
 */
function cleanupCache() {
    if (cache.size <= CACHE_CONFIG.maxSize) return;

    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > value.ttl) {
            cache.delete(key);
            cleaned++;
        }
    }

    // 如果还是太多，删除最旧的
    if (cache.size > CACHE_CONFIG.maxSize) {
        const sorted = Array.from(cache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        const toDelete = sorted.slice(0, cache.size - CACHE_CONFIG.maxSize);
        toDelete.forEach(([key]) => cache.delete(key));
        cleaned += toDelete.length;
    }

    if (cleaned > 0) {
        console.log(`[Cache] Cleaned ${cleaned} entries, remaining: ${cache.size}`);
    }
}

/**
 * 清除特定用户的缓存
 */
function clearUserCache(userId) {
    let cleared = 0;
    for (const key of cache.keys()) {
        if (key.startsWith(`${userId}:`)) {
            cache.delete(key);
            cleared++;
        }
    }
    console.log(`[Cache] Cleared ${cleared} entries for user ${userId}`);
}

/**
 * 清除所有缓存
 */
function clearAllCache() {
    const size = cache.size;
    cache.clear();
    console.log(`[Cache] Cleared all ${size} entries`);
}

/**
 * 获取缓存统计
 */
function getCacheStats() {
    const now = Date.now();
    let valid = 0;
    let expired = 0;

    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp < value.ttl) {
            valid++;
        } else {
            expired++;
        }
    }

    return {
        total: cache.size,
        valid,
        expired,
        maxSize: CACHE_CONFIG.maxSize
    };
}

module.exports = {
    cacheMiddleware,
    clearUserCache,
    clearAllCache,
    getCacheStats
};
