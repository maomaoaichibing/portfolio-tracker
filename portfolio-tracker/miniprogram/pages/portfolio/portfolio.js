const app = getApp();

Page({
  data: {
    portfolio: [],
    loading: true,
    totalMarketValue: '0.00',
    totalPnL: 0,
    showAlertModal: false,
    selectedStock: {},
    alertTypes: ['价格上涨到', '价格下跌到', '涨跌幅超过'],
    alertTypeIndex: 0,
    targetPrice: ''
  },

  onLoad() {
    this.loadPortfolio();
  },

  onShow() {
    this.loadPortfolio();
  },

  onPullDownRefresh() {
    this.loadPortfolio().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 加载持仓数据
  async loadPortfolio() {
    this.setData({ loading: true });
    
    try {
      const result = await this.fetchPortfolio();
      
      // 计算统计数据
      let totalValue = 0;
      let totalCost = 0;
      
      const portfolio = result.map(item => {
        const marketValue = item.shares * item.price;
        const costValue = item.shares * (item.avgCost || item.price);
        const pnl = item.avgCost 
          ? ((item.price - item.avgCost) / item.avgCost * 100)
          : 0;
        
        totalValue += marketValue;
        totalCost += costValue;
        
        return {
          ...item,
          marketValue: marketValue.toFixed(2),
          pnl: pnl.toFixed(2)
        };
      });
      
      const totalPnL = totalCost > 0 
        ? ((totalValue - totalCost) / totalCost * 100)
        : 0;
      
      this.setData({
        portfolio,
        totalMarketValue: totalValue.toFixed(2),
        totalPnL: totalPnL.toFixed(2),
        loading: false
      });
      
    } catch (error) {
      console.error('加载持仓失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
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
          this.loadPortfolio();
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

  // 查看股票详情
  viewStockDetail(e) {
    const stock = e.currentTarget.dataset.stock;
    wx.navigateTo({
      url: `/pages/stock-detail/stock-detail?symbol=${stock.symbol}`
    });
  },

  // 查看分析
  viewAnalysis(e) {
    const symbol = e.currentTarget.dataset.symbol;
    wx.navigateTo({
      url: `/pages/analysis/analysis?symbol=${symbol}`
    });
  },

  // 设置预警
  setAlert(e) {
    const symbol = e.currentTarget.dataset.symbol;
    const stock = this.data.portfolio.find(p => p.symbol === symbol);
    
    this.setData({
      showAlertModal: true,
      selectedStock: stock,
      targetPrice: ''
    });
  },

  // 关闭预警弹窗
  closeAlertModal() {
    this.setData({
      showAlertModal: false,
      selectedStock: {},
      targetPrice: ''
    });
  },

  // 预警类型变化
  onAlertTypeChange(e) {
    this.setData({
      alertTypeIndex: e.detail.value
    });
  },

  // 价格输入
  onPriceInput(e) {
    this.setData({
      targetPrice: e.detail.value
    });
  },

  // 保存预警
  saveAlert() {
    const { selectedStock, alertTypeIndex, targetPrice } = this.data;
    
    if (!targetPrice || parseFloat(targetPrice) <= 0) {
      wx.showToast({
        title: '请输入有效的价格',
        icon: 'none'
      });
      return;
    }
    
    wx.showLoading({ title: '保存中...' });
    
    wx.request({
      url: `${app.globalData.apiBaseUrl}/price-alerts`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      data: {
        symbol: selectedStock.symbol,
        alert_type: ['above', 'below', 'change'][alertTypeIndex],
        target_price: parseFloat(targetPrice)
      },
      success: (res) => {
        wx.hideLoading();
        
        if (res.statusCode === 200) {
          wx.showToast({
            title: '预警设置成功',
            icon: 'success'
          });
          this.closeAlertModal();
        } else {
          wx.showToast({
            title: '设置失败',
            icon: 'none'
          });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: '设置失败',
          icon: 'none'
        });
      }
    });
  }
});
