/**
 * Account table Auto Fit QA: actual mouse drags + navigation sidebar expand/
 * collapse, mixed left/right open-close permutations (one right detail slidebar),
 * manual column widths and persistence. Read-only ERP access.
 */
import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const base=process.env.PREVIEW_URL,url=process.env.SUPABASE_URL,key=process.env.SUPABASE_KEY
if(!base?.includes('preview-production-v227-baseline-20261013-mynh-erp-v5.mynh-forwork.workers.dev')||!url||!key)
  throw Error('Wrong sole Preview QA env')
const creds=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const cookies=new Map()
const sb=createBrowserClient(url,key,{cookies:{
  getAll:()=>[...cookies.values()].map(c=>({name:c.name,value:c.value})),
  setAll:xs=>xs.forEach(x=>cookies.set(x.name,x)),
}})
const {error}=await sb.auth.setSession({access_token:creds.access_token,refresh_token:creds.refresh_token})
if(error)throw error
const orders=await sb.from('orders').select('erp_user_id').not('erp_user_id','is',null).is('archived_at',null).limit(300)
if(orders.error)throw orders.error
const ids=[...new Set((orders.data??[]).map(x=>x.erp_user_id).filter(Boolean))]
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const dir='qa-accounts-real-autofit-artifacts'
fs.mkdirSync(dir,{recursive:true})
let passed=0,failed=0
function check(name,ok,info={}){
  console.log('REAL_ACCOUNT_FIT_QA '+JSON.stringify({name,pass:!!ok,...info}))
  if(ok)passed++;else failed++
}
async function snap(page){
  await page.waitForTimeout(300)
  return page.evaluate(()=>{
    const w=document.querySelector('.account-workspace')
    const card=w?.querySelector('.account-table-card')
    const table=card?.querySelector('table.user-table')
    const shell=document.querySelector('.brand-shell-v1')
    if(!w||!card||!table||!shell)return null
    const heads=[...table.querySelectorAll('thead th')]
    const cols=[...table.querySelectorAll('colgroup col')]
    const width=e=>e.getBoundingClientRect().width
    const c=Object.fromEntries(heads.map(h=>[h.dataset.accountCol??'select',Math.round(width(h))]))
    const stacked=table.dataset.accountLayout==='stacked'
    const firstData=table.querySelector('tbody tr[data-account-id]')
    const semanticDesktop=!stacked
      &&getComputedStyle(table).display==='table'
      &&getComputedStyle(table.tHead).display==='table-header-group'
      &&getComputedStyle(table.tHead.rows[0]).display==='table-row'
      &&(!firstData||getComputedStyle(firstData).display==='table-row')
      &&(!firstData?.querySelector('td')
        ||getComputedStyle(firstData.querySelector('td')).display==='table-cell')
    const headerRowHeight=Math.round(table.tHead.rows[0].getBoundingClientRect().height)
    const firstDataHeight=firstData
      ?Math.round(firstData.getBoundingClientRect().height):0
    const expected=['number','username','platform','phone','email','status',
      'mobile','browser','voucher','orders','deliveredOrders','createdAt','note']
    const allFields=expected.every(key=>table.querySelector('thead th[data-account-col="'+key+'"]'))
      &&[...table.querySelectorAll('tbody tr[data-account-id]')].every(tr=>
        expected.every(key=>tr.querySelector('td[data-account-col="'+key+'"]')))
    const labeled=stacked&&[...table.querySelectorAll('tbody tr[data-account-id]')].every(tr=>
      expected.every(key=>Boolean(tr.querySelector('td[data-account-col="'+key+'"]')
        ?.getAttribute('data-account-label'))))
    const aligned=stacked?Boolean(labeled)
      :heads.length===cols.length&&heads.every((h,i)=>Math.abs(width(h)-width(cols[i]))<=5)
    const tableRect=table.getBoundingClientRect()
    const lastHeader=heads.at(-1)?.getBoundingClientRect()
    const rightGap=lastHeader?Math.round(tableRect.right-lastHeader.right):999
    const firstHeader=heads[0]?.getBoundingClientRect()
    const leftGap=firstHeader?Math.round(firstHeader.left-tableRect.left):999
    // Prevent green QA while column DOM stops 140px short of the card,
    // exactly the regression reported by the real browser screenshots.
    const headerCoverage=stacked?Boolean(labeled)
      :Math.abs(rightGap)<=5&&Math.abs(leftGap)<=5
    // Header isolation: Voucher/Số đơn text must not paint over the next
    // label, even when the resize handle is absolutely positioned.
    const guarded=stacked?Boolean(labeled):['voucher','orders','deliveredOrders'].every(key=>{
      const th=table.querySelector('thead th[data-account-col="'+key+'"]')
      if(!th)return true // user explicitly hid it
      const st=getComputedStyle(th)
      return st.overflowX==='hidden'&&th.getBoundingClientRect().width>=12
    })
    return {panelCount:w.querySelectorAll(':scope>aside.system-slidebar-v1').length,
      leftCollapsed:shell.classList.contains('desktop-sidebar-collapsed'),
      lane:Math.round(card.clientWidth),table:Math.round(width(table)),
      pageOverflow:document.documentElement.scrollWidth>innerWidth+5,
      horizontalScroll:card.scrollWidth>card.clientWidth+4,
      scroll:stacked?/auto|scroll/.test(getComputedStyle(card).overflowY)
        :/auto|scroll/.test(getComputedStyle(card).overflowX),
      stacked,semanticDesktop,headerRowHeight,firstDataHeight,
      allFields,labeled,aligned,headerCoverage,guarded,leftGap,rightGap,
      customized:table.classList.contains('mynh-resizable-table'),
      sameDocument:window.__mynhAccountQaDocument==='no-reload',
      storedManual:(()=>{
        try{
          const key=Object.keys(localStorage).find(k=>k.startsWith('mynh-col-widths-v1:/purchase/accounts:')&&k.includes('user-table'))
          const stored=key?JSON.parse(localStorage.getItem(key)??'{}'):{}
          return {voucher:stored['Voucher đã dùng'],orders:stored['Số đơn'],
            username:stored.Username}
        }catch{return {}}
      })(),
      col:c,
    }
  })
}
function fit(s){return !!s&&s.sameDocument&&!s.pageOverflow&&!s.horizontalScroll
  &&s.semanticDesktop&&!s.stacked&&s.headerRowHeight<=85
  &&s.firstDataHeight<=95&&s.allFields
  &&s.aligned&&s.headerCoverage&&s.guarded&&s.scroll
  &&s.table>=s.lane-8&&s.table<=s.lane+4
  &&s.col.username>=56&&(s.stacked||s.col.number<=48)}
