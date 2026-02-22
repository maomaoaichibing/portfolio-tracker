const app = getApp();

Page({
  data: {
    activeTab: 'portfolio',
    portfolio: [],
    portfolioStats: {
      totalReturn: 15.6,
      volatility: 12.3,
      sharpeRatio: 1.27,
      maxDrawdown: -8.5
    },
    sectorDistribution: [
      { name: '科技', percent: 35, color: '#3B82F6' },
      { name: '金融', percent: 25, color: '#10B981' },
      { name: '消费', percent: 20, color: '#F59E0B' },
      { name: '医疗', percent: 15, color: '#EF4444' },
      { name: '其他', percent: 5, color: '#8B5CF6' }
    ],
    riskFactors: [
      { name: '市场系统性风险', level: 'medium', levelText: '中等' },
      { name: '行业集中度风险', level: 'high', levelText: '较高' },
      { name: '个股波动风险', level: 'medium', levelText: '中等' },
      { name: '流动性风险', level: 'low', levelText: '较低' }
    ],
    selectedStock: {},
    stockAnalysis: {
      date: '2026-02-22',
      summary: '腾讯控股作为国内互联网龙头，受益于视频号商业化加速和游戏业务复苏，长期投资价值显著。',
      drivers: [
        { factor: '视频号商业化', impact: 'positive', impactText: '正面' },
        { factor: '游戏业务复苏', impact: 'positive', impactText: '正面' },
        { factor: '监管政策', impact: 'neutral', impactText: '中性' }
      ],
      risks: ['广告收入增速放缓', '游戏行业竞争加剧', '宏观经济不确定性'],
      metrics: [
        { name: 'PE估值', currentValue: '18.5', threshold: '< 20', status: 'normal' },
        { name: '营收增速', currentValue: '12%', threshold: '> 10%', status: 'normal' },
        { name: '毛利率', currentValue: '45%', threshold: '> 40%', status: 'normal' }
      ]
    },
    alerts: []
  },

  onLoad(options) {
    // 如果传入 symbol，切换到个股分析
    if (options.symbol) {
      this.setData({
        activeTab: 'stocks'
      });
      this.loadStockAnalysis(options.symbol);
    }
    
    this.loadPortfolio();
    this.loadAlerts();
  },

  // 切换标签
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    
    if (tab === 'alerts') {
      this.loadAlerts();
    }
  },

  // 加载持仓
  async loadPortfolio() {
    try {
      const result = await this.fetchPortfolio();
      
      // 默认选中第一个股票
      const selectedStock = result.length > 0 ? result[0] : {};
      
      this.setData({
        portfolio: result,
        selectedStock
      });
      
      if (selectedStock.symbol) {
        this.loadStockAnalysis(selectedStock.symbol);
      }
      
    } catch (error) {
      console.error('加载持仓失败:', error);
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

  // 选择股票
  selectStock(e) {
    const stock = e.currentTarget.dataset.stock;
    this.setData({ selectedStock: stock });
    this.loadStockAnalysis(stock.symbol);
  },

  // 加载股票分析
  async loadStockAnalysis(symbol) {
    try {
      wx.showLoading({ title: '加载分析...' });
      
      const result = await this.fetchStockAnalysis(symbol);
      
      this.setData({
        stockAnalysis: result
      });
      
      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      console.error('加载分析失败:', error);
    }
  },

  // 获取股票分析
  fetchStockAnalysis(symbol) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.apiBaseUrl}/analysis/${symbol}`,
        header: {
          'Authorization': `Bearer ${app.globalData.token}`
        },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data.analysis);
          } else {
            reject(new Error('获取分析失败'));
          }
        },
        fail: reject
      });
    });
  },

  // 加载提醒
  async loadAlerts() {
    try {
      const result = await this.fetchAlerts();
      
      this.setData({
        alerts: result.map(item => ({
          ...item,
          time: this.formatTime(item.created_at)
        }))
      });
      
    } catch (error) {
      console.error('加载提醒失败:', error);
    }
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

  // 标记已读
  markAsRead(e) {
    const alertId = e.currentTarget.dataset.id;
    
    wx.request({
      url: `${app.globalData.apiBaseUrl}/alerts/${alertId}/read`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: () => {
        this.loadAlerts();
      }
    });
  },

  // 格式化时间
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) {
      return '刚刚';
    } else if (diff < 3600000) {
      return Math.floor(diff / 60000) + '分钟前';
    } else if (diff < 86400000) {
      return Math.floor(diff / 3600000) + '小时前';
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  }
});
