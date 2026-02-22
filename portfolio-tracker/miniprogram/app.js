App({
  globalData: {
    userInfo: null,
    token: null,
    apiBaseUrl: 'https://your-api-domain.com/api'
  },

  onLaunch() {
    console.log('Portfolio Tracker 小程序启动');
    
    // 检查登录状态
    this.checkLoginStatus();
    
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;
  },

  // 检查登录状态
  checkLoginStatus() {
    const token = wx.getStorageSync('token');
    if (token) {
      this.globalData.token = token;
      // 验证 token 有效性
      this.validateToken(token);
    }
  },

  // 验证 token
  validateToken(token) {
    wx.request({
      url: `${this.globalData.apiBaseUrl}/auth/validate`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${token}`
      },
      success: (res) => {
        if (res.statusCode === 200) {
          this.globalData.userInfo = res.data.user;
        } else {
          // token 无效，清除登录状态
          this.clearLoginStatus();
        }
      },
      fail: () => {
        console.log('Token 验证失败');
      }
    });
  },

  // 清除登录状态
  clearLoginStatus() {
    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
    this.globalData.token = null;
    this.globalData.userInfo = null;
  },

  // 微信登录
  wxLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            // 发送 code 到后端换取 token
            wx.request({
              url: `${this.globalData.apiBaseUrl}/auth/wx-login`,
              method: 'POST',
              data: {
                code: res.code
              },
              success: (loginRes) => {
                if (loginRes.statusCode === 200) {
                  const { token, user } = loginRes.data;
                  wx.setStorageSync('token', token);
                  wx.setStorageSync('userInfo', user);
                  this.globalData.token = token;
                  this.globalData.userInfo = user;
                  resolve({ token, user });
                } else {
                  reject(new Error('登录失败'));
                }
              },
              fail: reject
            });
          } else {
            reject(new Error('获取微信登录 code 失败'));
          }
        },
        fail: reject
      });
    });
  }
});
