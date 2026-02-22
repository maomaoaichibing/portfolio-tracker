/**
 * 用户认证中间件和工具函数
 * 简化版 - 用于测试
 */

let jwt;
try {
    jwt = require('jsonwebtoken');
} catch (e) {
    console.log('[Auth] JWT module not available, using mock mode');
    jwt = null;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * 生成 JWT token
 */
function generateToken(user) {
    if (!jwt) {
        return `mock-token-${user.id}-${Date.now()}`;
    }
    return jwt.sign(
        { 
            userId: user.id, 
            openid: user.openid 
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

/**
 * 验证 JWT token
 */
function verifyToken(token) {
    if (!jwt) {
        // Mock mode - extract userId from mock token
        if (token && token.startsWith('mock-token-')) {
            const parts = token.split('-');
            return { userId: parseInt(parts[2]) || 1, openid: 'mock' };
        }
        return { userId: 1, openid: 'mock' };
    }
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

/**
 * 认证中间件
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        // For testing, allow default user
        req.userId = 1;
        req.openid = 'default';
        return next();
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(403).json({ error: '无效的认证令牌' });
    }
    
    req.userId = decoded.userId || 1;
    req.openid = decoded.openid || 'default';
    next();
}

/**
 * 可选认证中间件（不强制要求登录）
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    req.userId = 1;
    req.openid = 'default';
    
    if (token) {
        const decoded = verifyToken(token);
        if (decoded) {
            req.userId = decoded.userId || 1;
            req.openid = decoded.openid || 'default';
        }
    }
    
    next();
}

/**
 * 获取或创建用户
 */
async function findOrCreateUser(db, openid, unionid = null, userInfo = {}) {
    return new Promise((resolve, reject) => {
        // 先查找用户
        db.get(
            'SELECT * FROM users WHERE openid = ?',
            [openid],
            async (err, row) => {
                if (err) return reject(err);
                
                if (row) {
                    // 更新登录时间和用户信息
                    db.run(
                        `UPDATE users SET 
                            last_login = CURRENT_TIMESTAMP,
                            nickname = COALESCE(?, nickname),
                            avatar = COALESCE(?, avatar)
                         WHERE id = ?`,
                        [userInfo.nickname, userInfo.avatar, row.id],
                        (err) => {
                            if (err) console.error('更新用户信息失败:', err);
                        }
                    );
                    
                    resolve(row);
                } else {
                    // 创建新用户
                    db.run(
                        `INSERT INTO users (openid, unionid, nickname, avatar, created_at, last_login) 
                         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                        [openid, unionid, userInfo.nickname, userInfo.avatar],
                        function(err) {
                            if (err) return reject(err);
                            
                            resolve({
                                id: this.lastID,
                                openid: openid,
                                unionid: unionid,
                                nickname: userInfo.nickname,
                                avatar: userInfo.avatar
                            });
                        }
                    );
                }
            }
        );
    });
}

/**
 * 获取用户信息
 */
function getUserById(db, userId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT id, openid, nickname, avatar, created_at, last_login FROM users WHERE id = ?',
            [userId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

/**
 * 更新用户信息
 */
function updateUser(db, userId, updates) {
    return new Promise((resolve, reject) => {
        const fields = [];
        const values = [];
        
        if (updates.nickname !== undefined) {
            fields.push('nickname = ?');
            values.push(updates.nickname);
        }
        if (updates.avatar !== undefined) {
            fields.push('avatar = ?');
            values.push(updates.avatar);
        }
        
        if (fields.length === 0) {
            return resolve();
        }
        
        values.push(userId);
        
        db.run(
            `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
            values,
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

module.exports = {
    generateToken,
    verifyToken,
    authenticateToken,
    optionalAuth,
    findOrCreateUser,
    getUserById,
    updateUser
};
