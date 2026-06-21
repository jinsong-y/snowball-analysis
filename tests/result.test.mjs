import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 临时测试目录，避免污染项目
const TEST_RESULTS_DIR = path.join(PROJECT_ROOT, '.test-results');

describe('saveResult', () => {
  let saveResult, extractConclusion, sanitizeFilename;

  before(async () => {
    // 动态导入，修改 PATHS.results 指向临时目录
    const mod = await import('../scripts/result.mjs');
    saveResult = mod.saveResult;
    extractConclusion = mod.extractConclusion;
    sanitizeFilename = mod.sanitizeFilename;

    // 创建临时测试目录
    await fs.mkdir(TEST_RESULTS_DIR, { recursive: true });

    // 劫持 PATHS.results
    const config = await import('../scripts/config.mjs');
    config.PATHS.results = TEST_RESULTS_DIR;
  });

  after(async () => {
    // 清理临时目录
    await fs.rm(TEST_RESULTS_DIR, { recursive: true, force: true });
  });

  // ---- 测试1: saveResult 生成的 md 文件格式正确 ----
  it('should generate a properly formatted md file', async () => {
    const stock = { code: 'SZ300319', name: '麦捷科技', url: 'https://xueqiu.com/S/SZ300319' };
    const analysis = '## 趋势分析\n\n均线多头排列，MACD金叉。\n\n## 定性建议\n\n稳健低吸，目标价位 15.5 元。';
    const screenshots = {
      dayScreenshot: '/tmp/screenshots/2025-06-21_01_SZ300319_麦捷科技_日K.png',
      weekScreenshot: '/tmp/screenshots/2025-06-21_01_SZ300319_麦捷科技_周K.png',
    };
    const date = '2025-06-21';

    const { filePath, conclusion } = await saveResult(stock, analysis, screenshots, date, 0);

    // 验证文件存在
    const stat = await fs.stat(filePath);
    assert.ok(stat.isFile(), 'result file should exist');

    // 验证文件路径格式: results/YYYY-MM-DD/序号_代码_名称.md
    const filename = path.basename(filePath);
    assert.match(filename, /^01_SZ300319_麦捷科技\.md$/, 'filename should match pattern');

    // 验证 md 内容
    const content = await fs.readFile(filePath, 'utf-8');

    // 包含元数据表格
    assert.ok(content.includes('# 麦捷科技（SZ300319）- AI 选股分析'), 'should have title');
    assert.ok(content.includes('## 元数据'), 'should have metadata section');
    assert.ok(content.includes('| 股票代码 | SZ300319 |'), 'should have stock code');
    assert.ok(content.includes('| 股票名称 | 麦捷科技 |'), 'should have stock name');
    assert.ok(content.includes('| 分析日期 | 2025-06-21 |'), 'should have date');

    // 包含截图引用
    assert.ok(content.includes('## K 线截图'), 'should have screenshot section');
    assert.ok(content.includes('![日K截图]'), 'should reference day screenshot');
    assert.ok(content.includes('![周K截图]'), 'should reference week screenshot');

    // 包含 AI 分析全文
    assert.ok(content.includes('## AI 分析'), 'should have analysis section');
    assert.ok(content.includes('均线多头排列'), 'should contain analysis text');
    assert.ok(content.includes('MACD金叉'), 'should contain analysis text');

    // 包含操作建议占位
    assert.ok(content.includes('## 操作建议'), 'should have action section');
    assert.ok(content.includes('- [ ] 确认买入'), 'should have action checklist');

    // 定性结论正确提取
    assert.equal(conclusion, '稳健低吸');
  });

  // ---- 测试2: generateSummary 包含所有股票的定性结论 ----
  it('generateSummary should include all stocks qualitative conclusions', async () => {
    const { generateSummary } = await import('../scripts/summary.mjs');

    // 先创建几只股票的结果文件
    const stocks = [
      { code: 'SH600519', name: '贵州茅台' },
      { code: 'SZ000858', name: '五粮液' },
      { code: 'SZ300750', name: '宁德时代' },
    ];
    const date = '2025-06-21';
    const results = [];

    for (let i = 0; i < stocks.length; i++) {
      const stock = stocks[i];
      const analysis = [
        '稳健低吸，MACD零轴上方金叉',
        '短线博弈，RSI超买需警惕',
        '直接放弃，PE严重高估',
      ][i];
      const screenshots = { dayScreenshot: '/tmp/a.png', weekScreenshot: '/tmp/b.png' };
      const { filePath, conclusion } = await saveResult(stock, analysis, screenshots, date, i);
      results.push({ stock, resultFile: filePath, conclusion });
    }

    // 生成汇总
    const summaryPath = await generateSummary(results, date);
    const content = await fs.readFile(summaryPath, 'utf-8');

    // 验证汇总表结构
    assert.ok(content.includes('# 雪球热股 AI 分析汇总 - 2025-06-21'), 'should have summary title');
    assert.ok(content.includes('共分析 3 只股票'), 'should show total count');
    assert.ok(content.includes('| 排名 | 代码 | 名称 | 定性结论 | 详情 |'), 'should have table header');

    // 验证每只股票都出现在表中
    assert.ok(content.includes('SH600519'), 'should contain stock 1');
    assert.ok(content.includes('贵州茅台'), 'should contain stock 1 name');
    assert.ok(content.includes('SZ000858'), 'should contain stock 2');
    assert.ok(content.includes('五粮液'), 'should contain stock 2 name');
    assert.ok(content.includes('SZ300750'), 'should contain stock 3');
    assert.ok(content.includes('宁德时代'), 'should contain stock 3 name');

    // 验证定性结论都出现
    assert.ok(content.includes('稳健低吸'), 'should contain conclusion 1');
    assert.ok(content.includes('短线博弈'), 'should contain conclusion 2');
    assert.ok(content.includes('直接放弃'), 'should contain conclusion 3');

    // 验证结论统计
    assert.ok(content.includes('## 结论统计'), 'should have conclusion statistics');
    assert.ok(content.includes('**稳健低吸** (1只): 贵州茅台'), 'should group conclusions');
  });

  // ---- 测试3: 文件路径中的特殊字符被正确处理 ----
  it('should sanitize special characters in stock name for filename', async () => {
    const stock = { code: 'SH600036', name: '招商/银行\\A股*测试:问号?引号"尖括号<>管道|', url: '' };
    const analysis = '暂时观望';
    const screenshots = { dayScreenshot: '/tmp/d.png', weekScreenshot: '/tmp/w.png' };
    const date = '2025-06-21';

    const { filePath } = await saveResult(stock, analysis, screenshots, date, 5);

    // 验证文件名中特殊字符被替换为下划线
    const filename = path.basename(filePath);
    assert.match(filename, /^06_SH600036_.*\.md$/, 'should have correct sequence prefix');
    assert.ok(!filename.includes('/'), 'should not contain /');
    assert.ok(!filename.includes('\\'), 'should not contain \\');
    assert.ok(!filename.includes('*'), 'should not contain *');
    assert.ok(!filename.includes(':'), 'should not contain :');
    assert.ok(!filename.includes('?'), 'should not contain ?');
    assert.ok(!filename.includes('"'), 'should not contain "');
    assert.ok(!filename.includes('<'), 'should not contain <');
    assert.ok(!filename.includes('>'), 'should not contain >');
    assert.ok(!filename.includes('|'), 'should not contain |');

    // 文件应该能正常写入和读取
    const stat = await fs.stat(filePath);
    assert.ok(stat.isFile(), 'file with sanitized name should be created successfully');

    // 内容中应保留原始名称
    const content = await fs.readFile(filePath, 'utf-8');
    assert.ok(
      content.includes('招商/银行\\A股*测试:问号?引号"尖括号<>管道|'),
      'content should preserve original stock name'
    );
  });
});

