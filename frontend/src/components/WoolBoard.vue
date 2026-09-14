<template>
  <div class="wool-workspace">
    <header class="wool-hero">
      <div><span class="hero-index">SAVE / SPEND / PROVE</span><h1>省钱行动账本</h1><p>羊毛收益与每日消费同屏核对，订单截图、支付凭证和备注都跟着每一笔记录走。</p></div>
      <div class="hero-actions"><button class="hero-btn reward" @click="openDialog('reward')"><Coins />记羊毛</button><button class="hero-btn spend" @click="openDialog('spend')"><Plus />记消费</button></div>
      <div class="hero-ticker"><span>DAILY COST INTELLIGENCE</span><span>RECEIPT ARCHIVE</span><span>NET SAVING SIGNAL</span><span>DAILY COST INTELLIGENCE</span></div>
      <div class="hero-speed-bar" :title="`赚钱速度 = 累计净值 ÷ 已记录天数 = ¥${money(netAmount)} ÷ ${recordDays} 天 = ${profitSpeed >= 0 ? '+' : ''}¥${money(profitSpeed)}/天`">
        <div class="speed-left"><span class="speed-label">目标速度</span><template v-if="speedTargetHover"><span class="speed-target-edit"><span class="target-prefix">¥</span><input v-model.number="speedTarget" type="number" min="0" step="1" @blur="speedTargetHover = false" @keyup.enter="speedTargetHover = false" autofocus /></span></template><template v-else><span class="speed-target-val" @mouseenter="speedTargetHover = true" @mouseleave="speedTargetHover = false" title="悬浮可编辑">¥{{ money(speedTarget) }}/天</span></template><span class="speed-sep">·</span><span class="speed-achieved" :class="{ full: speedAchievedPercent >= 100, neg: speedAchievedPercent < 0 }" :title="`达成率 = 实际速度 ÷ 目标速度 = ${profitSpeed >= 0 ? '+' : ''}¥${money(profitSpeed)}/天 ÷ ¥${money(speedTarget)}/天 × 100 = ${speedAchievedPercent.toFixed(0)}%`">达成 {{ speedAchievedPercent.toFixed(0) }}%</span><span class="speed-sep">·</span><span class="speed-label">赚钱速度</span><span class="speed-value" :class="profitSpeed >= 0 ? 'pos' : 'neg'">{{ profitSpeed >= 0 ? '+' : '' }}¥{{ money(profitSpeed) }}/天</span></div>
        <div class="speed-track-wrap">
          <div class="speed-track"><i :style="{width: `${Math.max(0, targetPercent)}%`}" :class="{full: targetPercent >= 100}"></i></div>
          <Rocket class="rocket-icon" :style="{left: `${Math.min(100, Math.max(0, targetPercent))}%`}" />
        </div>
        <div class="speed-target">
          <div class="target-eta" :title="`预计天数 = (目标 ¥${money(savingsTarget)} − 累计净值 ¥${money(netAmount)}) ÷ 赚钱速度 ${profitSpeed >= 0 ? '+' : ''}¥${money(profitSpeed)}/天${profitSpeed <= 0 ? '（速度 ≤ 0，无法达成）' : ''}`">
            <template v-if="profitSpeed > 0 && remainingAmount > 0">
              <span class="eta-label">🚀 预计</span>
              <span class="eta-value">{{ formatEta(etaDays) }}</span>
            </template>
            <template v-else-if="targetPercent >= 100">
              <span class="eta-label eta-done">🎉 已达成</span>
            </template>
            <template v-else>
              <span class="eta-label eta-warn">无法达成</span>
            </template>
          </div>
          <span class="target-word">目标</span>
          <div class="target-field" @mouseenter="targetHover = true" @mouseleave="targetHover = false">
            <template v-if="targetHover">
              <span class="target-prefix">¥</span>
              <input v-model.number="savingsTarget" type="number" min="0" step="1000" @blur="targetHover = false" @keyup.enter="targetHover = false" autofocus />
            </template>
            <template v-else>
              <span class="percent">{{ targetPercent.toFixed(1) }}%</span>
              <span class="fraction">¥{{ money(netAmount) }} / ¥{{ money(savingsTarget) }}</span>
            </template>
          </div>
        </div>
      </div>
    </header>

    <section class="metric-strip">
      <div class="metric-cell reward-cell"><span>本月羊毛</span><strong>+¥{{ money(monthReward) }}</strong><small>{{ monthRewardCount }} 笔收益</small></div>
      <div class="metric-cell spend-cell"><span>本月消费</span><strong>-¥{{ money(monthSpend) }}</strong><small>日均 ¥{{ money(avgDailySpend) }}</small></div>
      <div class="metric-cell net-cell"><span>本月净值</span><strong :class="tone(monthNet)">{{ signedMoney(monthNet) }}</strong><small>{{ monthNet >= 0 ? '收益覆盖消费' : '消费超过收益' }}</small></div>
      <div class="metric-cell proof-cell"><span>凭证资产</span><strong>{{ receiptCount }} 张</strong><small>连续记录 {{ recordStreak }} 天</small></div>
    </section>

    <div v-if="loadError" class="load-alert"><TriangleAlert />{{ loadError }}<button @click="reload">重新加载</button></div>

    <main class="wool-layout">
      <aside class="date-rail">
        <div class="rail-title"><button class="icon-btn" title="上个月" @click="changeMonth(-1)"><ChevronLeft /></button><div><span>{{ currentMonth.getFullYear() }}</span><strong>{{ pad(currentMonth.getMonth() + 1) }}</strong></div><button class="icon-btn" title="下个月" @click="changeMonth(1)"><ChevronRight /></button></div>
        <div class="weekday-row"><span v-for="day in weekdays" :key="day">{{ day }}</span></div>
        <div class="calendar-grid">
          <button v-for="day in calendarDays" :key="day.dateStr" :class="['calendar-day',{muted:!day.isCurrentMonth,selected:day.isSelected,today:day.isToday,hasSpend:day.spend>0,hasReward:day.reward>0,netPositive:(day.reward-day.spend)>0,netNegative:(day.reward-day.spend)<0}]" @click="selectDate(day.dateStr)"><b>{{ day.day }}</b><small v-if="day.spend||day.reward">{{ compactMoney(day.reward-day.spend) }}</small></button>
        </div>
        <div class="date-jump"><input type="date" :value="formatDate(selectedDate)" @change="jumpToDate" /><button title="回到今天" @click="goToday"><LocateFixed /></button></div>
        <div class="budget-block">
          <div class="budget-heading"><span>月消费预算</span><b>{{ budgetProgress.toFixed(0) }}%</b></div><div class="budget-track"><i :style="{width:`${Math.min(budgetProgress,100)}%`}" :class="{danger:budgetProgress>=90}"></i></div>
          <div class="budget-input"><span>¥</span><input v-model.number="monthlyBudget" type="number" min="0" step="100" /><small>剩余 ¥{{ money(budgetRemaining) }}</small></div>
        </div>
      </aside>

      <section class="ledger-stage">
        <div class="ledger-toolbar">
          <div class="date-focus"><button class="icon-btn" title="前一天" @click="shiftDay(-1)"><ChevronLeft /></button><div><span>{{ selectedLabel.weekday }}</span><strong>{{ selectedLabel.monthDay }}</strong><small>{{ selectedLabel.year }}</small></div><button class="icon-btn" title="后一天" @click="shiftDay(1)"><ChevronRight /></button></div>
          <div class="day-balance"><span>当日净值</span><strong :class="tone(dailyTotal)">{{ signedMoney(dailyTotal) }}</strong><small>收入 ¥{{ money(dailyReward) }} / 支出 ¥{{ money(dailySpend) }}</small></div>
          <div class="view-switch"><button :class="{active:viewMode==='day'}" @click="viewMode='day'">当天</button><button :class="{active:viewMode==='month'}" @click="viewMode='month'">本月</button></div>
        </div>
        <div class="filter-bar">
          <label class="search-box"><Search /><input v-model.trim="searchText" placeholder="搜索名称、商户或备注" /></label>
          <select v-model="typeFilter"><option value="all">全部收支</option><option value="spend">只看消费</option><option value="reward">只看羊毛</option></select>
          <select v-model="categoryFilter"><option value="all">全部分类</option><option v-for="category in categories" :key="category" :value="category">{{ category }}</option></select>
          <button v-if="hasFilters" class="reset-filter" title="清空筛选" @click="resetFilters"><FilterX /></button>
        </div>
        <div class="ledger-list" :class="{loading}">
          <article v-for="item in visibleItems" :key="item.id" class="ledger-row" :class="[item.recordType,{hasImages:item.images?.length}]">
            <div class="record-mark">{{ mark(item) }}</div>
            <div class="record-main"><div class="record-title"><strong>{{ item.name }}</strong><span>{{ item.category||'未分类' }}</span><time v-if="viewMode==='month'">{{ item.woolDate.slice(5) }}</time></div><div v-if="item.paymentMethod" class="record-meta"><WalletCards /><span>{{ item.paymentMethod }}</span></div></div>
            <div v-if="item.images?.length" class="record-images"><button v-for="(image,index) in item.images" :key="image" @click="openImage(item.images,index)"><img :src="imageUrl(image)" alt="消费凭证" /></button></div>
            <div class="record-amount"><strong>{{ item.recordType==='spend'?'-':'+' }}¥{{ money(item.amount) }}</strong><small>{{ item.recordType==='spend'?'支出':'收益' }}</small></div>
            <div class="record-actions"><button title="编辑" @click="editItem(item)"><Pencil /></button><button title="删除" @click="removeItem(item)"><Trash2 /></button></div>
          </article>
          <div v-if="!loading&&!visibleItems.length" class="empty-ledger"><ReceiptText /><strong>{{ hasFilters?'没有匹配的记录':'这一天还没有账单' }}</strong><span>{{ hasFilters?'换个筛选条件看看。':'记录一笔消费或羊毛，今天的轨迹就会出现在这里。' }}</span><button v-if="!hasFilters" @click="openDialog('spend')"><Plus />记第一笔</button></div>
        </div>
      </section>

      <aside class="insight-rail">
        <section class="trend-block"><header><div><span>近七日脉冲</span><strong>¥{{ money(weekSpend) }}</strong></div><Activity /></header><div class="trend-chart"><div v-for="day in weeklyTrend" :key="day.date" class="trend-column"><div class="bars"><i class="reward" :style="{height:`${barHeight(day.reward)}%`}"></i><i class="spend" :style="{height:`${barHeight(day.spend)}%`}"></i></div><span>{{ day.label }}</span></div></div><div class="trend-legend"><span><i class="reward"></i>羊毛</span><span><i class="spend"></i>消费</span></div></section>
        <section class="category-block"><header><span>消费热区</span><small>{{ formatMonth(currentMonth) }}</small></header><div v-if="categoryRanking.length" class="category-list"><div v-for="(entry,index) in categoryRanking" :key="entry.name"><div><b>{{ pad(index+1) }}</b><span>{{ entry.name }}</span><strong>¥{{ money(entry.amount) }}</strong></div><i><em :style="{width:`${entry.ratio}%`}"></em></i></div></div><div v-else class="mini-empty">本月还没有消费分类数据</div></section>
        <section class="signal-block" :class="monthNet>=0?'good':'warn'"><Gauge /><div><span>本月省钱信号</span><strong>{{ savingSignal.title }}</strong><small>{{ savingSignal.description }}</small></div></section>
      </aside>
    </main>

    <NewWoolDialog v-if="showDialog" :date="formatDate(selectedDate)" :default-type="dialogType" :item="editingItem" :known-categories="categories" @close="closeDialog" @confirm="saveRecord" />
    <div v-if="lightboxImages.length" class="image-lightbox" @click.self="closeImage"><button class="lightbox-close" title="关闭" @click="closeImage"><X /></button><button v-if="lightboxImages.length>1" class="lightbox-nav prev" @click="stepImage(-1)"><ChevronLeft /></button><img :src="imageUrl(lightboxImages[lightboxIndex])" alt="图片凭证大图" /><button v-if="lightboxImages.length>1" class="lightbox-nav next" @click="stepImage(1)"><ChevronRight /></button><span>{{ lightboxIndex+1 }} / {{ lightboxImages.length }}</span></div>
  </div>
