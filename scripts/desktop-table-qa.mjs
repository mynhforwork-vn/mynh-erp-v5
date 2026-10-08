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
const artifactDir='qa-desktop-slidebar-artifacts'
fs.mkdirSync(artifactDir,{recursive:true})

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

// Desktop KPI/toolbar audit on the approved desktop-polish Preview.
const dashboardCases=[
  ['/purchase/orders?range=all','.order-kpi-grid-v2 > .kpi-card',8,'Đơn nhập'],
  ['/purchase?range=all','.purchase-command-kpis-v2 > .command-kpi',8,'Tổng quan mua hàng'],
  ['/?range=all','main .kpi-grid > .kpi-card',6,'Dashboard tổng'],
  ['/warehouse','.whx-kpi-grid.seven > a',7,'Tổng quan kho'],
  ['/warehouse/inventory','.whx-kpi-grid.seven > a',7,'Tồn kho'],
  ['/warehouse/history','.whx-kpi-grid.five > div',5,'Lịch sử kho'],
  ['/sales?range=all','.sales-kpi-strip > .sales-kpi',7,'Tổng quan bán hàng'],
  ['/sales/customers','.customer-demo-kpis > a',4,'Khách hàng'],
  ['/sales/debt','.debt-demo-kpis > :is(a,div)',5,'Công nợ'],
  ['/finance?range=all','.finance-overview-kpis > .finance-kpi',6,'Tổng quan tài chính'],
  ['/finance/reports','.finance-report-kpis:not(.five) > .finance-kpi',3,'Báo cáo tài chính'],
  ['/finance/cashflow','.finance-kpi-grid > .finance-kpi',0,'Thu–Chi'],
]
for(const width of [1024,1440,2560]){
  await page.setViewportSize({width,height:900})
  for(const [path,selector,expected,label] of dashboardCases){
    await go(path)
    const m=await page.evaluate(sel=>{
      const els=[...document.querySelectorAll(sel)].filter(x=>getComputedStyle(x).display!=='none')
      const tops=els.map(x=>x.getBoundingClientRect().top)
      const parent=els[0]?.parentElement
      const pr=parent?.getBoundingClientRect()
      const style=els[0]?getComputedStyle(els[0]):null
      return {
        count:els.length,
        rowAligned:tops.length>0 && Math.max(...tops)-Math.min(...tops)<=3,
        radius:parseFloat(style?.borderTopLeftRadius||'0'),
        shadow:style?.boxShadow||'none',
        contained:!!pr&&pr.left>=-1&&pr.right<=innerWidth+2,
        documentWidth:document.documentElement.scrollWidth,
        viewport:innerWidth,
      }
    },selector)
    // Some cashflow KPI cards are generated client-side; check them when present.
    const validCount=expected===0?m.count>=1:m.count===expected
    rec(label+' — desktop KPI '+width,validCount&&m.rowAligned&&m.radius>=4&&m.radius<=8&&m.shadow!=='none'&&m.contained&&m.documentWidth<=width+2,m)
    if(width===1440){
      const safe=label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'-').toLowerCase()
      await page.screenshot({path:artifactDir+'/dashboard-'+safe+'-1440.png',fullPage:false})
    }
  }
  for(const t of [
    {path:'/purchase/accounts',bar:'.account-filter-bar.one-line',button:'.account-table-shell .managed-column-button',menu:'.account-table-shell .column-manager-menu',name:'User'},
    {path:'/purchase/orders',bar:'.order-toolbar.entity-command-bar',button:'.order-table-shell .managed-column-button',menu:'.order-table-shell .column-manager-menu',name:'Đơn nhập'},
    {path:'/finance/cashflow',bar:'.finance-toolbar-complete',button:'.finance-toolbar-complete .finance-column-button',menu:'.finance-column-manager-menu',name:'Thu–Chi'},
  ]){
    await go(t.path)
    const m=await page.evaluate(cfg=>{
      const bar=document.querySelector(cfg.bar),button=document.querySelector(cfg.button)
      const br=bar?.getBoundingClientRect(),cr=button?.getBoundingClientRect()
      return {barHeight:br?.height??0,buttonWidth:cr?.width??0,
        buttonInViewport:!!cr&&cr.left>=-1&&cr.right<=innerWidth+1,
        buttonAligned:!!br&&!!cr&&cr.top>=br.top-4&&cr.bottom<=br.bottom+5,
        documentWidth:document.documentElement.scrollWidth}
    },t)
    rec(t.name+' — single-row toolbar + cột '+width,
      m.barHeight>=28&&m.barHeight<=43&&m.buttonWidth>=25&&m.buttonInViewport&&m.buttonAligned&&m.documentWidth<=width+2,m)
    const trigger=page.locator(t.button).first()
    if(await trigger.count()){
      await trigger.click({timeout:5000})
      const popup=await page.evaluate(sel=>{
        const el=document.querySelector(sel),r=el?.getBoundingClientRect()
        return {present:!!el,visible:!!r&&r.width>100,left:r?.left??-1,right:r?.right??-1,viewport:innerWidth}
      },t.menu)
      rec(t.name+' — menu Cột gọn trong màn hình '+width,
        popup.present&&popup.visible&&popup.left>=-2&&popup.right<=popup.viewport+2,popup)
      await page.keyboard.press('Escape')
    }else rec(t.name+' — có nút Cột '+width,false)
  }
  await go('/purchase/orders?range=all')
  const express=page.locator('.order-kpi-grid-v2 > .express')
  rec('Đơn nhập — KPI Hỏa tốc hoạt động '+width,
    await express.count()===1&&String(await express.getAttribute('href')).includes('tracking=express_all'))
  await go('/purchase?range=all')
  rec('Mua hàng — KPI Hỏa tốc hoạt động '+width,
    await page.locator('.purchase-command-kpis-v2 > .express[href*="express_all"]').count()===1)
}
for(const [path,label]of [
  ['/?range=all','Toàn thời gian'],
  ['/purchase?range=quarter','Quý này'],
  ['/purchase/orders?range=year','Năm nay'],
  ['/sales?range=30d','30 ngày'],
  ['/finance?range=7d','7 ngày'],
]){
  await go(path)
  const selected=(await page.locator('.purchase-date-filter .command-range .active').allTextContents()).map(x=>x.trim())
  rec('Bộ lọc KPI '+path,selected.includes(label),{selected})
}

const pass=results.every(x=>x.pass)
console.log(JSON.stringify({preview:PREVIEW_URL,pass,results},null,2))
await browser.close()
if(!pass)process.exit(1)
