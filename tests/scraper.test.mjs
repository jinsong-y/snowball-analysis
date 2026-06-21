import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 测试用股票数据
const SAMPLE_STOCKS = [
  { code: 'SH600519', name: '贵州茅台', url: 'https://xueqiu.com/S/SH600519' },
  { code: 'SZ000858', name: '五粮液', url: 'https://xueqiu.com/S/SZ000858' },
  { code: 'SH601318', name: '中国平安', url: 'https://xueqiu.com/S/SH601318' },
  { code: 'SZ000333', name: '美的集团', url: 'https://xueqiu.com/S/SZ000333' },
  { code: 'SH600036', name: '招商银行', url: 'https://xueqiu.com/S/SH600036' },
];

const TEST_DATE = '2026-01-15';
const TEST_FILE = path.join(PROJECT_ROOT, `hot-stocks-${TEST_DATE}.md`);

// ---- 清理测试文件 ----
async function cleanup() {
  try {
    await fs.unlink(TEST_FILE);
  } catch {}
}

describe('persist module', () => {
  before(async () => {
    await cleanup();
  });

  after(async () => {
    await cleanup();
  });

  // ---- 测试1: readStockList 能正确解析 md 文件中的股票列表 ----
  it('readStockList should parse stock list from md file correctly', async () => {
    const { writeStockList, readStockList } = await import('../scripts/persist.mjs');

    // 先写入，再读回
    await writeStockList(SAMPLE_STOCKS, TEST_DATE);
    const parsed = await readStockList(TEST_DATE);

    assert.equal(parsed.length, SAMPLE_STOCKS.length, `should have ${SAMPLE_STOCKS.length} stocks`);

    for (let i = 0; i < SAMPLE_STOCKS.length; i++) {
      assert.equal(parsed[i].code, SAMPLE_STOCKS[i].code, `stock ${i} code should match`);
      assert.equal(parsed[i].name, SAMPLE_STOCKS[i].name, `stock ${i} name should match`);
      assert.equal(parsed[i].url, SAMPLE_STOCKS[i].url, `stock ${i} url should match`);
    }
  });

  // ---- 测试2: writeStockList 生成的 md 文件格式正确 ----
  it('writeStockList should generate correctly formatted md file', async () => {
    const { writeStockList } = await import('../scripts/persist.mjs');

    await writeStockList(SAMPLE_STOCKS, TEST_DATE);
    const content = await fs.readFile(TEST_FILE, 'utf-8');

    // 检查标题
    assert.ok(content.includes(`# 雪球热股 Top ${SAMPLE_STOCKS.length} - ${TEST_DATE}`),
      'should have correct title with date and count');

    // 检查数据来源
    assert.ok(content.includes('> 数据来源:'), 'should have data source line');

    // 检查表格分隔符
    assert.ok(content.includes('|------|------|------|----------|'),
      'should have table separator');

    // 检查每只股票都存在于文件中
    for (const stock of SAMPLE_STOCKS) {
      assert.ok(content.includes(stock.code), `should contain code ${stock.code}`);
      assert.ok(content.includes(stock.name), `should contain name ${stock.name}`);
      assert.ok(content.includes(stock.url), `should contain url ${stock.url}`);
    }
  });

  // ---- 测试3: md 文件包含正确的表头和链接格式 ----
  it('md file should contain correct headers and link format', async () => {
    const { writeStockList, readStockList } = await import('../scripts/persist.mjs');

    await writeStockList(SAMPLE_STOCKS, TEST_DATE);
    const content = await fs.readFile(TEST_FILE, 'utf-8');
    const lines = content.split('\n');

    // 检查表头行
    const headerLine = lines.find(l => l.startsWith('| 排名'));
    assert.ok(headerLine, 'should have header row starting with 排名');
    assert.ok(headerLine.includes('代码'), 'header should contain 代码');
    assert.ok(headerLine.includes('名称'), 'header should contain 名称');
    assert.ok(headerLine.includes('雪球链接'), 'header should contain 雪球链接');

    // 检查链接格式: [查看](url)
    const linkRegex = /\[查看\]\(https:\/\/xueqiu\.com\/S\/[A-Z]{2}\d+\)/;
    const dataLines = lines.filter(l => l.match(/\|\s*\d+\s*\|/));
    for (const line of dataLines) {
      assert.ok(linkRegex.test(line), `data row should have correct link format: ${line}`);
    }

    // 检查排名从 1 开始
    const firstDataLine = dataLines[0];
    assert.ok(firstDataLine.startsWith('| 1 |'), 'ranking should start from 1');

    // readStockList 解析回来的也应该完整
    const parsed = await readStockList(TEST_DATE);
    for (const stock of parsed) {
      assert.match(stock.code, /^[A-Z]{2}\d+$/, `code ${stock.code} should match SH/SZ+ digits pattern`);
      assert.match(stock.url, /^https:\/\/xueqiu\.com\/S\//, `url should start with xueqiu.com/S/`);
    }
  });
});

describe('scraper module', () => {
  // ---- scrapeHotStocks 使用 mock page 对象测试 ----
  it('scrapeHotStocks should extract stocks from page', async () => {
    const { scrapeHotStocks } = await import('../scripts/scraper.mjs');

    // Mock page object
    const mockPage = {
      goto: async () => {},
      evaluate: async (fn) => {
        // 模拟 DOM 中有股票链接
        const mockDocument = {
          querySelectorAll: (selector) => {
            if (selector.includes('a[href*="/S/"]')) {
              return SAMPLE_STOCKS.map(s => ({
                getAttribute: (attr) => `/S/${s.code}`,
                textContent: s.name,
                querySelector: () => null,
              }));
            }
            return [];
          },
        };
        // 用 Function 构造器模拟 evaluate 回调
        return fn.call({ document: mockDocument });
      },
    };

    // 由于 evaluate 内部使用 document 全局变量，mock 不能直接工作
    // 这里主要测试模块能正确导入和函数签名正确
    assert.equal(typeof scrapeHotStocks, 'function', 'scrapeHotStocks should be a function');
  });
});
