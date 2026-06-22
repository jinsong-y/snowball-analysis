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

### 前置条件：启动 Chrome 调试模式

本工具通过 CDP 连接已登录的 Chrome 浏览器，复用雪球和 DeepSeek 的登录态。

```bash
# 关闭当前 Chrome，用调试模式重启
pkill -f "Google Chrome" 2>/dev/null; sleep 2
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --no-first-run \
  --no-default-browser-check \
  --user-data-dir="$HOME/.chrome-debug-profile" &
sleep 5
# 验证连接
curl -s http://localhost:9222/json/version | head -1
```

首次启动后，手动登录雪球和 DeepSeek，之后复用 cookie。

### 单只股票分析（推荐先用这个验证）

```bash
node scripts/main.mjs --code=SZ300319    # 麦捷科技
node scripts/main.mjs --code=SH600519    # 贵州茅台
node scripts/main.mjs --code=SZ000858    # 五粮液
```

流程：
1. 打开雪球股票页 → 截图日K（含信息头+K线+成交量+MACD）
2. 切换周K → 截图
3. 打开 DeepSeek → 选择视觉模型 → 确认深度思考激活
4. 上传截图 → 发送七维选股提示词
5. 等待 AI 回复完成（深度思考模式，约1-2分钟）
6. 提取回复 → 保存到 `results/YYYY-MM-DD/`

### 全流程批量运行

```bash
npm start                               # 全部50只
node scripts/main.mjs --count=5         # 只跑前5只
node scripts/main.mjs --start=5 --count=10  # 第6-15只
```

支持**断点续传**：已完成的股票自动跳过，中断后重启从断点继续。

### 分批处理

```bash
node scripts/batch.mjs --count=5        # 前5只
node scripts/batch.mjs --code=SH600519  # 指定股票
```

每只股票耗时约 1-2 分钟（含深度思考等待），50只预计 1-2 小时。

## 工作流步骤

```
单只股票分析流程:
┌──────────────────────────────────────────────────────────┐
│ 1. 雪球截图                                               │
│    ├─ 打开 https://xueqiu.com/S/{code}                   │
│    ├─ 日K 视口截图（含股票信息头+K线+成交量+MACD）         │
│    └─ 切换周K（data-period="week"）→ 截图                 │
│                                                            │
│ 2. DeepSeek 分析                                           │
│    ├─ 打开 chat.deepseek.com 新对话                        │
│    ├─ 选择视觉模型（data-model-type="vision"）             │
│    ├─ 确认深度思考已激活（ds-toggle-button--selected）      │
│    ├─ 上传日K+周K截图                                      │
│    ├─ 输入七维选股提示词                                    │
│    ├─ 点击发送（ds-button--primary），失败自动重试3次       │
│    ├─ 等待回复完成（DOM状态：停止按钮/placeholder检测）     │
│    └─ 等待最终回复文本稳定（assistant-main-content）        │
│                                                            │
│ 3. 保存结果                                                │
│    ├─ results/YYYY-MM-DD/{序号}_{代码}_{名称}.md           │
│    └─ 汇总_YYYY-MM-DD.md                                  │
└──────────────────────────────────────────────────────────┘

批量流程: 抓取热股列表 → 逐只执行上述流程 → 生成汇总表
```

## 配置说明

编辑 `scripts/config.mjs` 可修改：

- `BROWSER.headless`：设为 `true` 可无头运行（但需要已登录的cookie）
- `BROWSER.slowMo`：操作间隔，降低可加快速度
- `DEEPSEEK.responseTimeout`：等待AI回复的超时时间
- `XUEQIU.topN`：抓取股票数量（默认50）
- `ANALYSIS_PROMPT`：发送给DeepSeek的选股提示词

## 输出示例

每只股票的结果文件（`results/YYYY-MM-DD/{序号}_{代码}_{名称}.md`）：

```markdown
# SZ300319（SZ300319）- AI 选股分析

## 元数据
| 项目 | 内容 |
|------|------|
| 定性结论 | 稳健低吸 / 短线博弈 / 直接放弃 |

## K 线截图
![日K](screenshots/xxx_日K.png)
![周K](screenshots/xxx_周K.png)

## AI 分析
（七维分析：趋势均线、量能资金、技术指标、估值安全、基本面避雷）

## 操作建议
- [ ] 确认买入
- [ ] 设置止损点
- [ ] 设置止盈点
```

汇总文件（`results/YYYY-MM-DD/汇总_YYYY-MM-DD.md`）：

```markdown
| 排名 | 代码 | 名称 | 定性结论 | 详情 |
|------|------|------|----------|------|
| 1 | SZ300319 | 麦捷科技 | 直接放弃 | [查看](01_SZ300319_麦捷科技.md) |
| 2 | SH600519 | 贵州茅台 | 稳健低吸 | [查看](02_SH600519_贵州茅台.md) |
```

## 注意事项

1. **Chrome 调试模式**必须先启动，否则无法连接浏览器
2. **深度思考**默认已激活，脚本不会重复点击（避免关闭）
3. 发送按钮通过 `ds-button--primary` 选择器定位，失败自动重试 3 次
4. 回复提取等待 `ds-assistant-message-main-content` 文本稳定（最长 60 秒）
5. 检测到"已停止"等错误标记时自动重试分析（最多 3 次）
6. 截图保存在 `screenshots/` 目录，结果在 `results/YYYY-MM-DD/`
7. 详细工作流参见 [workflow.md](workflow.md)
