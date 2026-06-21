# 雪球热股 AI 分析工作流

自动化抓取雪球热股 Top50，截图日K/周K，通过 DeepSeek 进行 AI 选股分析。

## 目录结构

```
snowball-analysis/
├── scripts/
│   ├── config.mjs          # 配置（路径、提示词等）
│   ├── main.mjs            # 全流程：抓取→截图→分析
│   └── batch.mjs           # 分批处理模式（支持断点续传）
├── screenshots/            # K线截图
├── results/
│   └── YYYY-MM-DD/         # 每日分析结果
├── hot-stocks-YYYY-MM-DD.md  # 热股列表
└── .browser-data/          # 浏览器数据（含登录状态）
```

## 使用前准备

### 1. 安装依赖

```bash
cd /Users/jinsong/Downloads/snowball-analysis
npm install
```

### 2. 首次运行 - 登录账号

首次运行时，浏览器会打开，你需要**手动登录**：

- **雪球**：登录你的雪球账号，确保能看到完整行情数据
- **DeepSeek**：登录 DeepSeek 账号（chat.deepseek.com）

登录后，cookie 会保存在 `.browser-data/` 目录，后续运行无需重复登录。

## 使用方式

### 方式一：全流程一键运行

```bash
npm start
# 或
node scripts/main.mjs
```

### 方式二：分步执行

```bash
# 仅抓取热股列表
node scripts/main.mjs --step=scrape

# 仅对已有列表做截图+分析
node scripts/main.mjs --step=analyze
```

### 方式三：分批处理（推荐）

处理50只股票耗时较长，建议分批：

```bash
# 只处理前5只
node scripts/batch.mjs --count=5

# 从第6只开始，处理10只
node scripts/batch.mjs --start=5 --count=10

# 只处理特定股票
node scripts/batch.mjs --code=SH600519
```

分批模式支持**断点续传**：已完成的股票会自动跳过。

## 工作流步骤

```
┌─────────────────────────────────────────────────┐
│  1. 打开雪球热股页面                               │
│     ↓                                            │
│  2. 抓取 Top50 股票 → 写入 hot-stocks-日期.md     │
│     ↓                                            │
│  3. 逐只股票：                                     │
│     ├─ 打开日K页面 → 截图                          │
│     ├─ 切换周K → 截图                              │
│     ├─ 打开 DeepSeek → 上传截图 + 发送提示词       │
│     └─ 等待AI回复 → 保存结果到 results/日期/       │
│     ↓                                            │
│  4. 生成汇总报告                                   │
└─────────────────────────────────────────────────┘
```

## 配置说明

编辑 `scripts/config.mjs` 可修改：

- `BROWSER.headless`：设为 `true` 可无头运行（但需要已登录的cookie）
- `BROWSER.slowMo`：操作间隔，降低可加快速度
- `DEEPSEEK.responseTimeout`：等待AI回复的超时时间
- `XUEQIU.topN`：抓取股票数量（默认50）
- `ANALYSIS_PROMPT`：发送给DeepSeek的选股提示词

## 输出示例

每只股票的结果文件（`results/日期/代码_名称.md`）：

```markdown
# 贵州茅台（SH600519）- AI选股分析

> 分析日期: 2026-06-21
> 数据来源: https://xueqiu.com/S/SH600519

---

## 1. 逐项核对

### 趋势均线
- ✓ 股价站稳20日均线...
- ✗ 均线未形成多头排列...

### 量能资金
...

## 2. 最终定论
**稳健低吸** / **短线博弈** / **直接放弃**

## 3. 实战点位
| 项目 | 价格 |
|------|------|
| 买入点 | ¥1,800 |
...
```

## 注意事项

1. **首次运行需要手动登录**雪球和DeepSeek，之后自动复用cookie
2. 处理50只股票预计耗时 **1-2小时**，建议分批执行
3. 雪球页面结构可能变化，如遇抓取失败请检查选择器
4. DeepSeek 免费版可能有使用限制，建议高峰期避开
5. 截图保存在 `screenshots/` 目录，可手动检查质量
