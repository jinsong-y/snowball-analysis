// ============================================================
// 分析汇总表生成模块
// ============================================================

import fs from 'fs/promises';
import path from 'path';
import { PATHS } from './config.mjs';

/**
 * 生成汇总表 Markdown 文件
 * @param {Array<{stock: {code: string, name: string}, resultFile: string, conclusion: string}>} results
 * @param {string} date - 日期字符串 YYYY-MM-DD
 * @returns {Promise<string>} 汇总文件路径
 */
export async function generateSummary(results, date) {
  const resultsDir = path.join(PATHS.results, date);
  await fs.mkdir(resultsDir, { recursive: true });

  const summaryPath = path.join(resultsDir, `汇总_${date}.md`);

  let md = `# 雪球热股 AI 分析汇总 - ${date}\n\n`;
  md += `> 共分析 ${results.length} 只股票\n\n`;
  md += `| 排名 | 代码 | 名称 | 定性结论 | 详情 |\n`;
  md += `|------|------|------|----------|------|\n`;

  results.forEach((r, i) => {
    const seq = i + 1;
    const detailFilename = path.basename(r.resultFile);
    md += `| ${seq} | ${r.stock.code} | ${r.stock.name} | ${r.conclusion} | [查看](${detailFilename}) |\n`;
  });

  md += `\n## 结论统计\n\n`;

  // 按定性结论分组统计
  const groups = {};
  for (const r of results) {
    const c = r.conclusion || '未分析';
    if (!groups[c]) groups[c] = [];
    groups[c].push(r.stock.name);
  }
  for (const [conclusion, names] of Object.entries(groups)) {
    md += `- **${conclusion}** (${names.length}只): ${names.join('、')}\n`;
  }

  md += `\n---\n\n`;
  md += `*生成时间: ${new Date().toLocaleString('zh-CN')}*\n`;

  await fs.writeFile(summaryPath, md, 'utf-8');
  return summaryPath;
}
