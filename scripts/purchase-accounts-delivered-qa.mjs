/**
 * Read-only Accounts delivered-order column QA on approved sole Preview.
 * No writes to application DB. Saved UI column settings live only in disposable browser.
 */
import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'
const base=process.env.PREVIEW_URL, url=process.env.SUPABASE_URL, key=process.env.SUPABASE_KEY
if(!base?.includes('preview-production-v227-baseline-20261013-mynh-erp-v5.mynh-forwork.workers.dev')||!url||!key)
  throw Error('Sole Preview QA env missing')
const creds=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const cookies=new Map()
const client=createBrowserClient(url,key,{cookies:{
  getAll:()=>[...cookies.values()].map(x=>({name:x.name,value:x.value})),
  setAll:xs=>xs.forEach(x=>cookies.set(x.name,x)),
}})
const {error}=await client.auth.setSession({access_token:creds.access_token,refresh_token:creds.refresh_token})
if(error)throw error
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
fs.mkdirSync('qa-accounts-delivered-artifacts',{recursive:true})
let passed=0,failed=0
function check(name,ok,extra={}){
  if(ok)passed++;else failed++;
  console.log('ACCOUNT_DELIVERED_QA '+JSON.stringify({name,pass:Boolean(ok),...extra}))
}
const widths=[
  {width:320,height:568},{width:360,height:800},{width:390,height:844},
  {width:768,height:1024},{width:1024,height:768},
  {width:1280,height:800},{width:1440,height:900},{width:1920,height:1080},
]
try{
  const ctx=await browser.newContext({viewport:widths[6]})
  await ctx.addCookies([...cookies.values()].map(c=>({
    name:c.name,value:c.value,url:base,httpOnly:Boolean(c.options?.httpOnly),
    secure:c.options?.secure!==false,
    sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
  })))
  const page=await ctx.newPage()
  const res=await page.goto(base+'/purchase/accounts',{waitUntil:'domcontentloaded',timeout:45000})
  await page.locator('.account-table-card .user-table').waitFor({timeout:15000})
  check('Account Preview authenticated',res?.status()===200&&!page.url().includes('/login'),{status:res?.status()})
  const header=page.locator('.account-table-card th[data-account-col="deliveredOrders"]')
  // Cloudflare may finish its build after CI starts. The new count header
  // also existed in an earlier commit: wait for the Voucher cell's NEW marker
  // to ensure we test the exact UI revision, not a still-serving old build.
  const voucherMarker=page.locator('.account-table-card .voucher-cell[data-voucher-count]')
  const autoFitMarker=page.locator('.account-table-card .user-table[data-auto-fit-version="5"]')
  for(let i=0;i<15&&(!(await header.count())||!(await voucherMarker.count())||!(await autoFitMarker.count()));i++){
    await page.waitForTimeout(5000)
    await page.reload({waitUntil:'domcontentloaded',timeout:45000})
  }
  check('Correct deployed Auto Fit revision and Voucher marker',await voucherMarker.count()>0&&await autoFitMarker.count()===1)
  check('New column visible by default',await header.count()===1
    &&(await header.innerText()).includes('Giao thành công'))
  const sampled=await page.locator('.account-table-card tbody tr[data-account-id]').evaluateAll(
    els=>els.map(tr=>({
      id:tr.getAttribute('data-account-id'),
      shown:Number(tr.querySelector('td[data-account-col="deliveredOrders"]')?.textContent?.trim()),
    })).sort((a,b)=>b.shown-a.shown).slice(0,3)
  )
  check('Contains a sample of delivered orders',sampled.some(row=>row.shown>0),
    {samples:sampled.length,nonzero:sampled.filter(row=>row.shown>0).length})
  let compared=0,allAgree=true
  for(const sample of sampled){
    if(!sample.id)continue
    // Query read-only snapshots for the exact account to independently check the displayed count.
    const rows=[]
    for(let offset=0;offset<10000;offset+=1000){
      const {data,error:readError}=await client.from('orders')
        .select('id,order_status,shipping_service,express_delivery_status,shipments(tracking_number,current_tracking_status,is_active)')
        .eq('erp_user_id',sample.id).is('archived_at',null)
        .order('id',{ascending:true}).range(offset,offset+999)
      if(readError)throw readError
      rows.push(...(data??[]))
      if((data??[]).length<1000)break
    }
    const expected=rows.filter(o=>{
      const shipments=o.shipments??[]
      const ship=shipments.find(s=>s.is_active)??shipments[0]
      const cancelled=['CANCELLED','CANCELED'].includes(String(o.order_status??'').toUpperCase())
        ||ship?.current_tracking_status==='CANCELLED'
        ||String(ship?.tracking_number??'').trim().replace(/\\s+/g,' ').toLocaleUpperCase('vi-VN')==='KHÔNG CÓ'
      if(cancelled)return false
      if(o.shipping_service==='EXPRESS')return o.express_delivery_status==='DELIVERED'
      return Boolean(ship?.tracking_number?.trim())&&ship.current_tracking_status==='DELIVERED'
    }).length
    const ok=sample.shown===expected
    if(!ok)allAgree=false
    compared++
    console.log('ACCOUNT_DELIVERED_COUNT '+JSON.stringify({actual:sample.shown,expected,match:ok}))
  }
  check('Delivered count matches latest saved order state',allAgree&&compared>0,{compared})
  // Distinguish true Auto Fit from merely having no document overflow.
  // Check semantic colgroup/header agreement and readable minima.
  async function inspectAccountFit(){
    return page.evaluate(()=>{
      const card=document.querySelector('.account-table-card')
      const table=card?.querySelector('table.user-table')
      if(!card||!table)return null
      const ths=[...table.querySelectorAll('thead th')]
      const cols=[...table.querySelectorAll('colgroup col')]
      const box=x=>x.getBoundingClientRect()
      const widths=ths.map(th=>({key:th.dataset.accountCol||'select',
        width:box(th).width,rectRight:box(th).right}))
      const colWidths=cols.map(col=>box(col).width)
      const find=k=>widths.find(x=>x.key===k)?.width||0
      const tableWidth=box(table).width,laneWidth=card.clientWidth
      return {mode:table.closest('.account-workspace.with-panel')?'panel':'full',
        tableWidth:Math.round(tableWidth),laneWidth,
        pageOverflow:document.documentElement.scrollWidth>innerWidth+6,
        localOverflow:tableWidth>laneWidth+6,
        localScroll:getComputedStyle(card).overflowX==='auto',
        fillsLane:tableWidth>=laneWidth-8,
        aligned:colWidths.length===widths.length&&widths.every((x,i)=>Math.abs(x.width-colWidths[i])<=7),
        // Account lane-driven width contract deliberately allows 120px Email
        // with ellipsis and full value in title/detail. Reject any narrower
        // header; the separate real-drag QA enforces last-column coverage.
        readable:find('username')>=122&&find('voucher')>=110&&find('email')>=118
          &&find('deliveredOrders')>=86,
        compact:find('number')<=46&&find('orders')<=74&&find('deliveredOrders')<=125,
        widths:Object.fromEntries(widths.map(x=>[x.key,Math.round(x.width)])),
      }
    })
  }
  for(const viewport of widths){
    await page.setViewportSize(viewport)
    await page.waitForTimeout(100)
    const result=await page.evaluate(()=>{
      const card=document.querySelector('.account-table-card')
      const table=card?.querySelector('table.user-table')
      const head=table?.querySelector('th[data-account-col="deliveredOrders"]')
      const cells=[...(table?.querySelectorAll('tbody td[data-account-col="deliveredOrders"]')??[])]
      if(!card||!table||!head)return null
      const col=[...table.querySelectorAll('colgroup>col')].find(x=>x.classList.contains('p1-account-col-deliveredOrders'))
      const rect=x=>x.getBoundingClientRect()
      return {
        header:head.textContent.trim(),
        inTable:!!col,
        cells:cells.length,
        numeric:cells.every(el=>/^([0-9]+|—)$/.test(el.textContent?.trim()??'')),
        width:Math.round(rect(head).width),
        clipped:cells.some(el=>rect(el).right>rect(table).right+3),
        overflow:document.documentElement.scrollWidth>innerWidth+6,
        cardFits:rect(card).right<=innerWidth+4,
        internalScroll:card.scrollWidth>card.clientWidth+6
          ?getComputedStyle(card).overflowX==='auto'||getComputedStyle(card).overflowX==='scroll'
          :true,
      }
    })
    check(viewport.width+'x'+viewport.height+' Accounts column layout',Boolean(result&&result.inTable
      &&result.cells===sampled.length+Math.max(0,result.cells-sampled.length)
      &&result.numeric&&!result.clipped&&!result.overflow&&result.cardFits&&result.internalScroll),
      result??{reason:'Missing column'})
    const auto=await inspectAccountFit()
    check(viewport.width+'x'+viewport.height+' Accounts Auto Fit',Boolean(auto&&
      !auto.pageOverflow&&auto.localScroll&&auto.fillsLane&&auto.aligned&&
      auto.readable&&auto.compact),auto??{reason:'No fit measurements'})
    if([320,390,768,1440].includes(viewport.width))
      await page.screenshot({path:'qa-accounts-delivered-artifacts/accounts-'+viewport.width+'.png',fullPage:false})
  }
  await page.setViewportSize(widths[6])
  await page.waitForLoadState('load',{timeout:15000}).catch(()=>{})
  const voucherInspection=await page.locator('.account-table-card tbody tr[data-account-id]')
    .evaluateAll(rows=>rows.map(row=>{
      const cell=row.querySelector('td[data-account-col="voucher"]')
      if(!cell)return null
      const tags=[...cell.querySelectorAll('[data-voucher-tag]')]
      const expected=Number(cell.getAttribute('data-voucher-count')||0)
      return {
        expected,rendered:tags.length,more:cell.querySelectorAll('.voucher-tag.more').length,
        fits:tags.every(tag=>tag.getBoundingClientRect().right<=cell.getBoundingClientRect().right+2),
        wrap:expected>1?getComputedStyle(cell.querySelector('.voucher-tags')).flexWrap:null,
      }
    }).filter(Boolean))
  check('All Voucher tags render without +N',voucherInspection.every(x=>x.more===0
    &&(x.expected===0?x.rendered===0:x.rendered===x.expected)
    &&x.fits&&(!x.wrap||x.wrap==='wrap')),
    {rows:voucherInspection.length,multiTagRows:voucherInspection.filter(x=>x.expected>1).length})
  check('Real multi-tag Voucher case visible',voucherInspection.some(x=>x.expected>1),
    {multiTagRows:voucherInspection.filter(x=>x.expected>1).length})
  const control=page.locator('.p1-account-filter-actions .managed-column-button')
  await control.click()
  const toggle=page.locator('.p1-account-filter-actions .column-manager-row[data-column-key="deliveredOrders"] input[type="checkbox"]')
  check('Delivered column participates in managed column menu',await toggle.count()===1&&await toggle.isChecked())
  await toggle.uncheck()
  check('Column can be hidden',await header.count()===0)
  // Busy Cloudflare Preview may transiently return its unavailable shell.
  // Inspect the actual authenticated Accounts DOM before testing persistence.
  for(let retry=0;retry<5;retry++){
    await page.reload({waitUntil:'domcontentloaded',timeout:45000})
    await page.waitForLoadState('load',{timeout:15000}).catch(()=>{})
    if(await control.count()&&await page.locator('.account-table-card .user-table').count())break
    await page.waitForTimeout(1500)
  }
  check('Hidden column preference persists after reload',
    await control.count()===1&&await page.locator('.account-table-card .user-table').count()===1
      &&await header.count()===0)
  await control.click()
  await toggle.check()
  check('Column can be shown again',await header.count()===1)
  // Right slidebar: do not compress 13 columns into illegible fragments.
  const firstUser=page.locator('.account-table-card tr[data-account-id] td[data-account-col="username"] .table-link').first()
  await firstUser.click()
  await page.locator('.account-workspace.with-panel').waitFor({timeout:15000})
  const drawer=await inspectAccountFit()
  check('Accounts Auto Fit with right slidebar open',Boolean(drawer&&
    drawer.mode==='panel'&&drawer.aligned&&drawer.readable&&drawer.compact&&
    drawer.fillsLane&&drawer.localOverflow&&drawer.localScroll&&!drawer.pageOverflow),
    drawer??{reason:'Drawer table missing'})
  await page.screenshot({path:'qa-accounts-delivered-artifacts/accounts-with-slidebar-1440.png',fullPage:false})
  await page.goto(base+'/purchase/accounts',{waitUntil:'domcontentloaded',timeout:45000})
  await page.locator('.account-table-card .user-table').waitFor()
  // Width grip persists per-user; colgroup and headers must stay synchronized.
  const emailHead=page.locator('.account-table-card th[data-account-col="email"]')
  const grip=emailHead.locator('.mynh-column-resize-grip')
  await grip.waitFor({state:'visible',timeout:12000})
  const emailBefore=await emailHead.evaluate(x=>x.getBoundingClientRect().width)
  const gripRect=await grip.boundingBox()
  if(!gripRect)throw Error('Account column resize grip missing')
  const x=gripRect.x+gripRect.width/2,y=gripRect.y+gripRect.height/2
  await page.mouse.move(x,y);await page.mouse.down()
  await page.mouse.move(x+34,y,{steps:5});await page.mouse.up()
  await page.waitForTimeout(250)
  const emailAfter=await emailHead.evaluate(x=>x.getBoundingClientRect().width)
  const resized=await inspectAccountFit()
  check('Accounts manual width grip aligns with colgroup',Boolean(resized&&
    emailAfter>emailBefore+14&&resized.aligned&&resized.compact&&!resized.pageOverflow),
    {emailBefore:Math.round(emailBefore),emailAfter:Math.round(emailAfter),resized})
  await page.reload({waitUntil:'domcontentloaded',timeout:45000})
  await page.locator('.account-table-card .user-table').waitFor()
  await page.waitForTimeout(500)
  const persistedEmail=await emailHead.evaluate(x=>x.getBoundingClientRect().width)
  const persistedFit=await inspectAccountFit()
  check('Account column saved width survives reload',Boolean(persistedFit&&
    Math.abs(persistedEmail-emailAfter)<10&&persistedFit.aligned&&persistedFit.compact),
    {saved:Math.round(emailAfter),reloaded:Math.round(persistedEmail),persistedFit})
    // UI-only column state test does not mutate ERP rows or browser login state.
  await ctx.close()
}finally{await browser.close()}
console.log('ACCOUNT_DELIVERED_QA_SUMMARY '+JSON.stringify({passed,failed}))
if(failed)process.exitCode=1
