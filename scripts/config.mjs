// ============================================================
// 配置文件 - 雪球热股分析工作流
// ============================================================

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// --- 日期工具 ---
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- 路径 ---
export const PATHS = {
  projectRoot: PROJECT_ROOT,
  screenshots: path.join(PROJECT_ROOT, 'screenshots'),
  results: path.join(PROJECT_ROOT, 'results'),
  stockList: path.join(PROJECT_ROOT, `hot-stocks-${today()}.md`),
  resultsDir: path.join(PROJECT_ROOT, 'results', today()),
};

// --- 雪球 ---
export const XUEQIU = {
  hotUrl: 'https://xueqiu.com/hot/stock?share_type=weixin&data_type=link&data_model=hotstock&fix_uid=7904341475',
  // 股票详情页模板 - SH/SZ前缀
  stockUrl: (code) => `https://xueqiu.com/S/${code}`,
  topN: 50,
};

// --- DeepSeek ---
export const DEEPSEEK = {
  chatUrl: 'https://chat.deepseek.com/',
  // 等待AI回复的最大时间(ms) — 深度思考模式较慢，给300秒
  responseTimeout: 300_000,
  // 轮询间隔(ms)
  pollInterval: 5_000,
};

// --- 浏览器 ---
export const BROWSER = {
  headless: false,          // 需要可见浏览器来操作
  slowMo: 300,              // 操作间隔，模拟人类
  viewport: { width: 1920, height: 1080 },
  cdpPort: 9222,            // Chrome 远程调试端口
  cdpEndpoint: 'http://localhost:9222',
};

// --- DeepSeek 提示词 ---
export const ANALYSIS_PROMPT = `角色设定：
你现在是一位拥有 20 年实战经验的资深股市操盘手，擅长"趋势、量能、技术指标、基本面、估值"五位一体的综合选股系统。你严格遵守纪律，不盲目追高，注重安全边际。

任务目标：
我将提供某只股票的行情截图，请严格按照我提供的"综合入场与黑名单标准"进行分析，并给出最终的操作建议。

---

【我的选股系统规则】 （请先阅读并作为分析基准）

一、趋势均线（硬性前提，不达标不重仓）
· 股价站稳 20 日均线（中期生命线）
· 股价站上 60 日均线（牛熊分界）
· 均线多头：5日＞20日＞60日
· 回踩均线缩量企稳，无连续大阴线

二、量能资金（确认主力，无放量不突破）
· 回调阶段持续缩量（抛压衰竭）
· 上涨/突破关键位明显放量
· 近 3 日无大额持续主力净流出
· 北向资金连续净流入（加分项）

三、技术震荡指标（低吸买点参考）
· MACD：指标位于零轴上方（多头环境）；DIF 上穿 DEA 形成金叉；绿柱缩短/红柱逐步放大。
· KDJ+RSI：KDJ 数值 20 以下低位金叉；RSI＜70，无超买；拒绝高位死叉后抄底。

四、估值安全（中长线必看，短线辅助）
· PE/PB 历史分位＜30%（低估区间）；成长股 PEG＜1
· 对比同行业，估值不明显偏高；亏损股避开高炒作高位。

五、基本面避雷（一票否决项）
· 近两季度净利润同比增长；经营现金流为正；
· 无大额商誉暴雷、ST 风险、巨额减持；毛利率、净利率无持续下滑。

六、综合入场标准
· 稳健低吸（满足≥5项再买入）： 趋势2条+量能1条+技术1条+估值/基本面1条
· 短线突破（满足≥4项轻仓试错）： 均线站稳+放量突破+MACD零轴金叉+无超买

七、禁止买入黑名单（出现任意一条直接放弃）
1. 股价长期在 60 日线下方，下降通道
2. RSI＞70、KDJ 高位钝化，严重超买
3. 高位巨量长上影，放量滞涨
4. PE/PB 历史分位＞80%，严重高估
5. 连续财报亏损、存在退市警示风险
6. 放量大跌，主力持续出逃

---

【您的分析任务】
请根据我上传的截图，执行以下三步：

1. 逐项核对：将股票信息与我上面的规则进行逐条对应，明确指出哪些达标，哪些未达标，是否触及黑名单。
2. 最终定论：给出这只票在当前的定性建议（分为："稳健低吸"、"短线博弈"、"直接放弃（原因XX）"）。
3. 实战点位：给出具体的"买入点、补仓点、止盈点、止损点"（参考当前价格给出精确的数字区间）。

输出格式要求：
用清晰的表格或分点作答，语言干练，重点突出纪律（如"宁可错过，不可做错"、"跌破XX价严格止损"等风险管理提示）。下面是我的股票截图：`;
