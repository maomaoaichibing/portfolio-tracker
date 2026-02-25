/**
 * 智投镜头页面逻辑
 */

const API_BASE_URL = window.location.origin;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadLenses();
    loadComparison();
});

// 获取认证头
function getAuthHeaders() {
    const token = localStorage.getItem('token') || '';
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

// 加载可用镜头
async function loadLenses() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/lenses`);
        const result = await response.json();
        
        if (result.success) {
            renderLensGrid(result.data);
        }
    } catch (error) {
        console.error('加载镜头失败:', error);
        document.getElementById('lensGrid').innerHTML = `
            <div class="error">加载失败，请刷新重试</div>
        `;
    }
}

// 渲染镜头网格
function renderLensGrid(lenses) {
    const grid = document.getElementById('lensGrid');
    
    if (!lenses || lenses.length === 0) {
        grid.innerHTML = `<div class="empty">暂无可用镜头</div>`;
        return;
    }
    
    grid.innerHTML = lenses.map(lens => `
        <div class="lens-card" onclick="analyzeWithLens('${lens.id}')">
            <div class="lens-icon-large">${lens.icon}</div>
            <div class="lens-name">${lens.name}</div>
            <div class="lens-desc">${lens.description}</div>
        </div>
    `).join('');
}

// 使用指定镜头分析
async function analyzeWithLens(lensId) {
    const resultDiv = document.getElementById('analysisResult');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div class="loading">正在分析...</div>';
    
    // 滚动到结果区域
    resultDiv.scrollIntoView({ behavior: 'smooth' });
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/lenses/${lensId}/analyze`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            resultDiv.innerHTML = `
                <div class="error">
                    请先<a href="login.html">登录</a>后使用此功能
                </div>
            `;
            return;
        }
        
        const result = await response.json();
        
        if (result.success) {
            if (result.analysis) {
                renderAnalysisResult(result.analysis);
            } else {
                resultDiv.innerHTML = `<div class="empty">暂无持仓数据</div>`;
            }
        } else {
            resultDiv.innerHTML = `<div class="error">${result.error || '分析失败'}</div>`;
        }
    } catch (error) {
        console.error('分析失败:', error);
        resultDiv.innerHTML = `<div class="error">分析失败，请稍后重试</div>`;
    }
}

