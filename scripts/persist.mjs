// ============================================================
// 股票列表持久化模块 - 读写 Markdown 文件
// ============================================================

import fs from 'fs/promises';
import path from 'path';
import { XUEQIU } from './config.mjs';

/**
 * 将股票列表写入 Markdown 文件
 * @param {Array<{code: string, name: string, url: string}>} stocks
 * @param {string} date - 日期字符串 YYYY-MM-DD
 * @returns {Promise<string>} 写入的文件路径
 */
export async function writeStockList(stocks, date) {
  const filePath = path.resolve(`hot-stocks-${date}.md`);

  let md = `# 雪球热股 Top ${stocks.length} - ${date}\n\n`;
  md += `> 数据来源: ${XUEQIU.hotUrl}\n\n`;
  md += `| 排名 | 代码 | 名称 | 雪球链接 |\n`;
  md += `|------|------|------|----------|\n`;
  stocks.forEach((s, i) => {
    md += `| ${i + 1} | ${s.code} | ${s.name} | [查看](${s.url}) |\n`;
  });

  await fs.writeFile(filePath, md, 'utf-8');
  return filePath;
}

/**
 * 从 Markdown 文件解析股票列表
 * @param {string} date - 日期字符串 YYYY-MM-DD
 * @returns {Promise<Array<{code: string, name: string, url: string}>>}
 */
export async function readStockList(date) {
  const filePath = path.resolve(`hot-stocks-${date}.md`);
  const content = await fs.readFile(filePath, 'utf-8');

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
