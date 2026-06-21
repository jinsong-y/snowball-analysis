# PRD: 雪球热股 AI 自动选股工作流

## Problem Statement

作为个人投资者，我每天需要从雪球热股 Top50 中筛选值得投资的股票。当前流程是手动逐只打开股票页面、截图K线、再发给 DeepSeek AI 分析——每只股票耗时3-5分钟，50只股票需要2-3小时，且容易遗漏、无法回溯。我需要一个自动化工具，能批量完成"抓取热股→截图K线→AI分析→生成报告"的全流程，并支持中断续跑，让我每天收盘后一键获取完整的选股分析报告。

## Solution

一个基于 Playwright 浏览器自动化的 Node.js 命令行工具，连接用户已登录的 Chrome 浏览器，依次完成：
1. 从雪球热股页面抓取 Top50 股票列表
2. 逐只打开股票详情页，截图日K和周K（含股票信息头+K线+成交量+技术指标）
3. 逐只将截图发送给 DeepSeek 网页版进行 AI 选股分析
4. 每只股票的分析结果保存为独立 md 文件
5. 最终生成汇总表，一眼扫完全部定性建议

全程显示进度和 ETA，支持断点续传。

## User Stories

1. As an investor, I want to run a single command to scrape the top 50 hot stocks from Xueqiu, so that I don't have to manually browse and copy stock codes
2. As an investor, I want the tool to connect to my already-logged-in Chrome browser, so that I don't need to re-authenticate on Xueqiu or DeepSeek
3. As an investor, I want the stock list saved as a dated markdown file, so that I can reference which stocks were hot on any given day
4. As an investor, I want each stock's daily K-line chart screenshotted from Xueqiu, including the stock info header (price, PE, market cap, turnover), so that the AI has complete data to analyze
5. As an investor, I want each stock's weekly K-line chart screenshotted separately, so that the AI can assess medium-term trends
6. As an investor, I want the K-line screenshots to include MACD indicator area, so that the AI can evaluate momentum signals
7. As an investor, I want the K-line tab switched via the `data-period` attribute button, so that the correct chart period is displayed before screenshot
8. As an investor, I want both daily and weekly screenshots sent together to DeepSeek in one message, so that the AI can cross-reference short and medium-term patterns
9. As an investor, I want a new DeepSeek chat created for each stock, so that there's no context contamination between analyses
10. As an investor, I want the analysis prompt (my custom stock-picking system rules) automatically sent with each stock's screenshots, so that the AI applies consistent criteria
11. As an investor, I want the DeepSeek AI response fully extracted and saved to a markdown file, so that I can review the analysis later
12. As an investor, I want each result file to include the stock screenshots as embedded images, so that I can visually verify the AI's analysis
13. As an investor, I want each result file to contain the AI's actionable buy/sell/hold recommendation with specific price points, so that I can make trading decisions
14. As an investor, I want a summary table generated at the end showing all 50 stocks with their verdicts, so that I can quickly scan for opportunities
15. As an investor, I want the tool to track processing state in a JSON file, so that if the process crashes or I stop it, I can resume from where I left off
16. As an investor, I want to see real-time progress (e.g., "Processing 12/50: 贵州茅台") and estimated time remaining, so that I know how long the full run will take
17. As an investor, I want sufficient wait time between each browser action, so that pages load completely and the tool doesn't fail due to timing issues
18. As an investor, I want the tool to work in serial mode (one stock at a time), so that each stock gets full attention and partial results are always available
19. As an investor, I want to be able to run the tool for a single stock by code (e.g., `--code=SH600519`), so that I can re-analyze or test individual stocks
20. As an investor, I want screenshots saved with descriptive filenames (date_code_name_period.png), so that I can manually browse the screenshot directory
21. As an investor, I want the stock list file to include clickable links to Xueqiu stock pages, so that I can quickly open any stock manually
22. As an investor, I want the tool to handle errors gracefully (e.g., page load failure, DeepSeek timeout), so that one failed stock doesn't crash the entire run
23. As an investor, I want failed stocks logged and reported at the end, so that I know which ones to retry

## Implementation Decisions

### Browser Connection (CDP)

The tool connects to the user's existing Chrome instance via Chrome DevTools Protocol (CDP). The user launches Chrome with `--remote-debugging-port=9222`, and Playwright connects to it using `chromium.connectOverCDP()`. This reuses all existing cookies, login sessions, and browser extensions.

A helper shell script (`start-chrome-debug.sh`) should be provided to simplify launching Chrome in debug mode.

### Xueqiu Scraping

The hot stock page at the provided URL is scraped to extract stock codes and names. Stock links follow the pattern `/S/{exchange}{code}` where exchange is `SH` (Shanghai) or `SZ` (Shenzhen). The page may require scrolling to load all 50 stocks.

### Xueqiu Stock Page Screenshot Scope

