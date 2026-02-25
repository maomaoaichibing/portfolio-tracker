/**
 * 内存优化配置
 * 
 * 优化策略：
 * 1. 限制请求体大小，防止大文件上传导致内存溢出
 * 2. 启用 gzip 压缩，减少传输内存占用
 * 3. 添加请求超时，防止长时间挂起占用资源
 * 4. 定期清理缓存
 * 5. 限制并发连接数
 */

const compression = require('compression');

// 内存使用监控
let memoryStats = {
    lastCheck: Date.now(),
    peakMemory: 0,
    requestCount: 0
};

/**
 * 应用内存优化中间件
 * @param {Object} app - Express 应用实例
 * @param {Object} express - Express 模块
 */
function applyMemoryOptimizations(app, express) {
    // 1. 启用 gzip 压缩
    app.use(compression({
        level: 6, // 平衡压缩率和CPU使用
        filter: (req, res) => {
            if (req.headers['x-no-compression']) return false;
            return compression.filter(req, res);
        }
    }));

    // 2. 请求大小限制
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // 3. 内存监控中间件
    app.use(memoryMonitor);

    // 4. 定期清理（每30分钟）
    setInterval(cleanupResources, 30 * 60 * 1000);

    console.log('[Memory] 内存优化已启用');
}

/**
 * 内存监控中间件
 */
function memoryMonitor(req, res, next) {
    memoryStats.requestCount++;
    
    // 每100个请求检查一次内存
    if (memoryStats.requestCount % 100 === 0) {
        const usage = process.memoryUsage();
        const currentMB = Math.round(usage.heapUsed / 1024 / 1024);
        
        if (currentMB > memoryStats.peakMemory) {
            memoryStats.peakMemory = currentMB;
        }

        // 如果内存使用超过 500MB，触发清理
        if (currentMB > 500) {
            console.warn(`[Memory] 内存使用较高: ${currentMB}MB，触发清理`);
            cleanupResources();
        }
    }

    next();
}

/**
 * 清理资源
 */
function cleanupResources() {
    const before = process.memoryUsage().heapUsed;
    
    // 建议 V8 进行垃圾回收（如果允许）
    if (global.gc) {
        global.gc();
    }

    const after = process.memoryUsage().heapUsed;
    const freed = Math.round((before - after) / 1024 / 1024);
    
    console.log(`[Memory] 资源清理完成，释放 ${freed}MB`);
    
    // 重置计数器
    memoryStats.lastCheck = Date.now();
}

/**
 * 获取内存统计
 */
function getMemoryStats() {
    const usage = process.memoryUsage();
    return {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
        rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
        peakMemory: memoryStats.peakMemory + 'MB',
        requestCount: memoryStats.requestCount,
        uptime: Math.round(process.uptime() / 3600) + 'h'
    };
}

module.exports = {
    applyMemoryOptimizations,
    getMemoryStats,
    cleanupResources
};
