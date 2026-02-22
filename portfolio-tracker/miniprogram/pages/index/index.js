const app = getApp();

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    totalPnL: 0,
    portfolioCount: 0,
    alertCount: 0,
    recentAlerts: [],
    recentNews: []
  },

  onLoad() {
    this.checkLoginStatus();
  },

  onShow() {
    if (this.data.isLoggedIn) {
      this.loadDashboardData();
    }
  },

  // 检查登录状态
  checkLoginStatus() {
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    
    this.setData({
      isLoggedIn: !!token,
      userInfo: userInfo || null
    });

    if (token) {
      this.loadDashboardData();
    }
  },

  // 处理登录
  async handleLogin() {
    wx.showLoading({ title: '登录中...' });
    
    try {
      const result = await app.wxLogin();
      
      this.setData({
        isLoggedIn: true,
        userInfo: result.user
      });
      
      wx.hideLoading();
      wx.showToast({
        title: '登录成功',
        icon: 'success'
      });
      
      this.loadDashboardData();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '登录失败',
        icon: 'none'
      });
      console.error('登录失败:', error);
    }
  },

  // 加载仪表盘数据
  async loadDashboardData() {
    try {
      // 获取持仓数据
      const portfolio = await this.fetchPortfolio();
      
      // 获取提醒数据
      const alerts = await this.fetchAlerts();
      
      // 获取新闻数据
      const news = await this.fetchNews();
      
      this.setData({
        portfolioCount: portfolio.length,
        alertCount: alerts.filter(a => !a.is_read).length,
        recentAlerts: alerts.slice(0, 3),
        recentNews: news.slice(0, 3)
      });
      
      // 计算今日盈亏
      this.calculatePnL(portfolio);
      
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  },

  // 获取持仓
  fetchPortfolio() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.apiBaseUrl}/portfolio`,
        header: {
          'Authorization': `Bearer ${app.globalData.token}`
        },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data.portfolio || []);
          } else {
            reject(new Error('获取持仓失败'));
          }
        },
        fail: reject
      });
    });
  },

  // 获取提醒
  fetchAlerts() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.apiBaseUrl}/alerts`,
        header: {
          'Authorization': `Bearer ${app.globalData.token}`
        },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data.alerts || []);
          } else {
            reject(new Error('获取提醒失败'));
          }
        },
        fail: reject
      });
    });
  },

  // 获取新闻
  fetchNews() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.apiBaseUrl}/news`,
        header: {
          'Authorization': `Bearer ${app.globalData.token}`
        },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data.news || []);
          } else {
            reject(new Error('获取新闻失败'));
          }
        },
        fail: reject
      });
    });
  },

  // 计算盈亏
  calculatePnL(portfolio) {
    let totalPnL = 0;
    portfolio.forEach(item => {
      if (item.avg_cost && item.price) {
        const pnl = ((item.price - item.avg_cost) / item.avg_cost * 100);
        totalPnL += pnl;
      }
    });
    
    this.setData({
      totalPnL: totalPnL.toFixed(2)
    });
  },

  // 上传持仓
  uploadPortfolio() {
    wx.showActionSheet({
      itemList: ['拍照上传', '从相册选择'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.takePhoto();
        } else if (res.tapIndex === 1) {
          this.chooseFromAlbum();
        }
      }
    });
  },

  // 拍照
  takePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        this.uploadImage(res.tempFiles[0].tempFilePath);
      }
    });
  },

  // 从相册选择
  chooseFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        this.uploadImage(res.tempFiles[0].tempFilePath);
      }
    });
  },

  // 上传图片
  uploadImage(filePath) {
    wx.showLoading({ title: '识别中...' });
    
    wx.uploadFile({
      url: `${app.globalData.apiBaseUrl}/portfolio/upload`,
      filePath: filePath,
      name: 'screenshots',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        wx.hideLoading();
        
        const data = JSON.parse(res.data);
        if (data.success) {
          wx.showToast({
            title: `识别成功: ${data.portfolio.length}只标的`,
            icon: 'success'
          });
          
          // 跳转到持仓页面
          wx.switchTab({
            url: '/pages/portfolio/portfolio'
          });
        } else {
          wx.showToast({
            title: '识别失败',
            icon: 'none'
          });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: '上传失败',
          icon: 'none'
        });
      }
    });
  },

  // 查看分析
  viewAnalysis() {
    wx.switchTab({
      url: '/pages/analysis/analysis'
    });
  },

  // 刷新数据
  refreshData() {
    wx.showLoading({ title: '刷新中...' });
    
    // 调用刷新价格 API
    wx.request({
      url: `${app.globalData.apiBaseUrl}/portfolio/refresh-prices`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: () => {
        wx.hideLoading();
        wx.showToast({
          title: '刷新成功',
          icon: 'success'
        });
        this.loadDashboardData();
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: '刷新失败',
          icon: 'none'
        });
      }
    });
  },

  // 查看全部提醒
  viewAllAlerts() {
    wx.switchTab({
      url: '/pages/analysis/analysis'
    });
  },

  // 查看全部新闻
  viewAllNews() {
    wx.navigateTo({
      url: '/pages/news/news'
    });
  },

  // 打开新闻
  openNews(e) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(url)}`
    });
  }
});