describe('extractConclusion', () => {
  it('should extract various conclusion types', async () => {
    const { extractConclusion } = await import('../scripts/result.mjs');

    assert.equal(extractConclusion('稳健低吸，建议逢低买入'), '稳健低吸');
    assert.equal(extractConclusion('最终定论：短线博弈'), '短线博弈');
    assert.equal(extractConclusion('直接放弃，原因是估值过高'), '直接放弃');
    assert.equal(extractConclusion('建议观望，等待确认'), '建议观望');
    assert.equal(extractConclusion(''), '未分析');
    assert.equal(extractConclusion(null), '未分析');
    assert.equal(extractConclusion('普通文本无关键词'), '待分析');
  });
});

describe('sanitizeFilename', () => {
  it('should replace all problematic characters', async () => {
    const { sanitizeFilename } = await import('../scripts/result.mjs');

    assert.equal(sanitizeFilename('abc'), 'abc');
    assert.equal(sanitizeFilename('a/b'), 'a_b');
    assert.equal(sanitizeFilename('a\\b'), 'a_b');
    assert.equal(sanitizeFilename('a*b'), 'a_b');
    assert.equal(sanitizeFilename('a:b'), 'a_b');
    assert.equal(sanitizeFilename('a?b'), 'a_b');
    assert.equal(sanitizeFilename('a"b'), 'a_b');
    assert.equal(sanitizeFilename('a<b'), 'a_b');
    assert.equal(sanitizeFilename('a>b'), 'a_b');
    assert.equal(sanitizeFilename('a|b'), 'a_b');
    assert.equal(sanitizeFilename('a b'), 'a_b');
    assert.equal(sanitizeFilename('/\\:*?"<>| '), '__________');
  });
});