// 渲染分析结果
function renderAnalysisResult(analysis) {
    const resultDiv = document.getElementById('analysisResult');
    
    // 设置镜头信息
    document.getElementById('resultIcon').textContent = analysis.lens.icon;
    document.getElementById('resultName').textContent = analysis.lens.name;
    document.getElementById('resultDesc').textContent = analysis.lens.description;
    
    // 设置分数
    document.getElementById('resultScore').textContent = analysis.portfolioScore;
    document.getElementById('resultScore').style.color = analysis.scoreLevel.color;
    document.getElementById('resultLevel').textContent = analysis.scoreLevel.text;
    document.getElementById('resultLevel').style.color = analysis.scoreLevel.color;
    
    // 强项
    const strengthsList = document.getElementById('strengthsList');
    if (analysis.strengths && analysis.strengths.length > 0) {
        strengthsList.innerHTML = analysis.strengths.map(s => `
            <li>${s.name} (${s.score}分)</li>
        `).join('');
        document.getElementById('strengthsSection').style.display = 'block';
    } else {
        document.getElementById('strengthsSection').style.display = 'none';
    }
    
    // 弱项
    const weaknessesList = document.getElementById('weaknessesList');
    if (analysis.weaknesses && analysis.weaknesses.length > 0) {
        weaknessesList.innerHTML = analysis.weaknesses.map(s => `
            <li>${s.name} (${s.score}分)</li>
        `).join('');
        document.getElementById('weaknessesSection').style.display = 'block';
    } else {
        document.getElementById('weaknessesSection').style.display = 'none';
    }
    
    // 持仓评分表
    const stockScoresList = document.getElementById('stockScoresList');
    if (analysis.stockScores && analysis.stockScores.length > 0) {
        stockScoresList.innerHTML = analysis.stockScores.map((stock, index) => {
            const scoreClass = stock.score >= 80 ? 'excellent' : stock.score >= 60 ? 'good' : stock.score >= 40 ? 'average' : 'poor';
            return `
                <tr>
                    <td class="rank">${index + 1}</td>
                    <td class="stock-name">
                        <div class="name">${stock.name}</div>
                        <div class="code">${stock.symbol}</div>
                    </td>
                    <td class="score ${scoreClass}">${stock.score}</td>
                    <td class="evaluation">${getEvaluationText(stock.score)}</td>
                    <td class="suggestion">${stock.suggestion}</td>
                </tr>
            `;
        }).join('');
    }
    
    // 建议
    const recommendationsList = document.getElementById('recommendationsList');
    if (analysis.recommendations && analysis.recommendations.length > 0) {
        recommendationsList.innerHTML = analysis.recommendations.map(rec => `
            <div class="recommendation-item ${rec.type}">
                <div class="rec-title">${rec.title}</div>
                <div class="rec-content">${rec.content}</div>
            </div>
        `).join('');
    }
    
    // 恢复原始结构
    resultDiv.innerHTML = `
        <div class="result-header">
            <div class="lens-info">
                <span class="lens-icon" id="resultIcon">${analysis.lens.icon}</span>
                <div class="lens-title">
                    <h3 id="resultName">${analysis.lens.name}</h3>
                    <p id="resultDesc">${analysis.lens.description}</p>
                </div>
            </div>
            <div class="score-display">
                <div class="score-value" id="resultScore" style="color: ${analysis.scoreLevel.color}">${analysis.portfolioScore}</div>
                <div class="score-label" id="resultLevel" style="color: ${analysis.scoreLevel.color}">${analysis.scoreLevel.text}</div>
            </div>
        </div>

        <div class="strengths-weaknesses">
            <div class="strengths" id="strengthsSection" style="${analysis.strengths?.length ? '' : 'display:none'}">
                <h4>💪 强项</h4>
                <ul id="strengthsList">${analysis.strengths?.map(s => `<li>${s.name} (${s.score}分)</li>`).join('') || ''}</ul>
            </div>
            <div class="weaknesses" id="weaknessesSection" style="${analysis.weaknesses?.length ? '' : 'display:none'}">
                <h4>⚠️ 弱项</h4>
                <ul id="weaknessesList">${analysis.weaknesses?.map(s => `<li>${s.name} (${s.score}分)</li>`).join('') || ''}</ul>
            </div>
        </div>

        <div class="stock-scores-section">
            <h4>📋 持仓评分</h4>
            <div class="stock-scores-table">
                <table class="score-table">
                    <thead>
                        <tr>
                            <th>排名</th>
                            <th>股票</th>
                            <th>得分</th>
                            <th>评价</th>
                            <th>建议</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${analysis.stockScores.map((stock, index) => {
                            const scoreClass = stock.score >= 80 ? 'excellent' : stock.score >= 60 ? 'good' : stock.score >= 40 ? 'average' : 'poor';
                            return `
                                <tr>
                                    <td class="rank">${index + 1}</td>
                                    <td class="stock-name">
                                        <div class="name">${stock.name}</div>
                                        <div class="code">${stock.symbol}</div>
                                    </td>
                                    <td class="score ${scoreClass}">${stock.score}</td>
                                    <td class="evaluation">${getEvaluationText(stock.score)}</td>
                                    <td class="suggestion">${stock.suggestion}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="recommendations-section">
            <h4>💡 投资建议</h4>
            <div class="recommendations-list">
                ${analysis.recommendations.map(rec => `
                    <div class="recommendation-item ${rec.type}">
                        <div class="rec-title">${rec.title}</div>
                        <div class="rec-content">${rec.content}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// 获取评价文字
function getEvaluationText(score) {
    if (score >= 80) return '优秀';
    if (score >= 60) return '良好';
    if (score >= 40) return '一般';
    return '较弱';
}

// 加载多视角对比
async function loadComparison() {
    const chartDiv = document.getElementById('comparisonChart');
    chartDiv.innerHTML = '<div class="loading">加载对比数据...</div>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/lenses/compare`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            chartDiv.innerHTML = `
                <div class="empty">
                    请先<a href="login.html">登录</a>后查看对比
                </div>
            `;
            return;
        }
        
        const result = await response.json();
        
        if (result.success) {
            if (result.comparisons && result.comparisons.length > 0) {
                renderComparisonChart(result.comparisons);
            } else {
                chartDiv.innerHTML = `<div class="empty">暂无持仓数据，无法进行对比</div>`;
            }
        }
    } catch (error) {
        console.error('加载对比失败:', error);
        chartDiv.innerHTML = `<div class="error">加载失败，请稍后重试</div>
        `;
    }
}

// 渲染对比图表
function renderComparisonChart(comparisons) {
    const chartDiv = document.getElementById('comparisonChart');
    const maxScore = 100;
    
    chartDiv.innerHTML = comparisons.map(item => `
        <div class="comparison-bar">
            <div class="bar-label">
                <span class="bar-icon">${item.lensIcon}</span>
                <span class="bar-name">${item.lensName}</span>
            </div>
            <div class="bar-container">
                <div class="bar-fill" style="width: ${item.score}%; background: ${item.level.color}"></div>
            </div>
            <div class="bar-score" style="color: ${item.level.color}">${item.score}分</div>
        </div>
    `).join('');
}