</template>
<script setup>
import { computed, inject, ref, watch } from 'vue'
import { Activity, ChevronLeft, ChevronRight, Coins, FilterX, Gauge, LocateFixed, MessageSquareText, Pencil, Plus, ReceiptText, Rocket, Search, Store, Trash2, TriangleAlert, WalletCards, X } from 'lucide-vue-next'
import NewWoolDialog from './dialogs/NewWoolDialog.vue'
import { useWool } from '../composables/useWool'
import { fmtNum } from '../utils/formatter'

const { woolItems,loading,currentMonth,selectedDate,monthItems,monthReward,monthSpend,monthNet,monthCount,dailyItems,dailyReward,dailySpend,dailyTotal,netAmount,loadWoolItems,addWoolItem,updateWoolItem,deleteWoolItem,changeMonth,jumpToDate,formatDate }=useWool()
const weekdays=['日','一','二','三','四','五','六']
const showDialog=ref(false),dialogType=ref('spend'),editingItem=ref(null),viewMode=ref('day'),searchText=ref(''),typeFilter=ref('all'),categoryFilter=ref('all'),loadError=ref(''),lightboxImages=ref([]),lightboxIndex=ref(0)
const monthlyBudget=ref(Number(localStorage.getItem('wool-monthly-budget'))||3000)
const savingsTarget=ref(Number(localStorage.getItem('wool-savings-target'))||10000)
const speedTarget=ref(Number(localStorage.getItem('wool-speed-target'))||15)
const targetHover=ref(false)
const speedTargetHover=ref(false)
const refreshDeposit=inject('refreshDeposit',()=>Promise.resolve())
watch(monthlyBudget,value=>localStorage.setItem('wool-monthly-budget',String(Math.max(0,Number(value)||0))))
watch(savingsTarget,value=>localStorage.setItem('wool-savings-target',String(Math.max(0,Number(value)||0))))
watch(speedTarget,value=>localStorage.setItem('wool-speed-target',String(Math.max(0,Number(value)||0))))

