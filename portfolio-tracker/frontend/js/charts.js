/**
 * Portfolio Tracker - 数据可视化图表
 * 使用 Chart.js 创建持仓分布和涨跌趋势图表
 */

// 全局图表实例
let distributionChart = null;
let changeChart = null;

// 初始化图表
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
});

// 初始化所有图表
function initCharts() {
    initDistributionChart();
    initChangeChart();
}

// 初始化持仓分布饼图
function initDistributionChart() {
    const ctx = document.getElementById('distributionChart');
    if (!ctx) return;

    distributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
                    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
                ],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });

    // 初始更新
    updateDistributionChart();
}

// 初始化涨跌趋势柱状图
function initChangeChart() {
    const ctx = document.getElementById('changeChart');
    if (!ctx) return;

    changeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: '涨跌幅 (%)',
                data: [],
                backgroundColor: [],
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            return `涨跌幅: ${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#E5E7EB'
                    },
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    });

    // 初始更新
    updateChangeChart();
}

// 更新分布图表
function updateDistributionChart() {
    if (!distributionChart || !portfolioData) return;

    const type = document.getElementById('distributionType')?.value || 'marketValue';
    const { labels, data } = calculateDistributionData(type);

    distributionChart.data.labels = labels;
    distributionChart.data.datasets[0].data = data;
    distributionChart.update();
}

// 计算分布数据
function calculateDistributionData(type) {
    if (!portfolioData || portfolioData.length === 0) {
        return { labels: ['暂无数据'], data: [1] };
    }

    let labels = [];
    let data = [];

    switch (type) {
        case 'marketValue':
            // 按市值分布 - 取前10大持仓
            const sortedByValue = [...portfolioData]
                .sort((a, b) => b.marketValue - a.marketValue)
                .slice(0, 10);
            
            labels = sortedByValue.map(item => item.name);
            data = sortedByValue.map(item => item.marketValue);
            break;

        case 'industry':
            // 按行业分布
            const industryMap = {};
            portfolioData.forEach(item => {
                const industry = item.industry || '其他';
                industryMap[industry] = (industryMap[industry] || 0) + item.marketValue;
            });
            labels = Object.keys(industryMap);
            data = Object.values(industryMap);
            break;

        case 'market':
            // 按市场分布 (A股/港股/美股)
            const marketMap = {};
            portfolioData.forEach(item => {
                // 根据股票代码判断市场
                let market = '其他';
                const code = item.code;
                if (/^\d{6}$/.test(code) || /^[0-9]{6}\.(SH|SZ|BJ)$/.test(code.toUpperCase())) {
                    market = 'A股';
                } else if (/^\d{4,5}$/.test(code)) {
                    market = '港股';
                } else if (/^[A-Z]+$/.test(code)) {
                    market = '美股';
                }
                marketMap[market] = (marketMap[market] || 0) + item.marketValue;
            });
            labels = Object.keys(marketMap);
            data = Object.values(marketMap);
            break;

        default:
            labels = portfolioData.map(item => item.name);
            data = portfolioData.map(item => item.marketValue);
    }

    return { labels, data };
}

// 更新涨跌图表
function updateChangeChart() {
    if (!changeChart || !portfolioData) return;

    const sortedData = [...portfolioData]
        .sort((a, b) => b.pnlPercent - a.pnlPercent);

    const labels = sortedData.map(item => item.name);
    const data = sortedData.map(item => item.pnlPercent);
    const colors = data.map(value => value >= 0 ? '#10B981' : '#EF4444');

    changeChart.data.labels = labels;
    changeChart.data.datasets[0].data = data;
    changeChart.data.datasets[0].backgroundColor = colors;
    changeChart.update();
}

// 刷新所有图表
function refreshCharts() {
    updateDistributionChart();
    updateChangeChart();
}

// 监听 portfolioData 变化
const originalLoadPortfolio = window.loadPortfolio;
if (originalLoadPortfolio) {
    window.loadPortfolio = async function() {
        await originalLoadPortfolio.apply(this, arguments);
        // 数据加载完成后更新图表
        setTimeout(() => {
            refreshCharts();
        }, 100);
    };
}

// 导出函数供 HTML 调用
window.updateDistributionChart = updateDistributionChart;
window.updateChangeChart = updateChangeChart;
window.refreshCharts = refreshCharts;