const ranges=[{width:1024,height:768},{width:1280,height:800},
  {width:1366,height:768},{width:1440,height:900},
  {width:1728,height:1117},{width:1920,height:1080}]
try{
 for(const viewport of ranges){
  const ctx=await browser.newContext({viewport})
  await ctx.addCookies([...cookies.values()].map(c=>({
    name:c.name,value:c.value,url:base,httpOnly:!!c.options?.httpOnly,
    secure:c.options?.secure!==false,
    sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
  })))
  const page=await ctx.newPage()
  await page.goto(base+'/purchase/accounts',{waitUntil:'domcontentloaded',timeout:45000})
  await page.locator('.account-table-card table[data-auto-fit-version="7"]').waitFor({timeout:25000})
  // Only accept the hydrated, lane-fitted DOM. Do not accept any local
  // horizontal scrollbar, even in the narrow User detail lane (780/800px).
  await page.waitForFunction(()=>{
    const card=document.querySelector('.account-table-card')
    const table=card?.querySelector('table[data-auto-fit-version="7"]')
    if(!card||!table)return false
    if(table.dataset.accountLayout==='stacked'){
      const keys=['number','username','platform','phone','email','status',
        'mobile','browser','voucher','orders','deliveredOrders','createdAt','note']
      if(!keys.every(k=>table.querySelector('th[data-account-col="'+k+'"]')))
        return false
    }else if(!table.classList.contains('mynh-resizable-table'))return false
    const rect=table.getBoundingClientRect()
    return rect.width<=card.clientWidth+4&&rect.width>=card.clientWidth-8
      &&card.scrollWidth<=card.clientWidth+4
  },null,{timeout:20000})
  // Navigation between User and Order may update RSC data but must not reload
  // the browser document. Explicit persistence reload is handled separately.
  await page.evaluate(()=>{window.__mynhAccountQaDocument='no-reload'})
  const initial=await snap(page)
  check(viewport.width+' initial 0 panels',fit(initial)&&initial.panelCount===0,initial??{})
  const toggle=page.locator('.desktop-sidebar-seam-handle .sidebar-collapse-toggle')
  async function leftTo(desired,label,prev){
    const current=(await snap(page))?.leftCollapsed
    if(current!==desired){
      await toggle.click()
      await page.waitForFunction(x=>document.querySelector('.brand-shell-v1')?.classList.contains('desktop-sidebar-collapsed')===x,
        desired,{timeout:12000})
    }
    const next=await snap(page)
    check(viewport.width+' '+label,fit(next)&&next.leftCollapsed===desired
      &&next.panelCount===prev.panelCount
      &&(current===desired||Math.abs(next.lane-prev.lane)>=95),
      {before:prev.lane,...next})
    return next
  }
  const custom=new Map()
  async function drag(key,delta){
    const head=page.locator('.account-table-card th[data-account-col="'+key+'"]')
    const grip=head.locator('.mynh-column-resize-grip')
    const present=await grip.count()===1
    check(viewport.width+' '+key+' resize grip installed',present)
    if(!present)return
    // Đúng mẫu Đơn nhập: tay nắm hiện đường phân cách khi hover, không
    // vẽ viền thường trực. Rê chuột thật trước khi kiểm tra khả năng kéo.
    await grip.hover()
    const visible=await grip.evaluate(el=>{
      const style=getComputedStyle(el)
      const box=el.getBoundingClientRect()
      return box.width>=12&&style.cursor==='col-resize'
        &&style.pointerEvents!=='none'
        &&style.borderRightColor!=='rgba(0, 0, 0, 0)'
    })
    check(viewport.width+' '+key+' grip visible and grabbable',visible)
    await grip.scrollIntoViewIfNeeded()
    const before=await head.evaluate(el=>el.getBoundingClientRect().width)
    const box=await grip.boundingBox()
    if(!box){check(viewport.width+' '+key+' grip visible',false);return}
    const x=box.x+box.width/2,y=box.y+box.height/2
    await page.mouse.move(x,y);await page.mouse.down()
    await page.mouse.move(x+delta,y,{steps:8})
    await page.mouse.up()
    const after=await snap(page)
    check(viewport.width+' actual drag '+key,
      fit(after)&&after.customized&&Math.abs(after.col[key]-(before+delta))<=12,
      {before:Math.round(before),expected:Math.round(before+delta),after:after.col[key],snapshot:after})
    custom.set(key,after.col[key])
  }
  if(viewport.width===1440){
    await drag('voucher',52)
    await drag('orders',32)
    const s=await snap(page)
    check('1440 two saved column overrides active',
      fit(s)&&s.customized&&custom.size===2&&[...custom].every(([k,v])=>Math.abs(s.col[k]-v)<=4),s??{})
  }
  async function preserve(label,prev){
    const s=await snap(page)
    check(viewport.width+' '+label,fit(s)
      &&[...custom].every(([k,v])=>Math.abs(Number(s.storedManual[k])-v)<=7),
      {beforeLane:prev.lane,...s,manual:Object.fromEntries(custom)})
    if(viewport.width===1440)
      await page.screenshot({path:dir+'/1440-'+label.replaceAll(/[^a-z0-9-]/gi,'-')+'.png',fullPage:false})
    return s
  }
  let before=await snap(page)
  let collapsed=await leftTo(true,'0-panel left collapsed',before)
  await preserve('0-panel-after-left-collapse',before)
  before=await leftTo(false,'0-panel left expanded',collapsed)
  await preserve('0-panel-after-left-expansion',collapsed)

  const displayed=await page.locator('.account-table-card tbody tr[data-account-id]').evaluateAll(
    els=>els.map(el=>el.getAttribute('data-account-id')))
  const target=ids.find(id=>displayed.includes(id))
  if(!target){check(viewport.width+' real account with order exists',false,{count:displayed.length});await ctx.close();continue}
  const userLink=page.locator('.account-table-card tr[data-account-id="'+target+'"] td[data-account-col="username"] .table-link')
  async function rightUserTo(open,label,previous){
    if(open){
      await userLink.click()
      await page.locator('.account-workspace>.account-detail-panel').waitFor({timeout:20000})
    }else{
      await page.locator('.account-workspace>.account-detail-panel a.close').click()
      await page.locator('.account-workspace>.account-detail-panel').waitFor({state:'detached',timeout:20000})
    }
    const now=await snap(page)
    check(viewport.width+' '+label,
      fit(now)&&now.panelCount===(open?1:0)&&now.leftCollapsed===previous.leftCollapsed
      &&Math.abs(now.lane-previous.lane)>=180
      &&[...custom].every(([k,v])=>Math.abs(Number(now.storedManual[k])-v)<=7),
      {before:previous,...now,manual:Object.fromEntries(custom)})
    return now
  }
  await userLink.click()
  await page.locator('.account-workspace>.account-detail-panel').waitFor({timeout:20000})
  before=await snap(page)
  check(viewport.width+' 1 right panel opened',fit(before)&&before.panelCount===1,before??{})
  // On a narrow right-pane lane, ALL enabled Account fields appear as
  // labeled rows. There is no horizontal column divider to drag in this mode;
  // drag preferences remain stored and return in the wide table view.
  if(before.stacked){
    check(viewport.width+' right panel shows all 13 Account fields',
      before.allFields&&before.labeled&&!before.horizontalScroll,before)
  }else if(viewport.width===1280||viewport.width===1440){
    await drag('username',26)
  }
  await preserve('1-panel-with-saved-widths',before)
  collapsed=await leftTo(true,'1-panel left collapsed',before)
  await preserve('1-panel-collapse-preserves-drag',before)
  before=await leftTo(false,'1-panel left expanded',collapsed)
  await preserve('1-panel-expand-preserves-drag',collapsed)

  // Complete 2×2 left-navigation × right-User drawer transition matrix,
  // including mixed sequences. A check after every transition rejects stale
  // table fit and lost manual column widths; no document reload is allowed.
  collapsed=await leftTo(true,'mixed: close left while right User open',before)
  await preserve('mixed-left-closed-right-open',before)
  before=await rightUserTo(false,'mixed: close right while left closed',collapsed)
  collapsed=await leftTo(false,'mixed: open left while right closed',before)
  await preserve('mixed-left-open-right-closed',before)
  before=await leftTo(true,'mixed: close left with right already closed',collapsed)
  collapsed=await rightUserTo(true,'mixed: open right while left closed',before)
  before=await leftTo(false,'mixed: open left while right User open',collapsed)
  await preserve('mixed-both-open',collapsed)
  collapsed=await rightUserTo(false,'mixed: close right while left open',before)
  before=await rightUserTo(true,'mixed: reopen right with left still open',collapsed)
  await preserve('mixed-both-open-again',collapsed)

  await page.locator('.account-workspace>.account-detail-panel .user-panel-tabs a').filter({hasText:'Đơn hàng'}).click()
  const firstOrder=page.locator('.account-workspace>.account-detail-panel .user-order-list a.user-order-card').first()
  await firstOrder.waitFor({timeout:20000})
  await firstOrder.click()
  await page.locator('.account-workspace>.context-order-panel').waitFor({timeout:20000})
  await page.locator('.account-workspace>.account-detail-panel').waitFor({state:'detached',timeout:20000})
  before=await snap(page)
  check(viewport.width+' order replaces User in one right panel',fit(before)&&before.panelCount===1,before??{})
  await preserve('order-panel-with-saved-widths',before)
  collapsed=await leftTo(true,'order-panel left collapsed',before)
  await preserve('order-panel-collapse-preserves-drag',before)
  before=await leftTo(false,'order-panel left expanded',collapsed)
  await preserve('order-panel-expand-preserves-drag',collapsed)

  // Back also has to preserve fit when the navigation sidebar is collapsed.
  collapsed=await leftTo(true,'order before Back: left collapsed',before)
  await page.locator('.account-workspace>.context-order-panel .context-stack-back').click()
  await page.locator('.account-workspace>.context-order-panel').waitFor({state:'detached',timeout:20000})
  await page.locator('.account-workspace>.account-detail-panel').waitFor({timeout:20000})
  before=await snap(page)
  check(viewport.width+' back from Order to User: left still collapsed',
    fit(before)&&before.panelCount===1&&before.leftCollapsed
    &&[...custom].every(([k,v])=>Math.abs(Number(before.storedManual[k])-v)<=7),before??{})
  const expanded=await leftTo(false,'User after Back: left expanded',before)
  before=expanded
  check(viewport.width+' back from Order to User: one panel Auto Fit',fit(before)&&before.panelCount===1,before??{})
  await preserve('1-panel-return-preserves-widths',before)
  await page.locator('.account-workspace>.account-detail-panel a.close').click()
  await page.locator('.account-workspace>.account-detail-panel').waitFor({state:'detached',timeout:20000})
  before=await snap(page)
  check(viewport.width+' 1 to 0 right panel Auto Fit',fit(before)&&before.panelCount===0,before??{})
  await preserve('0-panel-return-preserves-widths',before)

  if(viewport.width===1440){
    const prior=await snap(page)
    await page.reload({waitUntil:'domcontentloaded',timeout:45000})
    await page.locator('.account-table-card table').waitFor({timeout:25000})
    await page.evaluate(()=>{window.__mynhAccountQaDocument='no-reload'})
    const reloaded=await snap(page)
    check('1440 Voucher and Số đơn preserved after reload',
      fit(reloaded)&&reloaded.customized&&[...custom].every(([k,v])=>Math.abs(Number(reloaded.storedManual[k])-v)<=7),
      {prior,after:reloaded,manual:Object.fromEntries(custom)})
    // Return to truly natural sizing through the existing supported double-click reset.
    for(const k of custom.keys()){
      const grip=page.locator('.account-table-card th[data-account-col="'+k+'"] .mynh-column-resize-grip')
      await grip.scrollIntoViewIfNeeded()
      await grip.dblclick()
    }
    const reset=await snap(page)
    check('1440 double-click resets Voucher and Số đơn widths',fit(reset)
      &&Math.abs(reset.col.voucher-initial.col.voucher)<=20
      &&Math.abs(reset.col.orders-initial.col.orders)<=12,{reset,initial})
  }
  await ctx.close()
 }
}finally{await browser.close()}
console.log('REAL_ACCOUNT_FIT_QA_SUMMARY '+JSON.stringify({passed,failed}))
if(failed)process.exitCode=1
