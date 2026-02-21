# 持仓智投 - 本地运行指南

## 环境要求

- Node.js 16+ 
- npm 或 yarn
- Git

## 快速开始

### 1. 克隆代码

```bash
git clone https://github.com/maomaoaichibing/portfolio-tracker.git
cd portfolio-tracker
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 API Key：

```env
# Kimi API Key（用于AI截图识别和分析）
KIMI_API_KEY=sk-DlknfFqiU2W33YKGJEbU9yXkh8ejpXUFoXHQsbvGy0PejB9r

# Tavily API Key（用于增强搜索）
TAVILY_API_KEY=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

# 飞书 Webhook（可选，用于推送通知）
FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxx

# 服务端口
PORT=3000
```

### 4. 启动服务

```bash
npm start
```

看到以下输出表示启动成功：

```
持仓智投服务已启动: http://localhost:3000
API Key 状态: 已配置
```

### 5. 访问应用

打开浏览器访问：

```
http://localhost:3000
```

## 开发模式

如需热重载（修改代码后自动重启）：

```bash
npm run dev
```

## 功能测试

### 1. 测试截图识别

- 点击「上传持仓」按钮
- 选择持仓截图（支持券商APP截图）
- AI 会自动识别股票代码、名称、持仓数量

### 2. 测试数据可视化

上传持仓后，页面会显示：
- 持仓分布饼图（按市值/行业/市场）
- 涨跌分布柱状图

### 3. 测试飞书推送（可选）

配置 `FEISHU_WEBHOOK` 后：
- 点击「发送日报」按钮测试推送
- 或在监控面板点击「立即检查」

## 飞书机器人配置

1. 打开飞书，进入目标群组
2. 点击群设置 → 群机器人 → 添加机器人
3. 选择「自定义机器人」
4. 复制 Webhook 地址
5. 填入 `.env` 文件的 `FEISHU_WEBHOOK`

## 常见问题

### Q: 启动失败，提示端口被占用

修改 `.env` 中的 `PORT` 为其他端口：

```env
PORT=3001
```

### Q: 截图识别失败

- 确保截图清晰，包含股票代码和名称
- 检查 `KIMI_API_KEY` 是否正确配置
- 查看后端日志获取详细错误信息

### Q: 股价无法获取

系统使用新浪财经 API，支持 A股/港股/美股：
- A股：600519、000001 等6位数字代码
- 港股：00700、03690 等5位数字代码
- 美股：AAPL、TSLA 等字母代码

### Q: 如何清空数据

删除数据库文件后重启服务：

```bash
rm database/portfolio.db
npm start
```

## 项目结构

```
portfolio-tracker/
├── backend/              # 后端代码
│   ├── server.js         # Express 主服务
│   ├── ai-service.js     # Kimi API 封装
│   ├── stock-service.js  # 股票数据服务
│   ├── monitoring-service.js  # 监控逻辑
│   └── feishu-service.js # 飞书推送
├── frontend/             # 前端代码
│   ├── index.html        # 主页面
│   ├── css/style.css     # 样式
│   └── js/
│       ├── app.js        # 前端逻辑
│       └── charts.js     # 图表功能
├── database/             # SQLite 数据库
├── .env                  # 环境变量
├── package.json
└── README.md
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/portfolio` | GET | 获取持仓列表 |
| `/api/portfolio/upload` | POST | 上传截图识别 |
| `/api/portfolio/analyze` | POST | AI 分析持仓 |
| `/api/portfolio/refresh-prices` | POST | 刷新股价 |
| `/api/stock/price/:symbol` | GET | 获取单只股票价格 |
| `/api/monitoring` | GET | 获取监控指标 |
| `/api/monitoring/check` | POST | 手动检查监控 |
| `/api/monitoring/report` | GET | 获取监控报告 |
| `/api/alerts` | GET | 获取提醒列表 |
| `/api/feishu/test` | POST | 测试飞书推送 |
| `/api/feishu/daily-report` | POST | 发送日报 |

## 定时任务

系统内置两个定时任务：

1. **portfolio-monitor** - 每天运行，自动检查持仓并生成报告
2. **portfolio-monitor-test** - 每5分钟运行（默认禁用），用于测试

在 OpenClaw 中管理：

```bash
openclaw cron list
```

## 更新代码

获取最新代码：

```bash
git pull origin master
npm install  # 如有新依赖
```

## 技术支持

如有问题，请提交 Issue 到 GitHub：
https://github.com/maomaoaichibing/portfolio-tracker/issues
