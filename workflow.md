# 单只股票分析工作流

## 前置条件

1. Chrome 已启动调试模式：
```bash
pkill -f "Google Chrome" 2>/dev/null; sleep 2
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --no-first-run \
  --no-default-browser-check \
  --user-data-dir="$HOME/.chrome-debug-profile" &
sleep 5
curl -s http://localhost:9222/json/version | head -1  # 验证连接
```

2. 已登录雪球（xueqiu.com）和 DeepSeek（chat.deepseek.com）

## 执行命令

```bash
node scripts/main.mjs --code=<股票代码>
```

示例：
```bash
node scripts/main.mjs --code=SZ300319    # 麦捷科技
node scripts/main.mjs --code=SH600519    # 贵州茅台
node scripts/main.mjs --code=SZ000858    # 五粮液
```

## 流程步骤

```
┌─────────────────────────────────────────────────────┐
│ 1. 雪球截图                                          │
│    ├─ 打开 https://xueqiu.com/S/{code}              │
│    ├─ 日K 视口截图（含股票信息头+K线+成交量+MACD）    │
│    └─ 切换周K（data-period="week"）→ 截图            │
│                                                       │
│ 2. DeepSeek 分析                                      │
│    ├─ 打开 chat.deepseek.com 新对话                   │
│    ├─ 选择视觉模型（data-model-type="vision"）        │
│    ├─ 确认深度思考已激活（ds-toggle-button--selected） │
│    ├─ 上传日K+周K截图                                 │
│    ├─ 输入七维选股提示词                               │
│    ├─ 点击发送（ds-button--primary）                   │
│    ├─ 等待回复完成（DOM状态判断）                      │
│    └─ 等待最终回复文本稳定（assistant-main-content）   │
│                                                       │
│ 3. 保存结果                                           │
│    ├─ results/YYYY-MM-DD/{序号}_{代码}_{名称}.md      │
│    └─ 汇总_YYYY-MM-DD.md                             │
└─────────────────────────────────────────────────────┘
```

## 输出结构

```
results/YYYY-MM-DD/
├── 01_SZ300319_麦捷科技.md    # 单只分析详情
└── 汇总_YYYY-MM-DD.md         # 汇总表

screenshots/
├── 2026-06-22_01_SZ300319_麦捷科技_日K.png
└── 2026-06-22_01_SZ300319_麦捷科技_周K.png
```

## 结果文件格式

```markdown
# 股票名称（代码）- AI 选股分析

## 元数据
| 项目 | 内容 |
|------|------|
| 定性结论 | 稳健低吸 / 短线博弈 / 直接放弃 |

## K 线截图
![日K](screenshots/xxx_日K.png)
![周K](screenshots/xxx_周K.png)

## AI 分析
（完整的七维分析：趋势、量能、技术、估值、基本面、入场标准、黑名单）

## 操作建议
- [ ] 确认买入
- [ ] 设置止损点: ____
- [ ] 设置止盈点: ____
```

## 关键参数

| 参数 | 值 | 说明 |
|------|------|------|
| 截图等待 | 5s | K线图表渲染时间 |
| 发送重试 | 3次 | insertText 可能不触发 React |
| 回复超时 | 300s | 深度思考模式较慢 |
| 文本稳定检测 | 连续3次无变化 | 判断回复是否生成完毕 |
| 股票间隔 | 5s | 批量处理时避免频率限制 |

## 故障排查

| 症状 | 原因 | 解决 |
|------|------|------|
| "Target page closed" | Chrome 调试会话断开 | 重启 Chrome 调试模式 |
| "发送未确认" ×3 | insertText 未触发 React | 重试机制自动处理 |
| "回复过短" | AI 提前中断 | 自动重试最多3次 |
| "已停止" | DeepSeek 服务端中断 | 自动重试最多3次 |
| 定性结论"待分析" | extractConclusion 未匹配 | 检查 AI 回复中的结论关键词 |