Each stock's screenshot must capture:
- **Stock info header**: current price, change %, high/low, open, volume, turnover, PE (TTM/ dynamic/static), PB, market cap, turnover rate
- **K-line chart area**: candlestick chart with moving averages
- **Volume area**: below the K-line chart
- **Technical indicators**: MACD area (DIF, DEA, histogram)

The K-line period is switched via buttons with `data-period` attribute. Screenshot captures the full visible viewport (not just the chart canvas) to include the info header.

### State Management

A JSON state file (`state-YYYY-MM-DD.json`) tracks per-stock progress:

```
Status flow: pending → screenshots_done → analyzing → done
```

On restart, the tool reads the state file and skips stocks with status `done`. Stocks in `analyzing` state are reset to `screenshots_done` (since the DeepSeek response was interrupted). The state file is written after each state transition.

### DeepSeek Web Interaction

For each stock:
1. Navigate to `chat.deepseek.com` (new chat)
2. Upload both screenshots via the file input
3. Fill the textarea with the analysis prompt + stock name
4. Click send button
5. Poll for response completion: check for "stop" button disappearance + response text stability
6. Extract the last assistant message from the DOM

### Progress Display

Console output shows:
```
[16:30:15] [12/50] 贵州茅台 (SH600519) — 截图中...
[16:30:25] [12/50] 贵州茅台 (SH600519) — 等待AI分析...
[16:32:30] [12/50] 贵州茅台 (SH600519) — ✓ 完成
[16:32:30] 进度: 12/50 (24%) | 已用时: 32m15s | 预计剩余: 1h42m | 速度: 2.5min/只
```

ETA is calculated using a rolling average of the last 5 completed stocks.

### Output Structure

```
results/YYYY-MM-DD/
├── 01_SZ300319_麦捷科技.md
├── 02_SH600519_贵州茅台.md
├── ...
├── 50_SZ000001_平安银行.md
└── 汇总_2026-06-21.md
```

Each stock result file contains:
- Metadata (date, source URL)
- Embedded screenshot references
- Full DeepSeek analysis text
- Action summary table (verdict, buy/sell/stop points)

The summary file contains a table with: rank, code, name, verdict, and link to detail file.

### Analysis Prompt

The prompt is a comprehensive stock-picking system with 7 dimensions (trend, volume, momentum, valuation, fundamentals, entry criteria, blacklist). It instructs the AI to:
1. Check each criterion against the screenshot data
2. Give a verdict: "稳健低吸" / "短线博弈" / "直接放弃"
3. Provide specific buy/add/profit/stop price points

### Dependencies

- `playwright` — browser automation (connects to existing Chrome via CDP)
- Node.js ESM modules
- No API keys required (uses web interfaces)

## Testing Decisions

This is a browser automation tool that interacts with live external websites. Traditional unit tests are not practical. Testing approach:

1. **Manual smoke test**: Run the tool against a single stock (`--code=SZ300319`) and verify:
   - Screenshots are captured with correct content
   - DeepSeek receives the screenshots and returns analysis
   - Result file is generated with correct format
   - State file is updated correctly

2. **Resume test**: Start a run, interrupt it after 2-3 stocks, restart, and verify it skips completed stocks

3. **Error handling test**: Test with an invalid stock code to verify graceful failure

4. **Selector validation**: After initial implementation, manually inspect the Xueqiu and DeepSeek pages to verify CSS selectors are correct. These selectors are the primary fragility point and will need periodic maintenance.

## Out of Scope

- **DeepSeek API integration**: The user explicitly chose web interface over API
- **akshare data + self-rendered charts**: The user explicitly chose Xueqiu web screenshots
- **Automated scheduling (cron)**: Will be added manually after the tool is verified working
- **Multi-browser support**: Only Chrome (via CDP) is supported
- **Stock screening/filtering**: All 50 hot stocks are processed; no pre-filtering
- **Real-time monitoring**: This is a batch tool, not a live dashboard
- **Portfolio tracking**: Only generates analysis, does not track positions or P&L
- **Notification/alerting**: No push notifications when complete (future enhancement)

## Further Notes

### Known Fragility Points

1. **Xueqiu page selectors**: The CSS selectors for stock list, chart area, and tab buttons are based on current page structure. Xueqiu may redesign their UI, requiring selector updates.
2. **DeepSeek DOM selectors**: The chat interface selectors (file upload, send button, response extraction) are based on current DeepSeek UI. These are especially likely to change.
3. **Timing dependencies**: All wait times are heuristic. Slow network or heavy page load may cause failures. The tool should be conservative with timing.

### Future Enhancements (Not in this PRD)

- Add cron-based daily scheduling
- Push notification (email/WeChat) when complete
- Historical comparison (compare today's verdict with yesterday's)
- Export to Excel/CSV format
- Support for custom stock lists (not just hot stocks)
