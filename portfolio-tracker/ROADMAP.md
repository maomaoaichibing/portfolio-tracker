# 持仓智投 - 开发计划

## 当前版本 (MVP)

### 已实现
- [x] 基础前端界面（上传、展示、详情）
- [x] Express后端框架
- [x] SQLite数据库设计
- [x] 模拟数据演示

### 待实现

#### Phase 1 - 核心功能完善
- [ ] 接入Kimi API实现截图识别
  - 使用多模态能力识别持仓截图
  - 提取标的代码、名称、持仓数量、成本价
  
- [ ] 股票数据接口
  - 接入免费行情API（如Alpha Vantage、新浪财经）
  - 获取实时价格、历史数据
  
- [ ] AI分析引擎
  - 分析每只股票过去一年涨跌逻辑
  - 生成监控指标清单
  - 保存分析结果到数据库

#### Phase 2 - 监控体系
- [ ] 定时任务（cron）
  - 每日更新行情数据
  - 每周重新分析逻辑变化
  
- [ ] 提醒系统
  - 监控指标触发提醒
  - 逻辑变化检测
  - 飞书/微信推送

- [ ] 数据可视化
  - 持仓分布图表
  - 涨跌趋势图
  - 行业配置分析

#### Phase 3 - 微信小程序
- [ ] 小程序前端
  - 适配移动端界面
  - 拍照上传持仓
  - 消息推送
  
- [ ] 后端适配
  - 微信登录集成
  - 小程序API接口

## 核心算法设计

### 1. 涨跌逻辑分析

```
输入: 股票代码、过去一年价格数据
输出: 涨跌驱动因素、监控指标清单

分析维度:
- 宏观: 利率、汇率、政策
- 行业: 景气度、竞争格局、政策
- 公司: 业绩、产品、管理层
- 市场: 估值、资金流向、情绪
```

### 2. 逻辑变化检测

```
定期对比:
- 当前指标 vs 历史指标
- 最新新闻 vs 原有逻辑假设
- 业绩表现 vs 预期

变化信号:
- 关键指标偏离阈值
- 重大新闻事件
- 业绩超预期/低于预期
```

### 3. 提醒优先级

```
P0 - 立即关注: 持仓逻辑根本性变化
P1 - 重要: 关键指标触发阈值
P2 - 关注: 行业/公司重要动态
P3 - 了解: 一般性信息更新
```

## 数据库设计

### 表结构

```sql
-- 用户持仓
portfolio: id, user_id, symbol, name, market, shares, avg_cost, current_price, updated_at

-- 分析记录
analysis: id, symbol, analysis_type, year_change, logic_summary, key_factors, created_at

-- 监控指标
monitoring: id, symbol, metric_name, metric_type, current_value, threshold_value, status

-- 监控日志
monitoring_logs: id, monitoring_id, old_value, new_value, change_reason, created_at

-- 提醒记录
alerts: id, user_id, symbol, alert_type, priority, title, content, is_read, created_at
```

## API 设计

### 核心接口

```
POST   /api/portfolio/upload      # 上传持仓截图
POST   /api/portfolio/analyze     # AI分析持仓
GET    /api/portfolio             # 获取持仓列表
GET    /api/analysis/:symbol      # 获取标的分析
GET    /api/monitoring            # 获取监控列表
POST   /api/monitoring/refresh    # 手动刷新监控
GET    /api/alerts                # 获取提醒列表
```

## 下一步行动

1. 确定股票数据源（免费/付费）
2. 接入Kimi API实现截图识别
3. 编写AI分析Prompt
4. 实现定时监控任务
