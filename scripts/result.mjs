// ============================================================
// 单只股票分析结果保存模块
// ============================================================

import fs from 'fs/promises';
import path from 'path';
import { PATHS, today } from './config.mjs';

/**
 * 将文件名中的特殊字符替换为下划线，确保文件系统安全
 * @param {string} name - 原始名称
 * @returns {string} 安全的文件名
 */
export function sanitizeFilename(name) {
  return name.replace(/[/\\:*?"<>|\s]/g, '_');
}

/**
 * 从 AI 分析文本中提取定性结论
 * 匹配"稳健低吸"、"短线博弈"、"直接放弃"等关键词
 * @param {string} analysis - AI 分析全文
 * @returns {string} 定性结论
 */
export function extractConclusion(analysis) {
  if (!analysis) return '未分析';

  // 匹配常见定性结论模式
  const patterns = [
    /稳健低吸/,
    /短线博弈/,
    /短线试错/,
    /直接放弃/,
    /建议买入/,
    /建议观望/,
    /建议卖出/,
    /强烈推荐/,
    /谨慎操作/,
    /等待确认/,
  ];

  for (const p of patterns) {
    const match = analysis.match(p);
    if (match) return match[0];
  }

  // 尝试匹配"定性建议"或"最终定论"后面的内容
  const conclusionMatch = analysis.match(/(?:定性建议|最终定论|综合建议|操作建议)[：:]\s*(.+)/);
  if (conclusionMatch) {
    return conclusionMatch[1].trim().substring(0, 20);
  }

  return '待分析';
}

/**
 * 保存单只股票的分析结果为 Markdown 文件
 * @param {{code: string, name: string, url?: string}} stock - 股票信息
 * @param {string} analysis - AI 分析全文
 * @param {{dayScreenshot: string, weekScreenshot: string}} screenshots - 截图路径
 * @param {string} [date] - 日期字符串，默认今天
 * @param {number} [index=0] - 序号（从0开始）
 * @returns {Promise<{filePath: string, conclusion: string}>}
 */
export async function saveResult(stock, analysis, screenshots, date, index = 0) {
  const resolvedDate = date || today();
  const resultsDir = path.join(PATHS.results, resolvedDate);
  await fs.mkdir(resultsDir, { recursive: true });

  const safeName = sanitizeFilename(stock.name);
  const seq = String(index + 1).padStart(2, '0');
  const filename = `${seq}_${stock.code}_${safeName}.md`;
  const filePath = path.join(resultsDir, filename);

  const conclusion = extractConclusion(analysis);

  let md = `# ${stock.name}（${stock.code}）- AI 选股分析\n\n`;
  md += `## 元数据\n\n`;
  md += `| 项目 | 内容 |\n`;
  md += `|------|------|\n`;
  md += `| 股票代码 | ${stock.code} |\n`;
  md += `| 股票名称 | ${stock.name} |\n`;
  md += `| 分析日期 | ${resolvedDate} |\n`;
  if (stock.url) {
    md += `| 数据来源 | [雪球](${stock.url}) |\n`;
  }
  md += `| 定性结论 | ${conclusion} |\n\n`;

  md += `## K 线截图\n\n`;
  if (screenshots?.dayScreenshot) {
    const dayName = path.basename(screenshots.dayScreenshot);
    md += `### 日 K\n\n![日K截图](../../screenshots/${dayName})\n\n`;
  }
  if (screenshots?.weekScreenshot) {
    const weekName = path.basename(screenshots.weekScreenshot);
    md += `### 周 K\n\n![周K截图](../../screenshots/${weekName})\n\n`;
  }

  md += `## AI 分析\n\n`;
  md += analysis || '暂无分析结果';
  md += `\n\n`;

  md += `## 操作建议\n\n`;
  md += `> 以下为人工操作记录区域，请根据 AI 分析和个人判断填写。\n\n`;
  md += `- [ ] 确认买入\n`;
  md += `- [ ] 设置止损点: ____\n`;
  md += `- [ ] 设置止盈点: ____\n`;
  md += `- [ ] 备注: ____\n`;

  await fs.writeFile(filePath, md, 'utf-8');
  return { filePath, conclusion };
}
