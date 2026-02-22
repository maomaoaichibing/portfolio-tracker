/**
 * 小程序适配路由 - 微信登录和专用 API
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');

// 微信小程序配置
const WX_APPID = process.env.WX_APPID || '';
const WX_SECRET = process.env.WX_SECRET || '';

/**
 * 微信登录
 * POST /api/wx/auth/login
 */
router.post('/auth/login', async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: '缺少 code 参数' });
        }
        
        // 调用微信接口获取 openid 和 session_key
        const wxResponse = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
            params: {
                appid: WX_APPID,
                secret: WX_SECRET,
                js_code: code,
                grant_type: 'authorization_code'
            }
        });
        
        const { openid, session_key, unionid } = wxResponse.data;
        
        if (!openid) {
            return res.status(400).json({ 
                error: '微信登录失败',
                wxError: wxResponse.data 
            });
        }
        
        // 查找或创建用户
        const user = await findOrCreateUser(openid, unionid);
        
        // 生成 JWT token
        const token = generateToken(user);
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                openid: user.openid,
                nickname: user.nickname,
                avatar: user.avatar
            }
        });
        
    } catch (error) {
        console.error('微信登录失败:', error.message);
        res.status(500).json({ error: '登录失败: ' + error.message });
    }
});

/**
 * 更新用户信息
 * PUT /api/wx/auth/user-info
 */
router.put('/auth/user-info', authenticateToken, async (req, res) => {
    try {
        const { nickname, avatar } = req.body;
        const userId = req.user.id;
        
        // 更新用户信息
        await updateUserInfo(userId, { nickname, avatar });
        
        res.json({
            success: true,
            message: '用户信息已更新'
        });
        
    } catch (error) {
        console.error('更新用户信息失败:', error.message);
        res.status(500).json({ error: '更新失败: ' + error.message });
    }
});

/**
 * 验证 token
 * GET /api/wx/auth/validate
 */
router.get('/auth/validate', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

/**
 * 小程序专用 - 获取简化版持仓列表
 * GET /api/wx/portfolio
 */
router.get('/portfolio', authenticateToken, (req, res) => {
    const db = req.app.locals.db;
    
    db.all(
        'SELECT * FROM portfolio WHERE user_id = ? ORDER BY updated_at DESC',
        [req.user.id],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // 简化数据，适合小程序展示
            const simplified = rows.map(item => ({
                id: item.id,
                symbol: item.symbol,
                name: item.name,
                market: item.market,
                shares: item.shares,
                price: item.price,
                avgCost: item.avg_cost,
                change: item.price - (item.avg_cost || item.price),
                changePercent: item.avg_cost 
                    ? ((item.price - item.avg_cost) / item.avg_cost * 100).toFixed(2)
                    : 0,
                marketValue: item.shares * item.price
            }));
            
            res.json({
                success: true,
                portfolio: simplified
            });
        }
    );
});

/**
 * 小程序专用 - 快速上传持仓截图
 * POST /api/wx/portfolio/quick-upload
 */
router.post('/portfolio/quick-upload', authenticateToken, async (req, res) => {
    try {
        // 复用现有的上传逻辑
        // 这里简化处理，实际应该调用 ai-service
        res.json({
            success: true,
            message: '上传成功',
            portfolio: []
        });
    } catch (error) {
        console.error('上传失败:', error.message);
        res.status(500).json({ error: '上传失败: ' + error.message });
    }
});

/**
 * 小程序专用 - 获取提醒列表
 * GET /api/wx/alerts
 */
router.get('/alerts', authenticateToken, (req, res) => {
    const db = req.app.locals.db;
    const { limit = 20 } = req.query;
    
    db.all(
        `SELECT * FROM alerts 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [req.user.id, parseInt(limit)],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                success: true,
                alerts: rows
            });
        }
    );
});

/**
 * 小程序专用 - 标记提醒已读
 * POST /api/wx/alerts/:id/read
 */
router.post('/alerts/:id/read', authenticateToken, (req, res) => {
    const db = req.app.locals.db;
    const alertId = req.params.id;
    
    db.run(
        'UPDATE alerts SET is_read = 1 WHERE id = ? AND user_id = ?',
        [alertId, req.user.id],
        (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                success: true,
                message: '已标记为已读'
            });
        }
    );
});

// ============ 辅助函数 ============

/**
 * JWT 认证中间件
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: '未提供 token' });
    }
    
    // 验证 token（简化版，实际应该使用 jwt.verify）
    const user = validateToken(token);
    if (!user) {
        return res.status(403).json({ error: '无效的 token' });
    }
    
    req.user = user;
    next();
}

/**
 * 验证 token
 */
function validateToken(token) {
    // 简化实现，实际应该使用 JWT 库验证
    // 这里假设 token 格式为: user_id:timestamp:signature
    try {
        const [userId, timestamp] = token.split(':');
        if (!userId) return null;
        
        return {
            id: parseInt(userId),
            token: token
        };
    } catch (e) {
        return null;
    }
}

/**
 * 生成 token
 */
function generateToken(user) {
    // 简化实现，实际应该使用 JWT 库
    const timestamp = Date.now();
    return `${user.id}:${timestamp}:signature`;
}

/**
 * 查找或创建用户
 */
function findOrCreateUser(openid, unionid) {
    return new Promise((resolve, reject) => {
        const db = require('./server').db;
        
        // 查找用户
        db.get(
            'SELECT * FROM users WHERE openid = ?',
            [openid],
            (err, row) => {
                if (err) return reject(err);
                
                if (row) {
                    // 更新登录时间
                    db.run(
                        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                        [row.id]
                    );
                    resolve(row);
                } else {
                    // 创建新用户
                    db.run(
                        `INSERT INTO users (openid, unionid, created_at, last_login) 
                         VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                        [openid, unionid],
                        function(err) {
                            if (err) return reject(err);
                            
                            resolve({
                                id: this.lastID,
                                openid: openid,
                                unionid: unionid,
                                nickname: null,
                                avatar: null
                            });
                        }
                    );
                }
            }
        );
    });
}

/**
 * 更新用户信息
 */
function updateUserInfo(userId, info) {
    return new Promise((resolve, reject) => {
        const db = require('./server').db;
        
        db.run(
            'UPDATE users SET nickname = ?, avatar = ? WHERE id = ?',
            [info.nickname, info.avatar, userId],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

module.exports = router;
