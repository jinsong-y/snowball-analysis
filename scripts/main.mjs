#!/usr/bin/env node
// ============================================================
// 雪球热股分析工作流 - 主入口 (v2: 状态管理 + 进度ETA)
// ============================================================
// 步骤:
//   1. 连接浏览器
//   2. 抓取雪球热股列表
//   3. 逐只股票截图日K/周K
//   4. 逐只发送截图到 DeepSeek 进行 AI 分析
//   5. 保存每只股票的分析结果
//   6. 生成汇总表
//
// 特性:
//   - 状态管理: state-YYYY-MM-DD.json 断点续传
//   - 进度显示: 实时进度 + ETA 预估
//   - 参数支持: --code, --start, --count
// ============================================================

import path from 'path';
import { PATHS, today } from './config.mjs';
import { connectBrowser } from './browser.mjs';
import { scrapeHotStocks } from './scraper.mjs';
import { screenshotStock } from './screenshot.mjs';
import { analyzeStock } from './deepseek.mjs';
import { saveResult } from './result.mjs';
import { generateSummary } from './summary.mjs';
import { loadState, saveState, updateStockStatus, getPendingStocks } from './state.mjs';
import { createProgressTracker } from './progress.mjs';

// ---- 工具函数 ----

function log(msg) {
  const ts = new Date().toLocaleTimeString('zh-CN');
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 解析命令行参数
 * @returns {{code?: string, start?: number, count?: number}}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};

  for (const arg of args) {
    const codeMatch = arg.match(/^--code=(.+)$/);
    const startMatch = arg.match(/^--start=(\d+)$/);
    const countMatch = arg.match(/^--count=(\d+)$/);

    if (codeMatch) result.code = codeMatch[1].trim();
    if (startMatch) result.start = parseInt(startMatch[1], 10);
    if (countMatch) result.count = parseInt(countMatch[1], 10);
  }

  return result;
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  const { code: targetCode, start = 0, count } = parseArgs();
  const date = today();

  log(`日期: ${date}`);

  // --- 1. 加载/初始化状态 ---
  const state = await loadState(date);
  log(`状态文件已加载 (已注册 ${Object.keys(state.stocks).length} 只股票)`);

  // --- 2. 连接浏览器 ---
  log('连接浏览器...');
  const { context, page } = await connectBrowser();

  try {
    // --- 3. 获取股票列表 ---
    let stocks;
    if (targetCode) {
      // 指定股票模式
      stocks = [{
        code: targetCode,
        name: targetCode,
        url: `https://xueqiu.com/S/${targetCode}`,
      }];
      log(`指定股票模式: ${targetCode}`);
    } else {
      log('抓取雪球热股列表...');
      stocks = await scrapeHotStocks(page);
      log(`抓取完成，共 ${stocks.length} 只股票`);

      // 注册所有股票到状态文件（仅新增的）
      for (const stock of stocks) {
        if (!state.stocks[stock.code]) {
          updateStockStatus(state, stock.code, 'pending', { name: stock.name });
        }
      }
      await saveState(state, date);
    }

    // --- 4. 确定待处理列表 ---
    let pendingStocks;
    if (targetCode) {
      // 指定股票模式：不检查状态，直接处理
      pendingStocks = stocks;
    } else {
      // 断点续传：只处理非 done 的
      const pendingCodes = new Set(getPendingStocks(state).map(s => s.code));
      pendingStocks = stocks.filter(s => pendingCodes.has(s.code));

      // 应用 start/count 参数切片
      if (start > 0 || count !== undefined) {
        pendingStocks = pendingStocks.slice(start, count !== undefined ? start + count : undefined);
      }

      const skippedCount = stocks.length - pendingStocks.length;
      if (skippedCount > 0) {
        log(`跳过已完成: ${skippedCount} 只，待处理: ${pendingStocks.length} 只`);
      }
    }

    if (pendingStocks.length === 0) {
      log('没有待处理的股票，退出');
      return;
    }

    // --- 5. 创建进度跟踪器 ---
    const tracker = createProgressTracker(pendingStocks.length);
    log(`本次处理 ${pendingStocks.length} 只股票\n`);

    const allResults = [];

    // --- 6. 逐只处理: 截图 → 分析 → 保存 ---
    for (let i = 0; i < pendingStocks.length; i++) {
      const stock = pendingStocks[i];
      const stockStartTime = Date.now();

      console.log(`\n${'='.repeat(60)}`);
      tracker.tick(stock.name, stock.code, '截图中...');
      console.log('='.repeat(60));

      try {
        // 截图
        const screenshots = await screenshotStock(page, stock, i, date);
        updateStockStatus(state, stock.code, 'screenshots_done', {
          name: stock.name,
          screenshots,
        });
        await saveState(state, date);

        // DeepSeek 分析
        tracker.tick(stock.name, stock.code, 'AI 分析中...');
        updateStockStatus(state, stock.code, 'analyzing');
        await saveState(state, date);

        const screenshotPaths = [screenshots.dayScreenshot, screenshots.weekScreenshot];
        const analysis = await analyzeStock(page, stock, screenshotPaths);

        // 保存结果
        const { filePath, conclusion } = await saveResult(stock, analysis, screenshots, date, i);
        allResults.push({ stock, resultFile: filePath, conclusion });

        // 标记完成
        const duration = Date.now() - stockStartTime;
        updateStockStatus(state, stock.code, 'done', {
          resultFile: filePath,
          conclusion,
        });
        await saveState(state, date);

        tracker.tick(stock.name, stock.code, 'done', duration);
        tracker.summary();

      } catch (err) {
        // 单只股票失败，记录错误，继续下一只
        log(`  [错误] ${stock.code} 处理失败: ${err.message}`);
        allResults.push({
          stock,
          resultFile: '',
          conclusion: `处理失败: ${err.message}`,
        });
        updateStockStatus(state, stock.code, 'pending', { error: err.message });
        await saveState(state, date);
      }

      // 间隔，避免频率限制
      if (i < pendingStocks.length - 1) {
        log('等待 5 秒后处理下一只...');
        await sleep(5000);
      }
    }

    // --- 7. 生成汇总 ---
    const successfulResults = allResults.filter(r => r.resultFile);
    if (successfulResults.length > 0) {
      const summaryPath = await generateSummary(allResults, date);
      log(`\n汇总已生成: ${summaryPath}`);
    } else {
      log('\n没有成功的分析结果，跳过汇总生成');
    }

    log(`\n全部完成! 成功 ${successfulResults.length}/${pendingStocks.length} 只`);

  } catch (err) {
    console.error('工作流执行失败:', err);
    process.exit(1);
  } finally {
    log('关闭浏览器...');
    await context.close();
  }
}

main();
