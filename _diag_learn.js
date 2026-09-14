// 直接复现前端 learnExtractionRules + validation 逻辑，看 11 条样本的精确率各是多少
const mysql=require('mysql2/promise');
(async()=>{
  const c=await mysql.createConnection({host:'localhost',user:'root',password:'1234',database:'stock_calculator',dateStrings:true});
  const [rows]=await c.query('SELECT event_id, original_text, stocks_json FROM wechat_logic_training ORDER BY created_at DESC');
  
  // --- 抄前端关键函数 ---
  function escapeRegexLiteral(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
  function findAllOccurrences(text, target) { const results=[];if(!target)return results;let idx=0;while((idx=text.indexOf(target,idx))!==-1){results.push({start:idx,end:idx+target.length});idx+=target.length}return results }
  function majorityString(arr) { if(!arr||!arr.length)return null;const counts={};arr.forEach(s=>counts[s]=(counts[s]||0)+1);const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);const best=sorted[0];if(best&&best[1]/arr.length>=0.6&&best[0].length<=6)return best[0];return null }
  function inferNameDelimiters(text, stocks) {
    const beforeChars=[],afterChars=[],before2=[],after2=[];
    for(const s of stocks){
      if(!s.name)continue;
      const occ=findAllOccurrences(text,s.name);if(!occ.length)continue;
      const o=occ[0];
      beforeChars.push(o.start>0?text[o.start-1]:'');afterChars.push(o.end<text.length?text[o.end]:'');
      before2.push(text.slice(Math.max(0,o.start-2),o.start));after2.push(text.slice(o.end,Math.min(text.length,o.end+2)));
    }
    const majority=arr=>{const counts={};arr.forEach(c=>counts[c]=(counts[c]||0)+1);const total=arr.length;return Object.entries(counts).filter(([,v])=>v/total>0.5).sort((a,b)=>b[1]-a[1]).map(([k])=>k)};
    return {beforeChars:majority(beforeChars),afterChars:majority(afterChars),before2:majority(before2),after2:majority(after2)};
  }
  
  // 重点：抄 parseByRule 的 enclosingRegex 分支 + validate
  function selfValidate(text, expectedStocks, nameReStr, logicReStr, nameBeforeCode, enclosingRe, enclosingLogicRe) {
    if (!nameReStr) return { precision: 0, recall: 0, hits: 0, total: expectedStocks.length }
    // 简化 parseByRule 核心
    let parsed = []
    try {
      let reSource = enclosingRe || nameReStr
      const re = new RegExp(reSource, 'g')
      let match, lastEnd = -1
      while ((match = re.exec(text)) !== null) {
        if (match.index === lastEnd) { re.lastIndex++; continue }
        lastEnd = match.index
        let name = '', code = ''
        for (let g = 1; g < match.length; g++) {
          const group = match[g]; if (!group) continue
          if (/^\d{6}$/.test(group.trim())) code = group.trim()
          else if (!code) name = group.trim()
          else if (!name) name = group.trim()
        }
        if (!name && match[1] && !/^\d{6}$/.test(match[1].trim())) name = match[1].trim()
        if (!code) { const ci = match[0].match(/\d{6}/); if (ci) code = ci[0] }
        parsed.push({ name, code })
      }
    } catch(e) { return { precision:0, recall:0, hits:0, total:expectedStocks.length, error:String(e) } }

    let hits = 0
    for (const exp of expectedStocks) {
      if (parsed.find(p =>
        (exp.code && p.code === exp.code) ||
        (exp.name && p.name === exp.name) ||
        (exp.name && p.name && p.name.replace(/\s/g,'') === exp.name.replace(/\s/g,''))
      )) hits++
    }
    const precision = parsed.length ? hits / parsed.length : 0
    const recall = expectedStocks.length ? hits / expectedStocks.length : 0
    return { precision, recall, hits, total: expectedStocks.length, parsedCount: parsed.length }
  }

  // --- 跑 ---
  for (const row of rows) {
    const text = row.original_text
    const stocks = JSON.parse(row.stocks_json)
    const codeMatches = [...text.matchAll(/\d{6}/g)].map(m => ({ code: m[0], index: m.index }))
    const codeSet = new Set(codeMatches.map(c => c.code))
    const stocksWithCode = stocks.filter(s => s.code && codeSet.has(s.code))

    // 简化：只看 Step 3-6 关键变量
    const openCandidates = /[（(【\[\{《〈<]#⭐⭕🔥👉★●]/
    const closeCharByOpen = { '（': '）', '(': ')', '【': '】', '[': ']', '{': '}', '《': '》', '〈': '〉', '<': '>' }
    const nameDelim = inferNameDelimiters(text, stocks)
    const allBefore = [...(nameDelim.beforeChars||[]), ...(nameDelim.before2||[])]
    const openChars = []
    for (const c of allBefore) { if (c.length===1 && openCandidates.test(c) && !openChars.includes(c)) openChars.push(c) }

    // 只看 bracket wrap 检测
    const observations = []
    for (const stock of stocksWithCode.length ? stocksWithCode : stocks) {
      const obs = { stock, codeSpan: null, nameSpan: null }
      if (stock.code) { const cm = codeMatches.find(c => c.code === stock.code); if (cm) obs.codeSpan = { start: cm.index, end: cm.index+6 } }
      if (stock.name) {
        const occ = findAllOccurrences(text, stock.name); if (occ.length) {
          let best = occ[0]
          if (obs.codeSpan) { let minD=Infinity; for (const o of occ) { const d = Math.abs(o.end-obs.codeSpan.start)+Math.abs(o.start-obs.codeSpan.end); if(d<minD){minD=d;best=o} } }
          obs.nameSpan = best
        }
      }
      observations.push(obs)
    }

    let detectedBracketWrap = false, wrapOpenCh = '', wrapCloseCh = ''
    if (openChars.length && observations.length >= 2) {
      for (const o of openChars) {
        const cl = closeCharByOpen[o]; if (!cl) continue
        let wc = 0
        for (const obs of observations) {
          if (!obs.codeSpan) continue
          const ac = text.slice(obs.codeSpan.end, obs.codeSpan.end + 20)
          if (ac.startsWith(cl) || (ac.startsWith(' ') && ac[1]===cl)) wc++
        }
        if (wc / Math.max(observations.length,1) >= 0.6) { detectedBracketWrap=true; wrapOpenCh=o; wrapCloseCh=cl; break }
      }
    }

    // 生成正则
    let enclosingRegex = null, nameExtraction = null
    const pickGap = observations.filter(o=>o.nameSpan&&o.codeSpan).map(o=>text.slice(o.nameSpan.end,o.codeSpan.start))
    const commonGap = majorityString(pickGap) || '\\s+'

    if (detectedBracketWrap) {
      enclosingRegex = escapeRegexLiteral(wrapOpenCh) + '\\s*([\\u4e00-\\u9fa5A-Za-z\\s]{2,20}?)\\s*(\\d{6})\\s*' + escapeRegexLiteral(wrapCloseCh)
      nameExtraction = enclosingRegex
    }

    const bracketOpenCh = openChars.find(c => closeCharByOpen[c]) || ''
    const namePositions = []
    for (const o of observations) { if (!o.nameSpan||!o.codeSpan) continue; namePositions.push(o.nameSpan.end <= o.codeSpan.start ? 'before' : 'after') }
    const nameBeforeCode = namePositions.length ? namePositions.filter(p=>p==='before').length >= namePositions.length/2 : true

    const val = selfValidate(text, stocks, nameExtraction, null, nameBeforeCode, enclosingRegex, null)
    const pass = val.precision >= 0.6 ? '✅' : '❌'
    console.log(`${pass} ${row.event_id}: bracketWrap=${detectedBracketWrap}(${wrapOpenCh}${wrapCloseCh}) openChars=${openChars} → 精度=${(val.precision*100).toFixed(1)}% 召回=${(val.recall*100).toFixed(1)}% parsed=${val.parsedCount}/${stocks.length} hits=${val.hits}/${val.total}`)
  }
  await c.end()
})();
