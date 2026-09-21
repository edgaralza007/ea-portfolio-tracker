import YahooFinance from 'yahoo-finance2';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import * as chrono from 'chrono-node';

const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const parser = new XMLParser({ ignoreAttributes: false, processEntities: true, trimValues: true });
const cache = new Map();
const inflight = new Map();
const TTL = 5 * 60 * 1000;
export const symbolPattern = /^[A-Z0-9][A-Z0-9.^=-]{0,14}$/;
export function normalizeSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  if (!symbolPattern.test(symbol)) throw new Error('Enter a ticker such as AAPL, MSFT, or BRK-B.');
  return symbol;
}
export function safeURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
const plain = value => String(typeof value === 'object' ? value?.['#text'] || '' : value || '').replace(/<[^>]*>/g, '').trim();
export function parseNews(xml, symbol, now = Date.now()) {
  if (XMLValidator.validate(xml) !== true) throw new Error('Invalid news feed.');
  const channel = parser.parse(xml)?.rss?.channel;
  if (!channel) throw new Error('News feed unavailable.');
  const items = channel.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];
  const seen = new Set();
  return items.flatMap(item => {
    const source = plain(item.source) || 'Google News';
    let title = plain(item.title);
    if (title.endsWith(` - ${source}`)) title = title.slice(0, -source.length - 3);
    const url = safeURL(plain(item.link));
    const date = Date.parse(plain(item.pubDate));
    const key = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (!title || !url || !Number.isFinite(date) || date > now + 3600000 || date < now - 31 * 86400000 || seen.has(key)) return [];
    seen.add(key);
    const category = /earnings|financial results|revenue|profit|quarter(?:ly)? (?:results|report)/i.test(title) ? 'Earnings' : /conference|summit|investor day|capital markets day|webcast/i.test(title) ? 'Events' : 'Company news';
    return [{ title, url, source, date: new Date(date).toISOString(), symbol, category }];
  }).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 45);
}
export function extractEvents(stories, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0,10);
  const seen = new Set();
  return stories.flatMap(story => {
    if (!/conference|summit|investor day|capital markets day|webcast|earnings|financial results/i.test(story.title)) return [];
    // Only an explicit month and day in the headline can become a calendar date.
    // Never use the article's publication date as the event date.
    if (!/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}\b/i.test(story.title)) return [];
    const match = chrono.en.parse(story.title, new Date(story.date))[0];
    if (!match || !match.start.isCertain('month') || !match.start.isCertain('day')) return [];
    const date = `${match.start.get('year')}-${String(match.start.get('month')).padStart(2,'0')}-${String(match.start.get('day')).padStart(2,'0')}`;
    if (date < today || Date.parse(date) > now + 180 * 86400000) return [];
    const type = /earnings|financial results/i.test(story.title) ? 'Earnings' : 'Conference';
    const key = `${story.symbol}:${date}:${type}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ symbol: story.symbol, date, endDate: null, type, title: story.title, source: story.source, url: story.url, status: 'From announcement' }];
  });
}
export function calendarEvents(summary, symbol, now = Date.now()) {
  const calendar = summary?.calendarEvents;
  if (!calendar) return [];
  const today = new Date(now).toISOString().slice(0,10);
  const events = [];
  const url = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/calendar/`;
  const day = value => { const d = new Date(value); return value && Number.isFinite(+d) ? d.toISOString().slice(0,10) : null; };
  const dates = (calendar.earnings?.earningsDate || []).map(day).filter(Boolean).sort();
  if (dates.length && dates[dates.length-1] >= today) events.push({ symbol, date: dates[0], endDate: dates.length > 1 && dates.at(-1) !== dates[0] ? dates.at(-1) : null, type: 'Earnings', title: 'Quarterly earnings', status: calendar.earnings.isEarningsDateEstimate === false ? 'Provider date' : 'Estimated', source: 'Yahoo Finance', url });
  for (const [field,title] of [['exDividendDate','Ex-dividend date'],['dividendDate','Dividend payment']]) {
    const date = day(calendar[field]);
    if (date && date >= today) events.push({symbol,date,endDate:null,type:'Dividend',title,status:'Provider date',source:'Yahoo Finance',url});
  }
  return events;
}
export function companySearchName(name) {
  return name.replace(/,?\s+(?:Inc\.?|Corporation|Corp\.?|Limited|Ltd\.?|plc|Company)\.?$/i, '').replace(/"/g, '').trim();
}
async function fetchNews(query, symbol) {
  const params = new URLSearchParams({ q: query + ' when:30d', hl: 'en-US', gl: 'US', ceid: 'US:en' });
  const response = await fetch(`https://news.google.com/rss/search?${params}`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`News provider returned ${response.status}.`);
  return parseNews(await response.text(), symbol);
}
export async function getCompany(input, force = false) {
  const symbol = normalizeSymbol(input);
  const previous = cache.get(symbol);
  if (previous && Date.now() - previous.at < (force ? 30000 : TTL)) return previous.data;
  if (inflight.has(symbol)) return inflight.get(symbol);
  const promise = loadCompany(symbol, previous?.data).then(data => {
    cache.set(symbol, { at: Date.now(), data });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return data;
  }).finally(() => inflight.delete(symbol));
  inflight.set(symbol, promise);
  return promise;
}
export async function loadCompany(symbol, old, providers = {}) {
  const market = providers.market || ((ticker) => yahoo.quoteSummary(ticker, { modules: ['price','calendarEvents'] }, { fetchOptions: { signal: AbortSignal.timeout(12000) } }));
  const newsFeed = providers.news || fetchNews;
  const warnings = [];
  let summary;
  try {
    summary = await market(symbol);
    if (!summary?.price?.symbol) throw new Error('Ticker not found.');
  } catch (error) {
    if (!old) {
      const invalid = /not found|no fundamentals|quote not found|delisted/i.test(error.message);
      const failure = new Error(invalid ? `No company found for ${symbol}. Check the ticker and exchange suffix.` : `Could not verify ${symbol}. The market data provider is unavailable; try again.`);
      failure.status = invalid ? 404 : 502;
      throw failure;
    }
    warnings.push('Market data unavailable; showing the previous quote and provider dates.');
  }
  const price = summary?.price;
  const name = price?.longName || price?.shortName || old?.name || symbol;
  const searchName = companySearchName(name) || symbol;
  const query = `"${searchName}"`;
  const results = await Promise.allSettled([
    newsFeed(`${query} (stock OR earnings OR business)`, symbol),
    newsFeed(`${query} ("will participate" OR "to present" OR "to host" OR "investor day" OR "earnings call" OR "conference")`, symbol)
  ]);
  const news = results[0].status === 'fulfilled' ? results[0].value : (old?.news || []);
  const announcements = results[1].status === 'fulfilled' ? results[1].value : (old?.announcements || []);
  if (results[0].status === 'rejected') warnings.push(`News unavailable${old?.news?.length ? '; showing previous headlines' : ''}.`);
  if (results[1].status === 'rejected') warnings.push('Conference announcement feed unavailable.');
  if (summary && !summary.calendarEvents) warnings.push('The provider has no event calendar for this ticker.');
  const now = new Date().toISOString();
  return {
    symbol, name, currency: price?.currency || old?.currency || 'USD',
    price: price?.regularMarketPrice ?? old?.price ?? null,
    change: price?.regularMarketChangePercent != null ? price.regularMarketChangePercent * 100 : old?.change ?? null,
    marketTime: price?.regularMarketTime?.toISOString() || old?.marketTime || null,
    marketState: price?.marketState || old?.marketState || 'Unknown',
    news, announcements,
    events: [...(summary ? calendarEvents(summary, symbol) : (old?.events || []).filter(e=>e.source === 'Yahoo Finance')), ...extractEvents(announcements)],
    warnings, checkedAt: now,
    newsUpdatedAt: results[0].status === 'fulfilled' ? now : old?.newsUpdatedAt || null,
    eventsUpdatedAt: results[1].status === 'fulfilled' ? now : old?.eventsUpdatedAt || null,
    quoteUpdatedAt: summary ? now : old?.quoteUpdatedAt || null
  };
}
