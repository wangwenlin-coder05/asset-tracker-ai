(async()=>{
  const resp = await fetch('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sz001358,day,2026-07-25,2026-08-10,30,qfq');
  const json = await resp.json();
  const data = json.data['sz001358'];
  const klines = (data.fqday || data.day || []);
  console.log('=== 腾讯K线 (前复权) ===');
  console.log('格式: [日期, open, close, high, low, volume]');
  klines.forEach(k => {
    console.log(`${k[0]} open=${k[1]} close=${k[2]} high=${k[3]} low=${k[4]}`);
  });
})();
