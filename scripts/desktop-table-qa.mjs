import { chromium } from 'playwright'
import { createBrowserClient } from '@supabase/ssr'
import fs from 'node:fs'

const PREVIEW_URL=process.env.PREVIEW_URL
const SUPABASE_URL=process.env.SUPABASE_URL
const SUPABASE_KEY=process.env.SUPABASE_KEY
if(!PREVIEW_URL||!SUPABASE_URL||!SUPABASE_KEY)throw new Error('Missing QA environment')
if(!fs.existsSync('qa-session.json'))throw new Error('Missing qa-session.json')

const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const cookieMap=new Map()
const cookieClient=createBrowserClient(SUPABASE_URL,SUPABASE_KEY,{
  cookies:{
    getAll(){return [...cookieMap.values()].map(x=>({name:x.name,value:x.value}))},
    setAll(items){for(const item of items)cookieMap.set(item.name,item)},
  },
})
const {error}=await cookieClient.auth.setSession({
  access_token:session.access_token,
  refresh_token:session.refresh_token,
})
if(error)throw error

const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const context=await browser.newContext({viewport:{width:1440,height:900}})
await context.addCookies([...cookieMap.values()].map(c=>({
  name:c.name,value:c.value,url:PREVIEW_URL,
  httpOnly:Boolean(c.options?.httpOnly),secure:c.options?.secure!==false,
  sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
})))
const page=await context.newPage()
const results=[]

async function go(path){
  let lastStatus=0
  for(let attempt=1;attempt<=3;attempt++){
    const res=await page.goto(PREVIEW_URL+path,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>null)
    lastStatus=res?.status()??0
    await page.waitForTimeout(attempt===1?700:1400)
    if(lastStatus<500&&lastStatus!==0)return
  }
  throw new Error(path+' returned '+lastStatus+' after 3 attempts')
}
async function metrics(selector){
  return page.locator(selector).first().evaluate(el=>{
    const r=el.getBoundingClientRect(),s=getComputedStyle(el)
    return {
      height:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom),
      width:Math.round(r.width),overflowY:s.overflowY,display:s.display,
      viewportH:innerHeight,viewportW:innerWidth,
    }
  }).catch(()=>null)
}
function rec(name,pass,m={}){results.push({name,pass:Boolean(pass),...m})}

for(const spec of [
  ['/purchase/tracking','.tracking-hub-table-wrap-v2',120,'Tracking'],
  ['/warehouse/receive','.tracking-hub-table-wrap-v2',120,'Nhập kho'],
  ['/finance/cashflow','.finance-table-card',160,'Thu-Chi'],
  ['/finance/shipper-payments?mode=customer','.finance-customer-settlement .compact-table-wrap',160,'Đối soát khách hàng'],
  ['/finance/reports','.finance-report-day-table-wrap',190,'Báo cáo tài chính'],
]){
  const [path,selector,minHeight,label]=spec
  await go(path)
  const m=await metrics(selector)
  rec(label+' — vùng bảng đủ chiều cao',Boolean(m)&&m.height>=minHeight&&m.bottom<=m.viewportH+2,m??{})
}

for(const spec of [
  ['/purchase/accounts','.managed-column-button','Tài khoản mua hàng'],
  ['/purchase/orders','.managed-column-button','Đơn nhập hàng'],
]){
  const [path,selector,label]=spec
  await go(path)
  const count=await page.locator(selector).count()
  rec(label+' — có điều khiển Cột',count>0,{count})
  if(count){
    await page.locator(selector).first().click()
    await page.waitForTimeout(150)
    rec(label+' — menu Cột mở được',await page.locator('.column-manager-menu,.managed-column-menu').count()>0)
  }
}

// Desktop KPI and period-filter contract on the approved desktop-polish Preview.
for (const width of [1024,1440,2560]) {
  await page.setViewportSize({width,height:900})
  for (const [path,selector,expected,label] of [
    ['/purchase/orders?range=all','.order-kpi-grid-v2 > .kpi-card',8,'Đơn nhập'],
    ['/purchase?range=all','.purchase-command-kpis-v2 > .command-kpi',8,'Tổng quan mua hàng'],
    ['/?range=all','main .kpi-grid > .kpi-card',6,'Dashboard'],
    ['/warehouse','.whx-kpi-grid.seven > a',7,'Tổng quan kho'],
    ['/sales?range=all','.sales-kpi-strip > .sales-kpi',7,'Tổng quan bán hàng'],
    ['/finance?range=all','.finance-overview-kpis > .finance-kpi',6,'Tổng quan tài chính'],
  ]) {
    await go(path)
    const m=await page.evaluate(sel=>{
      const els=[...document.querySelectorAll(sel)]
      const tops=els.map(x=>x.getBoundingClientRect().top)
      const first=els[0]?.parentElement, r=first?.getBoundingClientRect()
      const parentStyle=first?getComputedStyle(first):null
      return {count:els.length,
        rowAligned:tops.length>0&&Math.max(...tops)-Math.min(...tops)<3,
        radius:parseFloat(parentStyle?.borderTopLeftRadius||'0'),
        shadow:parentStyle?.boxShadow||'none',
        contained:!!r&&r.left>=0&&r.right<=innerWidth+2,
        viewport:innerWidth}
    },selector)
    rec(label+' — KPI '+width+'px',m.count===expected&&m.rowAligned&&m.radius>=3&&m.radius<=5&&m.shadow!=='none'&&m.contained,m)
  }
  await go('/purchase/orders?range=all')
  const express=page.locator('.order-kpi-grid-v2 > .express')
  rec('Đơn nhập — có KPI Hỏa tốc và bộ lọc tổng',await express.count()===1&&String(await express.getAttribute('href')).includes('tracking=express_all'))
  await go('/purchase?range=all')
  rec('Tổng quan mua hàng — KPI Hỏa tốc dẫn sang Đơn nhập',await page.locator('.purchase-command-kpis-v2 > .express[href*="express_all"]').count()===1)
}
for(const [path,active] of [
  ['/?range=all','Toàn thời gian'],
  ['/purchase?range=quarter','Quý này'],
  ['/purchase/orders?range=year','Năm nay'],
  ['/sales?range=30d','30 ngày'],
  ['/finance?range=7d','7 ngày'],
]){
  await go(path)
  const nav=page.locator('.purchase-date-filter .command-range')
  const selected=(await nav.locator('.active').allTextContents()).map(x=>x.trim())
  rec('KPI period '+path,selected.includes(active),{selected})
}

const pass=results.every(x=>x.pass)
console.log(JSON.stringify({preview:PREVIEW_URL,pass,results},null,2))
await browser.close()
if(!pass)process.exit(1)
