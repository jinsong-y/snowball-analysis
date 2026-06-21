#!/usr/bin/env node
// ============================================================
// 批量处理模式 - 支持分批处理、断点续传
// 用法:
//   node scripts/batch.mjs              # 处理全部50只
//   node scripts/batch.mjs --start=10   # 从第10只开始
//   node scripts/batch.mjs --count=5    # 只处理5只
//   node scripts/batch.mjs --code=SH600519  # 只处理指定股票
// ============================================================

import fs from 'fs/promises';
import path from 'path';
import { PATHS, XUEQIU, DEEPSEEK, BROWSER, ANALYSIS_PROMPT, today } from './config.mjs';
import { connectBrowser } from './browser.mjs';

function log(msg) {
  const ts = new Date().toLocaleTimeString('zh-CN');
  console.log(`[${ts}] ${msg}`);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ensureDirs() {
  for (const d of [PATHS.screenshots, PATHS.results, PATHS.resultsDir]) {
    await fs.mkdir(d, { recursive: true });
  }
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { start: 0, count: 999, code: null };
  for (const a of args) {
    if (a.startsWith('--start=')) opts.start = parseInt(a.split('=')[1]);
    if (a.startsWith('--count=')) opts.count = parseInt(a.split('=')[1]);
    if (a.startsWith('--code=')) opts.code = a.split('=')[1];
  }
  return opts;
}

// 检查是否已有结果文件
async function hasResult(stockCode, stockName) {
  const date = today();
  const safeName = stockName.replace(/[/\\:*?"<>|]/g, '_');
  const filename = `${date}_${stockCode}_${safeName}.md`;
  const filePath = path.join(PATHS.resultsDir, filename);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// 从股票列表文件读取
async function readStockList() {
  const content = await fs.readFile(PATHS.stockList, 'utf-8');
  const stocks = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/\|\s*\d+\s*\|\s*([A-Z]{2}\d+)\s*\|\s*(.+?)\s*\|\s*\[查看\]\((.+?)\)/);
    if (match) {
      stocks.push({ code: match[1], name: match[2].trim(), url: match[3] });
    }
  }
  return stocks;
}

// 截图单只股票
async function screenshotStock(page, stock, index) {
  const date = today();
  const safeName = stock.name.replace(/[/\\:*?"<>|]/g, '_');
  const prefix = `${String(index + 1).padStart(2, '0')}_${stock.code}_${safeName}`;

  log(`[${index + 1}] 截图: ${stock.name} (${stock.code})`);

  const result = { dayScreenshot: null, weekScreenshot: null };

  // --- 日K ---
  try {
    await page.goto(stock.url, { waitUntil: 'networkidle', timeout: 30_000 });
    await sleep(3000);

    // 点击日K
    const dayBtn = await page.$('text="日K"');
    if (dayBtn) { await dayBtn.click(); await sleep(2000); }

    // 展开MACD
    const macdBtn = await page.$('text="MACD"');
    if (macdBtn) { await macdBtn.click(); await sleep(1500); }

    const dayPath = path.join(PATHS.screenshots, `${date}_${prefix}_日K.png`);
    const chart = await page.$('[class*="chart"], canvas, svg');
    if (chart) {
      await chart.screenshot({ path: dayPath });
    } else {
      await page.screenshot({ path: dayPath, fullPage: false });
    }
    result.dayScreenshot = dayPath;
    log(`  日K ✓`);
  } catch (err) {
    log(`  日K ✗: ${err.message}`);
  }

  // --- 周K ---
  try {
    const weekBtn = await page.$('text="周K"');
    if (weekBtn) {
      await weekBtn.click();
      await sleep(3000);
    }

    const weekPath = path.join(PATHS.screenshots, `${date}_${prefix}_周K.png`);
    const chart = await page.$('[class*="chart"], canvas, svg');
    if (chart) {
      await chart.screenshot({ path: weekPath });
    } else {
      await page.screenshot({ path: weekPath, fullPage: false });
    }
    result.weekScreenshot = weekPath;
    log(`  周K ✓`);
  } catch (err) {
    log(`  周K ✗: ${err.message}`);
  }

  return result;
}

// DeepSeek 分析
async function analyzeWithDeepSeek(page, stock, screenshots) {
  log(`  DeepSeek 分析: ${stock.name}`);

  try {
    await page.goto(DEEPSEEK.chatUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await sleep(3000);

    // 上传文件
    const fileInput = await page.$('input[type="file"]');
    const files = [screenshots.dayScreenshot, screenshots.weekScreenshot].filter(Boolean);

    if (fileInput && files.length > 0) {
      await fileInput.setInputFiles(files);
      await sleep(3000);
      log(`  已上传 ${files.length} 张截图`);
    }

    // 输入提示词
    const textarea = await page.$('textarea, [contenteditable="true"]');
    if (textarea) {
      const prompt = `${ANALYSIS_PROMPT}\n\n请分析【${stock.name}（${stock.code}）】的日K和周K截图。`;
      await textarea.fill(prompt);
      await sleep(1000);

      // 发送 (Ctrl+Enter 或点击按钮)
      const sendBtn = await page.$('[class*="send"], [aria-label*="send"]');
      if (sendBtn) {
        await sendBtn.click();
      } else {
        await page.keyboard.press('Meta+Enter');
      }
      log('  等待AI回复...');

      // 等待回复
      const start = Date.now();
      let stable = 0;
      while (Date.now() - start < DEEPSEEK.responseTimeout) {
        await sleep(DEEPSEEK.pollInterval);
        const stopBtn = await page.$('[class*="stop"], [class*="Stop"]');
        if (!stopBtn) { stable++; if (stable >= 3) break; }
        else stable = 0;
      }
      await sleep(2000);
    }

    // 提取回复
    const response = await page.evaluate(() => {
      const sels = ['[class*="message"][class*="assistant"]', '[data-role="assistant"]', '[class*="bot"]'];
      for (const sel of sels) {
        const msgs = document.querySelectorAll(sel);
        if (msgs.length > 0) return msgs[msgs.length - 1].textContent?.trim() || '';
      }
      return '';
    });

    return response || '未能提取AI回复';

  } catch (err) {
    log(`  DeepSeek 失败: ${err.message}`);
    return `分析失败: ${err.message}`;
  }
}

// 保存结果
async function saveResult(stock, analysis) {
  const date = today();
  const safeName = stock.name.replace(/[/\\:*?"<>|]/g, '_');
  const filename = `${date}_${stock.code}_${safeName}.md`;
  const filePath = path.join(PATHS.resultsDir, filename);

  let md = `# ${stock.name}（${stock.code}）- AI选股分析\n\n`;
  md += `> 分析日期: ${date}\n`;
  md += `> 数据来源: ${stock.url}\n\n---\n\n`;
  md += analysis;

  await fs.writeFile(filePath, md, 'utf-8');
  log(`  结果保存: ${filePath}`);
  return filePath;
}

// ============================================================
async function main() {
  const opts = parseArgs();
  await ensureDirs();

  // 检查股票列表是否存在
  try {
    await fs.access(PATHS.stockList);
  } catch {
    console.error(`股票列表文件不存在: ${PATHS.stockList}`);
    console.error('请先运行: npm run scrape');
    process.exit(1);
  }

  let stocks = await readStockList();
  log(`共 ${stocks.length} 只股票`);

  // 过滤
  if (opts.code) {
    stocks = stocks.filter(s => s.code === opts.code);
    if (stocks.length === 0) {
      console.error(`未找到股票: ${opts.code}`);
      process.exit(1);
    }
  }

  // 切片
  stocks = stocks.slice(opts.start, opts.start + opts.count);
  log(`本次处理: ${stocks.length} 只 (从第 ${opts.start + 1} 只开始)\n`);

  // 连接浏览器
  log('连接浏览器...');
  const { context, page } = await connectBrowser();

  const results = [];

  try {
    for (let i = 0; i < stocks.length; i++) {
      const stock = stocks[i];
      const globalIdx = opts.start + i;

      // 跳过已有结果的
      if (opts.code === null && await hasResult(stock.code, stock.name)) {
        log(`[${globalIdx + 1}] ${stock.name} 已有结果，跳过`);
        continue;
      }

      console.log(`\n${'─'.repeat(50)}`);
      log(`[${globalIdx + 1}/${opts.start + stocks.length}] ${stock.name} (${stock.code})`);

      // 截图
      const screenshots = await screenshotStock(page, stock, globalIdx);

      // 分析
      const analysis = await analyzeWithDeepSeek(page, stock, screenshots);

      // 保存
      const file = await saveResult(stock, analysis);
      results.push({ stock, file });

      // 间隔
      if (i < stocks.length - 1) {
        log('等待 5 秒...');
        await sleep(5000);
      }
    }
  } finally {
    await context.close();
  }

  // 输出汇总
  if (results.length > 0) {
    console.log(`\n${'='.repeat(50)}`);
    log(`本次完成 ${results.length} 只股票分析:`);
    results.forEach(r => log(`  ✓ ${r.stock.name} → ${r.file}`));
  }
  log('全部完成！');
}

main().catch(err => { console.error(err); process.exit(1); });