const recordDays=computed(()=>{
  if(!woolItems.value.length)return 1
  const dates=woolItems.value.map(i=>i.woolDate).sort()
  const first=new Date(dates[0]+'T00:00:00')
  const now=new Date()
  return Math.max(1,Math.floor((now-first)/86400000)+1)
})
const profitSpeed=computed(()=>netAmount.value/Math.max(1,recordDays.value))
const speedAchievedPercent=computed(()=>speedTarget.value>0?Math.min(999,profitSpeed.value/speedTarget.value*100):0)
const targetPercent=computed(()=>savingsTarget.value>0?Math.min(100,netAmount.value/savingsTarget.value*100):0)
const remainingAmount=computed(()=>Math.max(0,savingsTarget.value-netAmount.value))
const etaDays=computed(()=>{
  if(profitSpeed.value<=0)return Infinity
  return Math.ceil(remainingAmount.value/profitSpeed.value)
})
function formatEta(days){
  if(!isFinite(days)||days<=0)return '—'
  if(days<7){return `${days}天`}
  if(days<30){const w=Math.floor(days/7),d=days%7;return d?`${w}周${d}天`:`${w}周`}
  if(days<365){const m=Math.floor(days/30),d=days%30;return d?`${m}个月${d}天`:`${m}个月`}
  const y=Math.floor(days/365),rm=days%365
  if(rm<30){return `${y}年`}
  const m=Math.floor(rm/30),d=rm%30;return d?`${y}年${m}个月${d}天`:`${y}年${m}个月`
}

