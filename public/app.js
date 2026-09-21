const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeLink = value => {try{const u = new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?esc(u.href):'#';}catch{return '#';}};
const key = 'ea-signal-v1';
const starters = ['AAPL','MSFT','NVDA','GOOGL','AMZN'];
const names = {AAPL:'Apple Inc.',MSFT:'Microsoft Corporation',NVDA:'NVIDIA Corporation',GOOGL:'Alphabet Inc.',AMZN:'Amazon.com, Inc.'};
let saved;
let storageFailed = false;
try { saved = JSON.parse(localStorage.getItem(key)); } catch { storageFailed = true; }
let holdings = Array.isArray(saved?.holdings) ? [...new Set(saved.holdings.filter(s=>typeof s==='string'&&/^[A-Z0-9][A-Z0-9.^=-]{0,14}$/.test(s)))].slice(0,20) : [...starters];
let companies = saved?.companies && typeof saved.companies==='object' && !Array.isArray(saved.companies) ? saved.companies : {};
// Persisted data is only a snapshot; never present it as a successful new refresh.
const stale = new Set(holdings.filter(s=>companies[s]));
const errors = new Map();
let selected = 'all', category = 'all', sort = 'newest', limit = 12, busy = false, adding = false;
let calendarMonth = new Date(); calendarMonth = new Date(Date.UTC(calendarMonth.getUTCFullYear(),calendarMonth.getUTCMonth(),1));
let selectedDay = null, monthFilter = false, removed = null, toastTimer;
const today = () => new Date().toISOString().slice(0,10);
const formatDate = (value,options={month:'short',day:'numeric'}) => new Date(value).toLocaleDateString('en-US',{...options,timeZone:'UTC'});
const time = value => new Date(value).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
const age = value => {const n=Math.max(0,(Date.now()-Date.parse(value))/3600000);return n<1?'Just now':n<24?`${Math.floor(n)}h ago`:`${Math.floor(n/24)}d ago`;};
const scope = () => selected === 'all' ? holdings : holdings.filter(s=>s===selected);
function persist() {try{localStorage.setItem(key,JSON.stringify({holdings,companies:Object.fromEntries(holdings.filter(s=>companies[s]).map(s=>[s,companies[s]]))}));}catch{storageFailed=true;}}
function toast(message, undo=false){clearTimeout(toastTimer);$('#toast-message').textContent=message;$('#undo').hidden=!undo;$('#toast').hidden=false;toastTimer=setTimeout(()=>{$('#toast').hidden=true;removed=null;},8000);}
function allNews(){
  const seen=new Map();
  for(const symbol of scope()) for(const story of companies[symbol]?.news||[]){
    const id=story.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    if(seen.has(id)){if(!seen.get(id).symbols.includes(symbol))seen.get(id).symbols.push(symbol);}else seen.set(id,{...story,symbols:[symbol]});
  }
  return [...seen.values()].filter(s=>Date.parse(s.date)>=Date.now()-31*86400000).sort((a,b)=>b.date.localeCompare(a.date));
}
function allEvents(){
  const seen=new Set();
  return scope().flatMap(s=>companies[s]?.events||[]).filter(e=>{
    const id=`${e.symbol}:${e.date}:${e.type}:${e.type==='Dividend'?e.title:''}`;
    if((e.endDate||e.date)<today()||seen.has(id))return false;seen.add(id);return true;
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.symbol.localeCompare(b.symbol));
}
function renderHoldings(){
  $('#holding-count').textContent=holdings.length;
  $('#all-holdings').classList.toggle('active',selected==='all');
  $('#all-holdings').setAttribute('aria-pressed',String(selected==='all'));
  $('#holdings').innerHTML=holdings.map((s,i)=>{
    const c=companies[s];const change=c?.change;const validChange=typeof change==='number';
    let price='—';if(typeof c?.price==='number'){try{price=new Intl.NumberFormat('en-US',{style:'currency',currency:c.currency,maximumFractionDigits:2}).format(c.price);}catch{price=String(c.price);}}
    return `<div class="holding ${selected===s?'active':''}"><button class="holding-select" data-symbol="${s}" aria-pressed="${selected===s}" aria-label="Filter by ${s}" title="${esc(c?.name||names[s]||s)}${c?.marketTime?` · Quote: ${esc(formatDate(c.marketTime))}, ${esc(time(c.marketTime))}`:''}"><span class="monogram tone-${i%5}">${s.slice(0,2)}</span><span><span class="holding-top"><strong>${s}</strong><span class="holding-price">${esc(price)}</span></span><span class="holding-name">${esc(c?.name||names[s]||'Checking ticker…')}</span><span class="holding-change ${validChange?(change>=0?'positive':'negative'):''}">${validChange?`${change>=0?'↗ +':'↘ '}${change.toFixed(2)}%`:'Quote unavailable'}${stale.has(s)?' · saved':''}</span></span></button><button class="remove" data-remove="${s}" aria-label="Remove ${s}" title="Remove ${s}">×</button></div>`;
  }).join('') || '<div class="empty">Add your first ticker above to start following a company.</div>';
  $('#starter-note').textContent=saved?'Add companies by ticker. Select a holding to focus your briefing and calendar.':'A starter watchlist to get you going. Add your companies or remove any.';
}
function renderSummary(){
  const events=allEvents();
  const soon=events.filter(e=>Date.parse(e.date)<=Date.now()+30*86400000).length;
  $('#summary').innerHTML=`<span class="summary-item"><span class="summary-icon">▦</span><strong>${holdings.length}</strong> companies followed</span><span class="summary-item"><span class="summary-icon">≡</span><strong>${allNews().length}</strong> recent stories</span><span class="summary-item"><span class="summary-icon">◷</span><strong>${soon}</strong> events in 30 days</span><span class="summary-item">${esc(formatDate(new Date(),{weekday:'long',month:'short',day:'numeric',year:'numeric'}))}</span>`;
}
function renderNews(){
  let stories=allNews().filter(s=>category==='all'||s.category===category);
  if(sort==='company')stories.sort((a,b)=>a.symbol.localeCompare(b.symbol)||b.date.localeCompare(a.date));
  $('#briefing-heading').textContent=selected==='all'?'Your briefing':`${selected} briefing`;
  $('#briefing-caption').textContent=selected==='all'?'The latest from the companies you follow.':companies[selected]?.name||names[selected]||selected;
  $('#news-count').textContent=`${stories.length} stories`;
  $('#show-more').hidden=stories.length<=limit;
  if(!stories.length){
    if(busy && !scope().some(s=>companies[s])){$('#news').innerHTML='<div class="skeleton" aria-label="Loading company news"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>';return;}
    $('#news').innerHTML=`<div class="empty"><span class="empty-icon">≋</span><strong>${holdings.length?'No headlines to show yet':'Your next signal starts here.'}</strong>${holdings.length?'Try another news filter, or refresh your signals. Source failures appear above.':'Add a company ticker on the left to build your own briefing.'}</div>`;return;
  }
  $('#news').innerHTML=stories.slice(0,limit).map((story,i)=>{
    const chips=story.symbols.map(s=>`<span class="ticker-chip">${s}</span>`).join('');
    if(i===0)return `<a class="lead-story" href="${safeLink(story.url)}" target="_blank" rel="noopener noreferrer"><div class="lead-top"><span>${sort==='newest'?'LATEST SIGNAL':'COMPANY SPOTLIGHT'}</span><span aria-hidden="true">↗</span></div><div class="lead-tags">${chips}<span>${esc(story.category)}</span></div><h3>${esc(story.title)}</h3><div class="lead-bottom"><span>${esc(story.source)}</span><time datetime="${esc(story.date)}" title="${esc(formatDate(story.date))}">${age(story.date)} · ${formatDate(story.date)}</time></div></a>`;
    return `<article class="story-row"><span class="story-number">${String(i+1).padStart(2,'0')}</span><div><div class="story-meta">${chips}<span>${esc(story.category)}</span><span>·</span><time datetime="${esc(story.date)}" title="${esc(formatDate(story.date))}">${age(story.date)}</time></div><h3><a href="${safeLink(story.url)}" target="_blank" rel="noopener noreferrer">${esc(story.title)}</a></h3><span class="publisher">${esc(story.source)}</span></div><span class="story-arrow" aria-hidden="true">↗</span></article>`;
  }).join('');
}
function renderCalendar(){
  const events=allEvents();
  $('#month-title').textContent=formatDate(calendarMonth,{month:'long',year:'numeric'});
  const start=new Date(calendarMonth);start.setUTCDate(1-(start.getUTCDay()+6)%7);
  const count=Math.ceil(((calendarMonth.getUTCDay()+6)%7+new Date(Date.UTC(calendarMonth.getUTCFullYear(),calendarMonth.getUTCMonth()+1,0)).getUTCDate())/7)*7;
  $('#calendar').innerHTML=Array.from({length:count},(_,i)=>{
    const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);const date=d.toISOString().slice(0,10);
    const matches=events.filter(e=>date>=e.date&&date<=(e.endDate||e.date));
    const types=[...new Set(matches.map(e=>e.type))];
    return `<button class="day ${d.getUTCMonth()!==calendarMonth.getUTCMonth()?'other-month':''} ${date===today()?'today':''} ${date===selectedDay?'selected':''}" data-date="${date}" aria-pressed="${date===selectedDay}" ${date===today()?'aria-current="date"':''} aria-label="${formatDate(d,{month:'long',day:'numeric',year:'numeric'})}, ${matches.length} events">${d.getUTCDate()}<span class="day-dots" aria-hidden="true">${types.map(t=>`<i class="${t.toLowerCase()}-dot"></i>`).join('')}</span></button>`;
  }).join('');
  let shown=events;
  if(selectedDay)shown=events.filter(e=>selectedDay>=e.date&&selectedDay<=(e.endDate||e.date));
  else if(monthFilter){const first=calendarMonth.toISOString().slice(0,10),last=new Date(Date.UTC(calendarMonth.getUTCFullYear(),calendarMonth.getUTCMonth()+1,0)).toISOString().slice(0,10);shown=events.filter(e=>e.date<=last&&(e.endDate||e.date)>=first);}
  $('#agenda-heading').textContent=selectedDay?formatDate(selectedDay,{month:'long',day:'numeric'}):monthFilter?`${formatDate(calendarMonth,{month:'short'})} events`:'Upcoming events';
  $('#calendar-reset').textContent=selectedDay||monthFilter?'All upcoming':'Today';
  $('#events').innerHTML=shown.slice(0,8).map(e=>`<a class="event-row" href="${safeLink(e.url)}" target="_blank" rel="noopener noreferrer"><span class="event-date"><small>${formatDate(e.date,{month:'short'}).toUpperCase()}</small>${new Date(e.date).getUTCDate()}</span><span class="event-detail"><span class="event-meta"><span class="ticker-chip">${esc(e.symbol)}</span>${esc(e.type)}</span><h4>${esc(e.title)} <span aria-hidden="true">↗</span></h4><p class="${e.status==='Estimated'?'estimate':''}">${esc(e.status)}${e.endDate?` · ${formatDate(e.date)}–${formatDate(e.endDate)}`:''}</p><p>${esc(e.source)}</p></span></a>`).join('') || `<div class="empty"><strong>${busy?'Checking the horizon…':'No upcoming dates found'}</strong>${selectedDay||monthFilter?'Try another date or view all upcoming events.':'Dates appear when providers publish them. Conference coverage may be incomplete.'}</div>`;
  if(shown.length>8)$('#events').insertAdjacentHTML('beforeend',`<p class="announcement-caption">Showing the next 8 of ${shown.length} events. Select a calendar date to focus.</p>`);
  const announcements=scope().flatMap(s=>companies[s]?.announcements||[]).filter(a=>/conference|summit|investor day|capital markets day|webcast/i.test(a.title)).sort((a,b)=>b.date.localeCompare(a.date));
  const unique=[...new Map(announcements.map(a=>[a.title,a])).values()].slice(0,3);
  $('#announcements').innerHTML=unique.length?`<h3 class="announcement-heading">Event announcements ↗</h3><p class="announcement-caption">Recent coverage · May include past events. Open the source for full dates and details.</p>${unique.map(a=>`<a class="announcement-link" href="${safeLink(a.url)}" target="_blank" rel="noopener noreferrer"><span class="ticker-chip">${esc(a.symbol)}</span> ${esc(a.title)}<small>${esc(a.source)} · Published ${formatDate(a.date)}</small></a>`).join('')}`:'';
}
function renderStatus(){
  const warnings=[];
  if(storageFailed)warnings.push('Browser storage is unavailable. Changes may not survive closing this page.');
  for(const s of holdings){
    if(errors.has(s))warnings.push(`${s}: ${errors.get(s)}`);
    else if(stale.has(s))warnings.push(`${s}: showing saved data${companies[s]?.checkedAt?` from ${formatDate(companies[s].checkedAt)}, ${time(companies[s].checkedAt)}`:''}${busy?' while checking for updates.':'. Refresh to check for updates.'}`);
    for(const warning of companies[s]?.warnings||[])warnings.push(`${s}: ${warning}`);
  }
  $('#notice').hidden=!warnings.length;
  $('#notice').innerHTML=warnings.length?`<strong>${busy?'Checking your saved signals.':'Some signals need attention.'}</strong> ${warnings.length} update${warnings.length===1?'':'s'}.<details><summary>View source status</summary>${warnings.map(w=>`<div>${esc(w)}</div>`).join('')}</details>`:'';
  $('#refresh').disabled=busy;
  $('#refresh').innerHTML=busy?'<span class="refresh-icon">↻</span> Refreshing…':'<span class="refresh-icon">↻</span> Refresh signals';
  const successful=holdings.map(s=>companies[s]?.checkedAt).filter(Boolean).sort();
  $('#updated').textContent=busy?'Checking company sources…':stale.size||errors.size?'Some sources need attention':successful.length?`Checked ${formatDate(successful[0])}, ${time(successful[0])}`:'Add a ticker to begin';
}
function render(){renderHoldings();renderSummary();renderNews();renderCalendar();renderStatus();}
async function requestCompany(symbol,force=false){
  const response=await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}${force?'&refresh=1':''}`,{signal:AbortSignal.timeout(45000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load company.');return data;
}
async function refresh(force=false){
  if(busy)return;busy=true;render();
  const queue=[...holdings];
  await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{
    while(queue.length){const symbol=queue.shift();try{const data=await requestCompany(symbol,force);if(holdings.includes(symbol)){companies[symbol]=data;stale.delete(symbol);errors.delete(symbol);}}
    catch(e){if(holdings.includes(symbol)){errors.set(symbol,e.name==='TimeoutError'?'Request timed out. Please refresh again.':e.message);if(companies[symbol])stale.add(symbol);}}
    persist();render();}
  }));
  busy=false;render();
}
$('#add-form').addEventListener('submit',async event=>{
  event.preventDefault();if(adding)return;
  const symbol=$('#ticker').value.trim().toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9.^=-]{0,14}$/.test(symbol)){$('#add-error').textContent='Use a ticker such as AAPL or BRK-B.';return;}
  if(holdings.includes(symbol)){$('#add-error').textContent=`${symbol} is already in your holdings.`;return;}
  if(holdings.length>=20){$('#add-error').textContent='Remove a holding before adding another (20 maximum).';return;}
  adding=true;$('#add-button').disabled=true;$('#add-error').textContent=`Looking up ${symbol}…`;
  try{const data=await requestCompany(symbol);if(holdings.length>=20)throw new Error('Your watchlist is full. Remove a holding first.');if(holdings.includes(symbol))throw new Error(symbol+' is already in your holdings.');holdings.push(symbol);companies[symbol]=data;saved=true;persist();$('#ticker').value='';$('#add-error').textContent='';render();toast(`${symbol} added to your holdings.`);}
  catch(e){$('#add-error').textContent=e.name==='TimeoutError'?'Lookup timed out. Please try again.':e.message;}
  finally{adding=false;$('#add-button').disabled=false;$('#ticker').focus();}
});
$('#holdings').addEventListener('click',event=>{
  const remove=event.target.closest('[data-remove]');
  if(remove){const symbol=remove.dataset.remove;removed={symbol,index:holdings.indexOf(symbol),data:companies[symbol]};holdings=holdings.filter(s=>s!==symbol);delete companies[symbol];stale.delete(symbol);errors.delete(symbol);if(selected===symbol)selected='all';saved=true;persist();render();toast(`${symbol} removed.`,true);$('#ticker').focus();return;}
  const button=event.target.closest('[data-symbol]');if(button){selected=button.dataset.symbol;selectedDay=null;monthFilter=false;limit=12;render();$('#holdings [data-symbol="'+selected+'"]').focus();}
});
$('#undo').addEventListener('click',()=>{if(removed&&!holdings.includes(removed.symbol)&&holdings.length<20){holdings.splice(removed.index,0,removed.symbol);if(removed.data)companies[removed.symbol]=removed.data;persist();render();}removed=null;$('#toast').hidden=true;});
$('#all-holdings').addEventListener('click',()=>{selected='all';limit=12;selectedDay=null;monthFilter=false;render();});
$('#add-focus').addEventListener('click',()=>$('#ticker').focus());
$('#refresh').addEventListener('click',()=>refresh(true));
$('.tabs').addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;category=button.dataset.category;limit=12;document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});renderNews();});
$('#sort').addEventListener('change',event=>{sort=event.target.value;limit=12;renderNews();});
$('#show-more').addEventListener('click',()=>{limit+=12;renderNews();});
function moveMonth(amount){calendarMonth.setUTCMonth(calendarMonth.getUTCMonth()+amount);selectedDay=null;monthFilter=true;renderCalendar();}
$('#prev-month').addEventListener('click',()=>moveMonth(-1));$('#next-month').addEventListener('click',()=>moveMonth(1));
$('#calendar').addEventListener('click',event=>{const button=event.target.closest('[data-date]');if(!button)return;const date=button.dataset.date;selectedDay=selectedDay===date?null:date;renderCalendar();$('#calendar [data-date="'+date+'"]').focus();});
$('#calendar-reset').addEventListener('click',()=>{calendarMonth=new Date(today().slice(0,7)+'-01T00:00:00Z');selectedDay=null;monthFilter=false;renderCalendar();});
render();if(storageFailed)toast('Browser storage is unavailable. Your watchlist may not be saved.');refresh();
