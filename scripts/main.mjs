#!/usr/bin/env node
// ============================================================
// 雪球热股分析工作流 - 主入口
// ============================================================
// 步骤:
//   1. 打开雪球热股页面，抓取 Top50 股票列表
//   2. 写入本地 md 文件（按日期命名）
//   3. 逐只股票打开日K/周K截图
//   4. 将截图发给 DeepSeek 进行 AI 选股分析
//   5. 将分析结果保存到本地文件
// ============================================================

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { PATHS, XUEQIU, DEEPSEEK, BROWSER, ANALYSIS_PROMPT, today } from './config.mjs';

// ---- 工具函数 ----

function log(msg) {
  const ts = new Date().toLocaleTimeString('zh-CN');
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---- 确保目录存在 ----
async function ensureDirs() {
  for (const d of [PATHS.screenshots, PATHS.results, PATHS.resultsDir]) {
    await fs.mkdir(d, { recursive: true });
  }
}

// ---- 启动浏览器 ----
async function launchBrowser() {
  log('启动浏览器...');
  const context = await chromium.launchPersistentContext(BROWSER.userDataDir, {
    headless: BROWSER.headless,
    slowMo: BROWSER.slowMo,
    viewport: BROWSER.viewport,
    args: ['--disable-blink-features=AutomationControlled'],
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  return { context, page };
}

// ============================================================
// 第一步：抓取雪球热股 Top50
// ============================================================
async function scrapeHotStocks(page) {
  log('打开雪球热股页面...');
  await page.goto(XUEQIU.hotUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  await sleep(3000);

  // 等待股票列表加载
  log('等待股票列表加载...');
  // 雪球热股页面可能有多种结构，尝试多种选择器
  const selectors = [
    'table tbody tr',
    '.stock-table tr',
    '[class*="stock"] [class*="row"]',
    '[class*="hot"] [class*="item"]',
    'a[href*="/S/"]',
  ];

  let stocks = [];

  // 先尝试通用方法：提取所有包含股票代码的链接
  log('提取股票数据...');
  stocks = await page.evaluate(() => {
    const results = [];
    // 方法1: 从表格提取
    const rows = document.querySelectorAll('table tbody tr, [class*="table"] tr, [class*="row"]');
    for (const row of rows) {
      const link = row.querySelector('a[href*="/S/"]');
      if (link) {
        const href = link.getAttribute('href');
        const code = href.match(/\/S\/([A-Z]{2}\d+)/)?.[1];
        const nameEl = row.querySelector('[class*="name"], td:nth-child(2), .stock-name');
        const name = nameEl?.textContent?.trim() || link.textContent?.trim() || '';
        if (code && name) {
          results.push({ code, name, url: `https://xueqiu.com${href}` });
        }
      }
    }

    // 方法2: 如果表格方法失败，从所有链接提取
    if (results.length === 0) {
      const links = document.querySelectorAll('a[href*="/S/"]');
      const seen = new Set();
      for (const link of links) {
        const href = link.getAttribute('href');
        const code = href.match(/\/S\/([A-Z]{2}\d+)/)?.[1];
        if (code && !seen.has(code)) {
          seen.add(code);
          const name = link.textContent?.trim() || '';
          results.push({ code, name, url: `https://xueqiu.com${href}` });
        }
      }
    }

    return results;
  });

  // 如果页面需要滚动加载更多
  if (stocks.length < 50) {
    log(`当前获取 ${stocks.length} 只，尝试滚动加载更多...`);
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await sleep(1500);
      const more = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/S/"]');
        const results = [];
        const seen = new Set();
        for (const link of links) {
          const href = link.getAttribute('href');
          const code = href.match(/\/S\/([A-Z]{2}\d+)/)?.[1];
          if (code && !seen.has(code)) {
            seen.add(code);
            results.push({ code, name: link.textContent?.trim() || '', url: `https://xueqiu.com${href}` });
          }
        }
        return results;
      });
      stocks = more;
      if (stocks.length >= 50) break;
    }
  }

  // 去重并取前50
  const seen = new Set();
  stocks = stocks.filter(s => {
    if (seen.has(s.code)) return false;
    seen.add(s.code);
    return true;
  }).slice(0, XUEQIU.topN);

  log(`成功获取 ${stocks.length} 只热股`);
  return stocks;
}

// ---- 写入股票列表到 md 文件 ----
async function writeStockList(stocks) {
  const date = today();
  let md = `# 雪球热股 Top ${stocks.length} - ${date}\n\n`;
  md += `> 数据来源: ${XUEQIU.hotUrl}\n\n`;
  md += `| 排名 | 代码 | 名称 | 雪球链接 |\n`;
  md += `|------|------|------|----------|\n`;
  stocks.forEach((s, i) => {
    md += `| ${i + 1} | ${s.code} | ${s.name} | [查看](${s.url}) |\n`;
  });

  await fs.writeFile(PATHS.stockList, md, 'utf-8');
  log(`股票列表已写入: ${PATHS.stockList}`);
  return PATHS.stockList;
}

// ============================================================
// 第二步：截图日K/周K
// ============================================================
async function screenshotStock(page, stock, index) {
  const date = today();
  const safeName = stock.name.replace(/[/\\:*?"<>|]/g, '_');
  const prefix = `${String(index + 1).padStart(2, '0')}_${stock.code}_${safeName}`;

  log(`[${index + 1}] 正在截图: ${stock.name} (${stock.code})`);

  // --- 日K截图 ---
  try {
    log(`  打开日K: ${stock.url}`);
    await page.goto(stock.url, { waitUntil: 'networkidle', timeout: 30_000 });
    await sleep(3000);

    // 确保在日K视图
    const dayBtn = await page.$('[class*="day"], [data-period="day"], text="日K"');
    if (dayBtn) {
      await dayBtn.click();
      await sleep(2000);
    }

    // 尝试展开MACD指标
    const macdBtn = await page.$('text="MACD", [class*="macd"], [data-indicator="MACD"]');
    if (macdBtn) {
      await macdBtn.click();
      await sleep(1500);
    }

    // 截取K线图区域
    const chartArea = await page.$('[class*="chart"], [class*="kline"], canvas, svg');
    const dayPath = path.join(PATHS.screenshots, `${date}_${prefix}_日K.png`);

    if (chartArea) {
      await chartArea.screenshot({ path: dayPath });
    } else {
      // 截取整个页面主体
      await page.screenshot({ path: dayPath, fullPage: false });
    }
    log(`  日K截图已保存: ${dayPath}`);
  } catch (err) {
    log(`  日K截图失败: ${err.message}`);
  }

  // --- 周K截图 ---
  try {
    // 切换到周K
    const weekBtn = await page.$('[class*="week"], [data-period="week"], text="周K", text="周"');
    if (weekBtn) {
      await weekBtn.click();
      await sleep(3000);
    } else {
      // 尝试从URL切换
      const weekUrl = stock.url + (stock.url.includes('?') ? '&' : '?') + 'period=week';
      await page.goto(weekUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await sleep(3000);
    }

    const chartArea2 = await page.$('[class*="chart"], [class*="kline"], canvas, svg');
    const weekPath = path.join(PATHS.screenshots, `${date}_${prefix}_周K.png`);

    if (chartArea2) {
      await chartArea2.screenshot({ path: weekPath });
    } else {
      await page.screenshot({ path: weekPath, fullPage: false });
    }
    log(`  周K截图已保存: ${weekPath}`);
  } catch (err) {
    log(`  周K截图失败: ${err.message}`);
  }

  return {
    dayScreenshot: path.join(PATHS.screenshots, `${date}_${prefix}_日K.png`),
    weekScreenshot: path.join(PATHS.screenshots, `${date}_${prefix}_周K.png`),
  };
}

// ============================================================
// 第三步：发送截图到 DeepSeek 进行分析
// ============================================================
async function analyzeWithDeepSeek(page, stock, screenshots) {
  log(`  打开 DeepSeek 分析: ${stock.name}`);

  try {
    // 打开 DeepSeek
    await page.goto(DEEPSEEK.chatUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await sleep(3000);

    // 查找输入框和上传按钮
    const inputArea = await page.$('textarea, [contenteditable="true"], [class*="input"]');
    const uploadBtn = await page.$('input[type="file"], [class*="upload"], [class*="attach"]');

    // 上传截图
    const filesToUpload = [screenshots.dayScreenshot, screenshots.weekScreenshot];
    for (const filePath of filesToUpload) {
      try {
        await fs.access(filePath);
        if (uploadBtn) {
          await uploadBtn.setInputFiles(filePath);
          await sleep(2000);
          log(`  已上传: ${path.basename(filePath)}`);
        }
      } catch {
        log(`  文件不存在，跳过: ${filePath}`);
      }
    }

    // 输入提示词
    if (inputArea) {
      const prompt = `${ANALYSIS_PROMPT}\n\n请分析【${stock.name}（${stock.code}）】的日K和周K截图。`;
      await inputArea.fill(prompt);
      await sleep(1000);

      // 发送
      const sendBtn = await page.$('[class*="send"], [type="submit"], button:has-text("发送")');
      if (sendBtn) {
        await sendBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      log('  已发送分析请求，等待AI回复...');

      // 等待回复完成
      await waitForDeepSeekResponse(page);
    }

    // 提取回复内容
    const response = await extractDeepSeekResponse(page);
    return response;

  } catch (err) {
    log(`  DeepSeek 分析失败: ${err.message}`);
    return `分析失败: ${err.message}`;
  }
}

// ---- 等待 DeepSeek 回复 ----
async function waitForDeepSeekResponse(page) {
  const start = Date.now();
  let lastLen = 0;
  let stableCount = 0;

  while (Date.now() - start < DEEPSEEK.responseTimeout) {
    await sleep(DEEPSEEK.pollInterval);

    // 检查是否有停止按钮（表示还在生成）
    const stopBtn = await page.$('[class*="stop"], [class*="Stop"], button:has-text("停止")');
    if (!stopBtn) {
      // 没有停止按钮，可能已完成
      stableCount++;
      if (stableCount >= 3) break;
    } else {
      stableCount = 0;
    }
  }

  // 额外等待确保渲染完成
  await sleep(2000);
  log('  AI回复完成');
}

// ---- 提取 DeepSeek 回复 ----
async function extractDeepSeekResponse(page) {
  const response = await page.evaluate(() => {
    // 尝试多种选择器获取最后一条AI回复
    const selectors = [
      '[class*="message"][class*="assistant"]',
      '[class*="bot-message"]',
      '[class*="ai-message"]',
      '[class*="response"]',
      '[data-role="assistant"]',
    ];

    for (const sel of selectors) {
      const msgs = document.querySelectorAll(sel);
      if (msgs.length > 0) {
        return msgs[msgs.length - 1].textContent?.trim() || '';
      }
    }

    // 回退：获取页面中最后的大段文本
    const allDivs = document.querySelectorAll('div');
    let longest = '';
    for (const div of allDivs) {
      const text = div.textContent?.trim() || '';
      if (text.length > longest.length && text.length > 200) {
        longest = text;
      }
    }
    return longest;
  });

  return response || '未能提取到AI回复内容';
}

// ---- 保存分析结果 ----
async function saveResult(stock, analysis) {
  const date = today();
  const safeName = stock.name.replace(/[/\\:*?"<>|]/g, '_');
  const filename = `${date}_${stock.code}_${safeName}.md`;
  const filePath = path.join(PATHS.resultsDir, filename);

  let md = `# ${stock.name}（${stock.code}）- AI选股分析\n\n`;
  md += `> 分析日期: ${date}\n`;
  md += `> 数据来源: ${XUEQIU.stockUrl(stock.code)}\n\n`;
  md += `---\n\n`;
  md += analysis;

  await fs.writeFile(filePath, md, 'utf-8');
  log(`  结果已保存: ${filePath}`);
  return filePath;
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const stepArg = args.find(a => a.startsWith('--step='));
  const step = stepArg?.split('=')[1] || 'all';

  await ensureDirs();
  const { context, page } = await launchBrowser();

  try {
    // --- 步骤1: 抓取热股列表 ---
    let stocks;
    if (step === 'all' || step === 'scrape') {
      stocks = await scrapeHotStocks(page);
      await writeStockList(stocks);
      log(`===== 抓取完成，共 ${stocks.length} 只股票 =====\n`);
    }

    // --- 步骤2 & 3: 逐只截图 + 分析 ---
    if (step === 'all' || step === 'analyze') {
      // 如果只执行分析步骤，从文件读取股票列表
      if (!stocks) {
        log('从文件读取股票列表...');
        const content = await fs.readFile(PATHS.stockList, 'utf-8');
        stocks = [];
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/\|\s*\d+\s*\|\s*([A-Z]{2}\d+)\s*\|\s*(.+?)\s*\|\s*\[查看\]\((.+?)\)/);
          if (match) {
            stocks.push({ code: match[1], name: match[2].trim(), url: match[3] });
          }
        }
        log(`读取到 ${stocks.length} 只股票`);
      }

      const allResults = [];

      for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];
        console.log(`\n${'='.repeat(60)}`);
        log(`处理 [${i + 1}/${stocks.length}]: ${stock.name} (${stock.code})`);
        console.log('='.repeat(60));

        // 截图
        const screenshots = await screenshotStock(page, stock, i);

        // DeepSeek 分析
        const analysis = await analyzeWithDeepSeek(page, stock, screenshots);

        // 保存结果
        const resultFile = await saveResult(stock, analysis);
        allResults.push({ stock, resultFile });

        // 每只股票间隔，避免频率限制
        if (i < stocks.length - 1) {
          log('等待 5 秒后处理下一只...');
          await sleep(5000);
        }
      }

      // 写入汇总文件
      const summaryPath = path.join(PATHS.resultsDir, `汇总_${today()}.md`);
      let summary = `# 雪球热股 AI 分析汇总 - ${today()}\n\n`;
      summary += `| 排名 | 代码 | 名称 | 分析结果 |\n`;
      summary += `|------|------|------|----------|\n`;
      allResults.forEach((r, i) => {
        summary += `| ${i + 1} | ${r.stock.code} | ${r.stock.name} | [查看](${r.resultFile}) |\n`;
      });
      await fs.writeFile(summaryPath, summary, 'utf-8');
      log(`\n===== 全部完成！汇总: ${summaryPath} =====`);
    }

  } catch (err) {
    console.error('工作流执行失败:', err);
    process.exit(1);
  } finally {
    log('关闭浏览器...');
    await context.close();
  }
}

main();