const todayStr=formatDate(new Date())
const monthRewardCount=computed(()=>monthItems.value.filter(item=>item.recordType!=='spend').length)
const receiptCount=computed(()=>woolItems.value.reduce((sum,item)=>sum+(item.images?.length||0),0))
const elapsedDays=computed(()=>{const now=new Date(),view=currentMonth.value;if(view.getFullYear()===now.getFullYear()&&view.getMonth()===now.getMonth())return now.getDate();return new Date(view.getFullYear(),view.getMonth(),1)<new Date(now.getFullYear(),now.getMonth(),1)?new Date(view.getFullYear(),view.getMonth()+1,0).getDate():1})
const avgDailySpend=computed(()=>monthSpend.value/Math.max(1,elapsedDays.value))
const budgetProgress=computed(()=>monthlyBudget.value>0?monthSpend.value/monthlyBudget.value*100:0)
const budgetRemaining=computed(()=>Math.max(0,Number(monthlyBudget.value||0)-monthSpend.value))
const selectedLabel=computed(()=>({weekday:selectedDate.value.toLocaleDateString('zh-CN',{weekday:'long'}),monthDay:selectedDate.value.toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'}).replace('/','.'),year:selectedDate.value.getFullYear()}))
const categories=computed(()=>[...new Set(woolItems.value.map(item=>item.category).filter(Boolean))].sort())
const hasFilters=computed(()=>Boolean(searchText.value||typeFilter.value!=='all'||categoryFilter.value!=='all'))
const sourceItems=computed(()=>viewMode.value==='day'?dailyItems.value:monthItems.value.slice().sort((a,b)=>{const dateCompare=b.woolDate.localeCompare(a.woolDate);if(dateCompare!==0)return dateCompare;return Number(b.createdAt||0)-Number(a.createdAt||0)}))
const visibleItems=computed(()=>{const q=searchText.value.toLowerCase();return sourceItems.value.filter(item=>{if(typeFilter.value!=='all'&&item.recordType!==typeFilter.value)return false;if(categoryFilter.value!=='all'&&item.category!==categoryFilter.value)return false;return !q||[item.name,item.merchant,item.note,item.paymentMethod,item.category].some(v=>String(v||'').toLowerCase().includes(q))})})
const recordStreak=computed(()=>{const dates=new Set(woolItems.value.map(item=>item.woolDate)),cursor=new Date(`${todayStr}T00:00:00`);let count=0;while(dates.has(formatDate(cursor))){count++;cursor.setDate(cursor.getDate()-1)}return count})
const calendarMap=computed(()=>{const map=new Map();monthItems.value.forEach(item=>{const value=map.get(item.woolDate)||{spend:0,reward:0};value[item.recordType==='spend'?'spend':'reward']+=Number(item.amount)||0;map.set(item.woolDate,value)});return map})
const calendarDays=computed(()=>{const year=currentMonth.value.getFullYear(),month=currentMonth.value.getMonth(),first=new Date(year,month,1),start=new Date(year,month,1-first.getDay());return Array.from({length:42},(_,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);const dateStr=formatDate(date),amounts=calendarMap.value.get(dateStr)||{spend:0,reward:0};return{day:date.getDate(),dateStr,isCurrentMonth:date.getMonth()===month,isSelected:dateStr===formatDate(selectedDate.value),isToday:dateStr===todayStr,...amounts}})})
const weeklyTrend=computed(()=>Array.from({length:7},(_,index)=>{const date=new Date(selectedDate.value);date.setDate(date.getDate()-(6-index));const dateStr=formatDate(date),items=woolItems.value.filter(item=>item.woolDate===dateStr);return{date:dateStr,label:index===6?'今':weekdays[date.getDay()],spend:items.filter(item=>item.recordType==='spend').reduce((s,i)=>s+i.amount,0),reward:items.filter(item=>item.recordType!=='spend').reduce((s,i)=>s+i.amount,0)}}))
const trendMax=computed(()=>Math.max(1,...weeklyTrend.value.flatMap(day=>[day.spend,day.reward])))
const weekSpend=computed(()=>weeklyTrend.value.reduce((sum,day)=>sum+day.spend,0))
const categoryRanking=computed(()=>{const totals=new Map();monthItems.value.filter(item=>item.recordType==='spend').forEach(item=>totals.set(item.category||'未分类',(totals.get(item.category||'未分类')||0)+item.amount));const entries=[...totals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5),max=entries[0]?.[1]||1;return entries.map(([name,amount])=>({name,amount,ratio:amount/max*100}))})
const savingSignal=computed(()=>{if(!monthCount.value)return{title:'等待第一笔',description:'开始记录后生成本月消费信号。'};if(monthNet.value>=0)return{title:'收益已覆盖',description:`羊毛覆盖率 ${monthSpend.value?Math.round(monthReward.value/monthSpend.value*100):100}%`};if(budgetProgress.value<70)return{title:'节奏稳定',description:`预算仍有 ¥${money(budgetRemaining.value)}`};if(budgetProgress.value<90)return{title:'接近警戒',description:'建议放慢非必要消费。'};return{title:'预算高压',description:'优先检查消费热区与大额记录。'}})

async function reload(){loadError.value='';try{await loadWoolItems()}catch(error){loadError.value=error.response?.data?.error||'账本加载失败，请确认后端和数据库已正常启动。'}}
reload()
const money=value=>fmtNum(value,2)
const pad=value=>String(value).padStart(2,'0')
const formatMonth=date=>`${date.getFullYear()}.${pad(date.getMonth()+1)}`
const tone=value=>value>=0?'positive':'negative'
const signedMoney=value=>`${value>=0?'+':'-'}¥${money(Math.abs(value))}`
function compactMoney(value){const abs=Math.abs(value),sign=value>=0?'+':'-';if(abs>=10000)return`${sign}${(abs/10000).toFixed(1)}w`;if(abs>=1000)return`${sign}${(abs/1000).toFixed(1)}k`;return`${sign}${Math.round(abs)}`}
const barHeight=value=>value>0?Math.max(8,value/trendMax.value*100):0
const imageUrl=path=>/^(https?:|blob:|data:)/.test(path||'')?path:`/${String(path||'').replace(/^\//,'')}`
const mark=item=>(item.category||(item.recordType==='spend'?'消':'赚')).slice(0,1)
const selectDate=date=>jumpToDate(date)
const goToday=()=>jumpToDate(todayStr)
function shiftDay(delta){const date=new Date(selectedDate.value);date.setDate(date.getDate()+delta);jumpToDate(formatDate(date))}
function resetFilters(){searchText.value='';typeFilter.value='all';categoryFilter.value='all'}
function openDialog(type){editingItem.value=null;dialogType.value=type;showDialog.value=true}
function editItem(item){editingItem.value=item;dialogType.value=item.recordType;showDialog.value=true}
function closeDialog(){showDialog.value=false;editingItem.value=null}
async function saveRecord(data, done){try{if(editingItem.value)await updateWoolItem(editingItem.value.id,data);else await addWoolItem(data);await refreshDeposit();done?.();jumpToDate(data.woolDate);closeDialog()}catch(error){done?.(error.response?.data?.error||'保存失败，请稍后重试。')}}
async function removeItem(item){if(!confirm(`确定删除“${item.name}”这笔记录？`))return;try{await deleteWoolItem(item.id);await refreshDeposit()}catch(error){alert(error.response?.data?.error||'删除失败')}}
function openImage(images,index){lightboxImages.value=images;lightboxIndex.value=index}
function closeImage(){lightboxImages.value=[];lightboxIndex.value=0}
function stepImage(delta){lightboxIndex.value=(lightboxIndex.value+delta+lightboxImages.value.length)%lightboxImages.value.length}
defineExpose({loadWoolItems:reload})
</script>
<style scoped>
.wool-workspace{--ink:#171918;--paper:#fffdf6;--mint:#bdf6df;--coral:#ff806e;--yellow:#fff07a;--blue:#80d7ff;min-height:calc(100vh - 150px);margin:18px 18px 32px;border:2px solid var(--ink);background-color:var(--paper);background-image:linear-gradient(rgba(23,25,24,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(23,25,24,.045) 1px,transparent 1px);background-size:24px 24px;box-shadow:8px 8px 0 var(--ink);color:var(--ink);overflow:hidden}.wool-hero{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:22px 24px 96px;border-bottom:2px solid var(--ink);background:var(--mint);overflow:hidden}.hero-index{padding:3px 7px;background:var(--ink);color:#fff;font-size:9px;font-weight:900;letter-spacing:1.3px}.wool-hero h1{margin:8px 0 4px;font-size:34px;line-height:1;font-weight:950}.wool-hero p{margin:0;font-size:12px;font-weight:600;color:#45504a}.hero-actions{display:flex;gap:10px;flex-shrink:0}.hero-btn{height:42px;display:flex;align-items:center;gap:7px;padding:0 15px;border:2px solid var(--ink);font-size:12px;font-weight:950;box-shadow:4px 4px 0 var(--ink)}.hero-btn svg{width:17px}.hero-btn.reward{background:var(--yellow)}.hero-btn.spend{background:var(--coral)}.hero-ticker{position:absolute;left:0;right:0;bottom:32px;height:24px;display:flex;align-items:center;gap:42px;white-space:nowrap;border-top:2px solid var(--ink);background:var(--ink);color:#fff;font-size:9px;font-weight:900;letter-spacing:1.5px;overflow:hidden;z-index:1}.hero-ticker span{animation:ticker 18s linear infinite}@keyframes ticker{to{transform:translateX(-320px)}}.hero-speed-bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:12px;height:32px;padding:0 24px;background:var(--paper);font-size:11px;font-weight:900;z-index:2}.speed-left{display:flex;align-items:center;gap:6px;flex-shrink:0}.speed-sep{color:#676b69;font-size:11px;font-weight:700}.speed-target-val{font-size:12px;font-weight:900;color:#45504a;cursor:pointer;text-decoration:underline;text-decoration-style:dotted}.speed-target-edit{display:flex;align-items:center;gap:2px}.speed-target-edit .target-prefix{font-size:10px;color:#676b69}.speed-target-edit input{width:70px;height:20px;padding:0 4px;border:1.5px solid var(--ink);background:#fff;font-size:11px;font-weight:900;outline:none}.speed-achieved{font-size:12px;font-weight:900;color:#087e57;background:var(--mint);padding:2px 6px;border:1.5px solid var(--ink)}.speed-achieved.full{background:var(--yellow)}.speed-achieved.neg{background:#ffd6d1;color:#d83b2b}.speed-label{font-size:9px;letter-spacing:1.2px;color:#676b69;text-transform:uppercase}.speed-value{font-size:14px;font-weight:950}.speed-value.pos{color:#d83b2b}.speed-value.neg{color:#087e57}.speed-track-wrap{flex:1;position:relative;height:14px;display:flex;align-items:center;min-width:60px}.speed-track{width:100%;height:100%;border:1.5px solid var(--ink);background:#fff}.speed-track i{display:block;height:100%;background:var(--mint);transition:width .3s;position:relative}.speed-track i.full{background:var(--yellow)}.rocket-icon{position:absolute;top:50%;transform:translate(-50%,-50%) rotate(-90deg);width:18px;height:18px;color:#d83b2b;transition:left .3s;filter:drop-shadow(1px 1px 0 rgba(0,0,0,.4))}.speed-target{flex-shrink:0;display:flex;align-items:center;gap:8px;height:100%}.target-eta{display:flex;align-items:center;gap:4px;font-size:10px;cursor:help}.eta-label{font-weight:700;color:#676b69}.eta-label.eta-done{color:#087e57;font-weight:900}.eta-label.eta-warn{color:#d83b2b}.eta-value{font-size:13px;font-weight:950;color:#d83b2b}.target-word{font-size:9px;letter-spacing:1.2px;color:#676b69;text-transform:uppercase;flex-shrink:0}.target-field{display:flex;align-items:center;gap:5px;height:100%;cursor:text}.target-field .percent{font-size:14px;font-weight:950;color:#087e57}.target-field .fraction{font-size:9px;color:#676b69;font-weight:700}.target-field .target-prefix{font-size:9px;color:#676b69}.target-field input{width:120px;height:24px;padding:0 6px;border:1.5px solid var(--ink);background:#fff;font-size:12px;font-weight:900;outline:none}
.metric-strip{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:2px solid var(--ink);background:#fff}.metric-cell{position:relative;min-width:0;padding:14px 16px}.metric-cell+.metric-cell{border-left:2px solid var(--ink)}.metric-cell>span{display:block;font-size:10px;font-weight:900;color:#676b69}.metric-cell strong{display:block;margin:2px 0;font-size:21px;line-height:1.1;white-space:nowrap}.metric-cell small{font-size:10px;color:#757977}.metric-cell:before{content:"";position:absolute;inset:0 0 auto;height:5px}.reward-cell:before{background:var(--mint)}.spend-cell:before{background:var(--coral)}.net-cell:before{background:var(--yellow)}.proof-cell:before{background:var(--blue)}.positive{color:#087e57!important}.negative{color:#d83b2b!important}.load-alert{margin:12px 14px 0;display:flex;align-items:center;gap:8px;padding:10px;border:1.5px solid var(--ink);background:#ffe1dc;font-size:12px;font-weight:700}.load-alert svg{width:17px}.load-alert button{margin-left:auto;text-decoration:underline;font-weight:900}
.wool-layout{display:grid;grid-template-columns:260px minmax(520px,1fr) 270px;min-height:570px}.date-rail,.ledger-stage,.insight-rail{min-width:0}.date-rail{padding:16px;border-right:2px solid var(--ink);background:rgba(255,253,246,.92)}.rail-title{display:grid;grid-template-columns:34px 1fr 34px;align-items:center;gap:8px;margin-bottom:12px}.rail-title>div{text-align:center}.rail-title span{display:block;font-size:9px;font-weight:900;color:#777}.rail-title strong{display:block;font-size:27px;line-height:1}.icon-btn{width:32px;height:32px;display:grid;place-items:center;border:1.5px solid var(--ink);background:#fff}.icon-btn:hover{background:var(--yellow)}.icon-btn svg{width:16px}.weekday-row,.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr)}.weekday-row span{text-align:center;font-size:9px;font-weight:900;color:#858886}.calendar-grid{gap:3px;margin-top:4px}.calendar-day{position:relative;min-width:0;height:39px;padding:4px 2px;border:1px solid transparent;background:transparent;text-align:center}.calendar-day b,.calendar-day small{display:block}.calendar-day b{font-size:11px}.calendar-day small{overflow:hidden;font-size:7px;font-weight:800;white-space:nowrap}.calendar-day.muted{opacity:.3}.calendar-day:hover{border-color:var(--ink)}.calendar-day.today:after{content:"";position:absolute;right:3px;top:3px;width:4px;height:4px;background:var(--coral);border-radius:50%}.calendar-day.hasSpend small{color:#d94937}.calendar-day.hasReward small{color:#087e57}.calendar-day.netPositive small{color:#d94937}.calendar-day.netNegative small{color:#087e57}.calendar-day.selected{border:1.5px solid var(--ink);background:var(--yellow);box-shadow:2px 2px 0 var(--ink)}.date-jump{display:grid;grid-template-columns:1fr 34px;gap:7px;margin-top:12px}.date-jump input,.date-jump button{height:34px;border:1.5px solid var(--ink);background:#fff;font-size:11px}.date-jump input{min-width:0;padding:0 7px}.date-jump button{display:grid;place-items:center;background:var(--blue)}.date-jump svg{width:15px}.budget-block{margin-top:18px;padding-top:15px;border-top:2px solid var(--ink)}.budget-heading{display:flex;justify-content:space-between;font-size:10px;font-weight:900}.budget-track{height:10px;margin:8px 0;border:1.5px solid var(--ink);background:#fff}.budget-track i{display:block;height:100%;background:var(--mint)}.budget-track i.danger{background:var(--coral)}.budget-input{display:grid;grid-template-columns:16px 1fr;align-items:center;gap:3px}.budget-input>span{font-weight:900}.budget-input input{min-width:0;border:0;border-bottom:1.5px solid var(--ink);background:transparent;font-size:15px;font-weight:900;outline:none}.budget-input small{grid-column:1/-1;margin-top:4px;font-size:9px;color:#777}
.ledger-stage{border-right:2px solid var(--ink);background:rgba(255,255,255,.72)}.ledger-toolbar{display:grid;grid-template-columns:180px 1fr auto;align-items:stretch;border-bottom:2px solid var(--ink)}.date-focus{display:grid;grid-template-columns:32px 1fr 32px;align-items:center;gap:7px;padding:11px}.date-focus>div{text-align:center}.date-focus span,.date-focus small,.day-balance span,.day-balance small{display:block;font-size:9px;color:#777}.date-focus strong{display:block;font-size:21px;line-height:1}.day-balance{padding:10px 14px;border-left:1.5px solid var(--ink)}.day-balance strong{font-size:20px}.view-switch{display:grid;grid-template-columns:1fr 1fr;align-self:center;margin-right:12px;border:1.5px solid var(--ink)}.view-switch button{height:30px;padding:0 10px;background:#fff;font-size:10px;font-weight:900}.view-switch button+button{border-left:1.5px solid var(--ink)}.view-switch button.active{background:var(--yellow)}.filter-bar{display:grid;grid-template-columns:minmax(180px,1fr) 112px 110px 34px;gap:7px;padding:10px 12px;border-bottom:1.5px solid var(--ink);background:#f5f1e6}.search-box{position:relative}.search-box svg{position:absolute;left:9px;top:50%;width:14px;transform:translateY(-50%)}.search-box input,.filter-bar select,.reset-filter{width:100%;height:32px;border:1.5px solid var(--ink);background:#fff;font-size:10px}.search-box input{padding:0 9px 0 30px}.filter-bar select{padding:0 7px}.reset-filter{display:grid;place-items:center;background:var(--coral)}.reset-filter svg{width:15px}
.ledger-list{min-height:430px;padding:10px 12px 14px}.ledger-list.loading{opacity:.55;pointer-events:none}.ledger-row{display:grid;grid-template-columns:40px minmax(160px,1fr) 104px 58px;align-items:center;gap:10px;min-height:70px;margin-bottom:8px;padding:8px 9px;border:1.5px solid var(--ink);background:#fff;box-shadow:3px 3px 0 rgba(23,25,24,.85);transition:.18s}.ledger-row.hasImages{grid-template-columns:40px minmax(160px,1fr) auto 104px 58px}.ledger-row:hover{transform:translate(-1px,-1px);box-shadow:5px 5px 0 var(--ink)}.ledger-row.reward{border-left:7px solid #36c995}.ledger-row.spend{border-left:7px solid var(--coral)}.record-mark{width:36px;height:36px;display:grid;place-items:center;border:1.5px solid var(--ink);background:var(--yellow);font-size:15px;font-weight:950}.spend .record-mark{background:#ffd3cc}.reward .record-mark{background:var(--mint)}.record-main{min-width:0}.record-title{display:flex;align-items:center;gap:7px;min-width:0}.record-title strong{overflow:hidden;font-size:13px;white-space:nowrap;text-overflow:ellipsis}.record-title span,.record-title time{flex-shrink:0;padding:2px 5px;background:#eee9dc;font-size:8px;font-weight:800}.record-meta{display:flex;align-items:center;gap:9px;min-width:0;margin-top:5px;color:#777}.record-meta span{display:flex;align-items:center;gap:3px;min-width:0;max-width:180px;overflow:hidden;font-size:9px;white-space:nowrap;text-overflow:ellipsis}.record-meta svg{width:11px;flex-shrink:0}.record-images{display:flex;gap:4px}.record-images button{position:relative;width:34px;height:34px;border:1.5px solid var(--ink);overflow:hidden;background:#eee}.record-images img{width:100%;height:100%;object-fit:cover}.record-images span{position:absolute;inset:0;display:grid;place-items:center;background:rgba(23,25,24,.7);color:#fff;font-size:10px;font-weight:900}.record-amount{text-align:right}.record-amount strong,.record-amount small{display:block}.record-amount strong{font-size:14px;white-space:nowrap}.record-amount small{font-size:8px;color:#777}.spend .record-amount strong{color:#d94331}.reward .record-amount strong{color:#087e57}.record-actions{display:flex;gap:5px}.record-actions button{width:26px;height:26px;display:grid;place-items:center;border:1px solid var(--ink);background:#fff}.record-actions button:hover:first-child{background:var(--blue)}.record-actions button:hover:last-child{background:var(--coral)}.record-actions svg{width:12px}.empty-ledger{min-height:350px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.empty-ledger>svg{width:45px;height:45px;padding:9px;border:2px solid var(--ink);background:var(--yellow);box-shadow:4px 4px 0 var(--ink)}.empty-ledger strong{margin-top:15px;font-size:14px}.empty-ledger span{margin-top:4px;font-size:10px;color:#777}.empty-ledger button{display:flex;align-items:center;gap:5px;margin-top:14px;padding:8px 12px;border:1.5px solid var(--ink);background:var(--coral);font-size:11px;font-weight:900;box-shadow:3px 3px 0 var(--ink)}.empty-ledger button svg{width:14px}
.insight-rail{padding:16px;background:rgba(255,253,246,.94)}.trend-block,.category-block{padding-bottom:17px;margin-bottom:17px;border-bottom:2px solid var(--ink)}.trend-block header,.category-block header{display:flex;align-items:flex-start;justify-content:space-between}.trend-block header span,.category-block header span{display:block;font-size:10px;font-weight:900}.trend-block header strong{font-size:18px}.trend-block header svg{width:20px;color:#ef5b46}.trend-chart{height:116px;display:grid;grid-template-columns:repeat(7,1fr);align-items:end;gap:6px;margin-top:10px;border-bottom:1.5px solid var(--ink)}.trend-column{height:100%;display:grid;grid-template-rows:1fr 18px;align-items:end;text-align:center}.bars{height:100%;display:flex;align-items:end;justify-content:center;gap:2px}.bars i{width:7px;border:1px solid var(--ink);border-bottom:0}.bars i.reward{background:var(--mint)}.bars i.spend{background:var(--coral)}.trend-column>span{font-size:8px;font-weight:800}.trend-legend{display:flex;gap:12px;margin-top:7px;font-size:8px}.trend-legend span{display:flex;align-items:center;gap:4px}.trend-legend i{width:8px;height:8px;border:1px solid var(--ink)}.trend-legend i.reward{background:var(--mint)}.trend-legend i.spend{background:var(--coral)}.category-block header small{font-size:8px;color:#777}.category-list{margin-top:11px}.category-list>div{margin-bottom:10px}.category-list>div>div{display:grid;grid-template-columns:20px 1fr auto;gap:5px;align-items:center;font-size:9px}.category-list b{font-size:8px;color:#999}.category-list strong{font-size:9px}.category-list>div>i{display:block;height:5px;margin-top:4px;background:#eee;border:1px solid var(--ink)}.category-list em{display:block;height:100%;background:var(--blue)}.mini-empty{padding:28px 0;text-align:center;font-size:9px;color:#888}.signal-block{display:grid;grid-template-columns:38px 1fr;gap:10px;padding:11px;border:1.5px solid var(--ink);box-shadow:3px 3px 0 var(--ink)}.signal-block.good{background:var(--mint)}.signal-block.warn{background:#ffd3cc}.signal-block>svg{width:32px;height:32px}.signal-block span,.signal-block strong,.signal-block small{display:block}.signal-block span{font-size:8px;font-weight:900}.signal-block strong{font-size:13px}.signal-block small{margin-top:2px;font-size:8px;color:#555}
.image-lightbox{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;background:rgba(8,10,9,.9);backdrop-filter:blur(8px)}.image-lightbox>img{max-width:min(1100px,82vw);max-height:82vh;border:2px solid #fff;object-fit:contain;box-shadow:8px 8px 0 var(--yellow)}.image-lightbox>span{position:absolute;bottom:24px;color:#fff;font-size:11px}.lightbox-close,.lightbox-nav{position:absolute;width:40px;height:40px;display:grid;place-items:center;border:2px solid var(--ink);background:var(--yellow)}.lightbox-close{right:24px;top:24px}.lightbox-nav.prev{left:24px}.lightbox-nav.next{right:24px}.lightbox-close svg,.lightbox-nav svg{width:20px}
@media(max-width:1180px){.wool-layout{grid-template-columns:240px minmax(480px,1fr)}.insight-rail{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;border-top:2px solid var(--ink)}.trend-block,.category-block{margin:0;padding:0 18px 0 0;border:0;border-right:2px solid var(--ink)}.ledger-stage{border-right:0}.ledger-row{grid-template-columns:40px minmax(140px,1fr) auto 100px 58px}}
@media(max-width:820px){.wool-workspace{margin:10px;box-shadow:4px 4px 0 var(--ink)}.wool-hero{display:block}.hero-actions{margin-top:14px}.metric-strip{grid-template-columns:1fr 1fr}.metric-cell:nth-child(3){border-left:0;border-top:2px solid var(--ink)}.metric-cell:nth-child(4){border-top:2px solid var(--ink)}.wool-layout{grid-template-columns:1fr}.date-rail{border-right:0;border-bottom:2px solid var(--ink)}.ledger-toolbar{grid-template-columns:160px 1fr}.view-switch{grid-column:1/-1;margin:0;border-width:1.5px 0 0}.filter-bar{grid-template-columns:1fr 1fr 1fr 34px}.ledger-row{grid-template-columns:38px 1fr auto}.record-images{grid-column:2}.record-amount{grid-column:3;grid-row:1}.record-actions{grid-column:3;grid-row:2}.insight-rail{display:block}.trend-block,.category-block{padding:0 0 16px;margin:0 0 16px;border:0;border-bottom:2px solid var(--ink)}}
@media(max-width:560px){.wool-hero h1{font-size:27px}.hero-actions{display:grid;grid-template-columns:1fr 1fr}.metric-cell strong{font-size:17px}.ledger-toolbar{grid-template-columns:1fr}.day-balance{border-left:0;border-top:1.5px solid var(--ink);text-align:center}.filter-bar{grid-template-columns:1fr 1fr}.search-box{grid-column:1/-1}.ledger-row{grid-template-columns:36px minmax(0,1fr) auto;gap:7px}.record-meta{flex-wrap:wrap}.record-images{grid-column:2/-1}.insight-rail{grid-column:auto}.image-lightbox>img{max-width:88vw}.lightbox-nav.prev{left:8px}.lightbox-nav.next{right:8px}}
</style>
