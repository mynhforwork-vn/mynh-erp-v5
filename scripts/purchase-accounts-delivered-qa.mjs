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
  const clientErrors=[]
  page.on('pageerror',err=>clientErrors.push(err.name||'PageError'))
  const res=await page.goto(base+'/purchase/accounts',{waitUntil:'domcontentloaded',timeout:45000})
  await page.locator('.account-table-card .user-table').waitFor({timeout:15000})
  check('Account Preview authenticated',res?.status()===200&&!page.url().includes('/login'),{status:res?.status()})
  const header=page.locator('.account-table-card th[data-account-col="deliveredOrders"]')
  // Cloudflare may finish its build after CI starts. The new count header
  // also existed in an earlier commit: wait for the Voucher cell's NEW marker
  // to ensure we test the exact UI revision, not a still-serving old build.
  const voucherMarker=page.locator('.account-table-card .voucher-cell[data-voucher-count]')
  const autoFitMarker=page.locator('.account-table-card .user-table[data-auto-fit-version="7"]')
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
  // Check semantic colgroup/header agreement and readable minima
  // for the ACTUALLY VISIBLE responsive columns.
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
      const stacked=table.dataset.accountLayout==='stacked'
      const expected=['number','username','platform','phone','email','status',
        'mobile','browser','voucher','orders','deliveredOrders','createdAt','note']
      const visible=widths.filter(x=>x.key!=='select').map(x=>x.key)
      const allPresent=expected.every(key=>visible.includes(key))
        &&[...table.querySelectorAll('tbody tr[data-account-id]')].every(row=>
          expected.every(key=>row.querySelector('td[data-account-col="'+key+'"]')))
      const labeled=stacked&&[...table.querySelectorAll('tbody tr[data-account-id]')].every(row=>
        expected.every(key=>row.querySelector('td[data-account-col="'+key+'"]')
          ?.getAttribute('data-account-label')))
      const tableWidth=box(table).width,laneWidth=card.clientWidth
      return {mode:table.closest('.account-workspace.with-panel')?'panel':'full',
        stacked,allPresent,labeled,visibleCount:visible.length,
        tableWidth:Math.round(tableWidth),laneWidth,
        pageOverflow:document.documentElement.scrollWidth>innerWidth+6,
        localOverflow:tableWidth>laneWidth+6,
        noHorizontalScroll:card.scrollWidth<=card.clientWidth+4,
        localScroll:stacked
          ?!/auto|scroll/.test(getComputedStyle(card).overflowX)
             &&/auto|scroll/.test(getComputedStyle(card).overflowY)
          :/auto|scroll/.test(getComputedStyle(card).overflowX),
        fillsLane:tableWidth>=laneWidth-8&&tableWidth<=laneWidth+4,
        aligned:stacked?Boolean(labeled):colWidths.length===widths.length
          &&widths.every((x,i)=>Math.abs(x.width-colWidths[i])<=7),
        // Account lane-driven width contract deliberately allows 120px Email
        // with ellipsis and full value in title/detail. Reject any narrower
        // header; the separate real-drag QA enforces last-column coverage.
        // Stacked is now strictly Mobile: the header has five compact
        // filter slots; readability must be measured in the actual labeled
        // Username CELL, not the much narrower header filter button slot.
        readable:stacked?allPresent&&[...table.querySelectorAll('tbody tr[data-account-id]')]
          .every(row=>{
            const cell=row.querySelector('td[data-account-col="username"]')
            const link=cell?.querySelector('.table-link')
            return cell&&link&&box(cell).width>=Math.min(150,laneWidth-28)
              &&getComputedStyle(cell).display!=='none'
              &&box(link).width>=32
          })
          :find('username')>=56&&find('voucher')>=24
            &&find('email')>=42&&find('deliveredOrders')>=32,
        compact:stacked?allPresent
          :find('number')<=48&&find('orders')<=85&&find('deliveredOrders')<=140,
        widths:Object.fromEntries(widths.map(x=>[x.key,Math.round(x.width)])),
      }
    })
  }
  for(const viewport of widths){
    await page.setViewportSize(viewport)
    // Width-changing sidebars & breakpoints may need two animation frames.
    let fitReady=false
    for(let attempt=0;attempt<4;attempt++){
      try{
        await page.waitForFunction(()=>{
        const card=document.querySelector('.account-table-card')
        const table=card?.querySelector('table.user-table')
        if(!card||!table)return false
        const head=(key)=>table.querySelector('thead th[data-account-col="'+key+'"]')
        const size=(el)=>el?.getBoundingClientRect().width??0
        const number=head('number'),orders=head('orders'),delivered=head('deliveredOrders')
        const stacked=table.dataset.accountLayout==='stacked'
        const expected=['number','username','platform','phone','email','status',
          'mobile','browser','voucher','orders','deliveredOrders','createdAt','note']
        return Math.abs(table.getBoundingClientRect().width-card.clientWidth)<=8
          &&card.scrollWidth<=card.clientWidth+4
          &&(stacked?expected.every(key=>Boolean(head(key)))
            :table.classList.contains('mynh-resizable-table')
              &&(!number||size(number)<=48)
              &&(!orders||size(orders)<=85)
              &&(!delivered||size(delivered)<=140))
        },null,{timeout:15000})
        fitReady=true
        break
      }catch(error){
        const present=await page.locator('.account-table-card table[data-auto-fit-version="7"]').count()
        const checkpoint=await page.evaluate(()=>({
          ready:document.readyState,pathname:location.pathname,
          hasTable:!!document.querySelector('.account-table-card'),
          title:document.title,
        }))
        console.log('ACCOUNT_DELIVERED_RETRY '+JSON.stringify({
          viewport:viewport.width,attempt,present,diagnostic:checkpoint,clientErrors,
        }))
        // Retry only transient Preview route/ChunkLoad failure. Persistent
        // real layout misalignment remains a test failure at the last try.
        if(attempt<3){
          await page.reload({waitUntil:'domcontentloaded',timeout:45000})
          await page.locator('.account-table-card table[data-auto-fit-version="7"]')
            .waitFor({timeout:20000})
          continue
        }
        const geometry=await page.evaluate(()=>{
        const card=document.querySelector('.account-table-card')
        const table=card?.querySelector('table.user-table')
        return {lane:card?.clientWidth,scroll:card?.scrollWidth,
          table:table?.getBoundingClientRect().width,
          managed:table?.classList.contains('mynh-resizable-table'),
          pane:!!card?.closest('.account-workspace.with-panel'),
          columns:table?.querySelectorAll('thead th').length}
      })
      const diagnostic=await page.evaluate(()=>({
        pathname:location.pathname,ready:document.readyState,
        title:document.title,
        mainChildren:document.querySelector('main')?.childElementCount??0,
        accountScreens:document.querySelectorAll('.account-screen').length,
        errorBlocks:document.querySelectorAll('.error-box').length,
        tableCards:document.querySelectorAll('.account-table-card').length,
      }))
      console.log('ACCOUNT_DELIVERED_BREAKPOINT_FAIL '+JSON.stringify({
        viewport:viewport.width,geometry,diagnostic,clientErrors,
      }))
      await page.screenshot({
        path:'qa-accounts-delivered-artifacts/accounts-breakpoint-fail-'+viewport.width+'.png',
        fullPage:false,
      }).catch(()=>{})
        throw error
      }
    }
    if(!fitReady)throw Error('Account table failed to stabilize at '+viewport.width)
    const result=await page.evaluate(()=>{
      const card=document.querySelector('.account-table-card')
      const table=card?.querySelector('table.user-table')
      const head=table?.querySelector('th[data-account-col="deliveredOrders"]')
      const cells=[...(table?.querySelectorAll('tbody td[data-account-col="deliveredOrders"]')??[])]
      if(!card||!table)return null
      const col=[...table.querySelectorAll('colgroup>col')].find(x=>x.classList.contains('p1-account-col-deliveredOrders'))
      const rect=x=>x.getBoundingClientRect()
      return {
        header:head?.textContent?.trim()??null,
        inTable:!!col,
        intentionallyCompact:false,
        cells:cells.length,
        numeric:cells.every(el=>/^([0-9]+|—)$/.test(el.textContent?.trim()??'')),
        width:head?Math.round(rect(head).width):0,
        clipped:cells.some(el=>rect(el).right>rect(table).right+3),
        overflow:document.documentElement.scrollWidth>innerWidth+6,
        cardFits:rect(card).right<=innerWidth+4,
        internalScroll:card.scrollWidth>card.clientWidth+6
          ?getComputedStyle(card).overflowX==='auto'||getComputedStyle(card).overflowX==='scroll'
          :true,
      }
    })
    check(viewport.width+'x'+viewport.height+' Accounts column layout',Boolean(result
      &&result.inTable&&result.cells>=sampled.length
      &&result.numeric&&!result.clipped&&!result.overflow&&result.cardFits&&result.internalScroll),
      result??{reason:'Missing column'})
    const auto=await inspectAccountFit()
    check(viewport.width+'x'+viewport.height+' Accounts Auto Fit',Boolean(auto&&
      !auto.pageOverflow&&auto.noHorizontalScroll&&auto.localScroll
      &&auto.fillsLane&&auto.aligned&&auto.readable&&auto.compact&&auto.allPresent),auto??{reason:'No fit measurements'})
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
  const toggle=page.locator('body>.p1-account-floating-menu .column-manager-row[data-column-key="deliveredOrders"] input[type="checkbox"]')
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
  // Right slidebar: keep the REAL semantic table on Desktop, never
  // switch thead to flex-wrap and tbody rows to CSS grid/cards.
  const firstUser=page.locator('.account-table-card tr[data-account-id] td[data-account-col="username"] .table-link').first()
  await firstUser.click()
  await page.locator('.account-workspace.with-panel').waitFor({timeout:15000})
  const drawer=await inspectAccountFit()
  check('Accounts Auto Fit with right slidebar open: every enabled field stays visible',Boolean(drawer&&
    drawer.mode==='panel'&&!drawer.stacked&&drawer.allPresent
    &&drawer.aligned&&drawer.readable&&drawer.compact&&
    drawer.fillsLane&&drawer.noHorizontalScroll&&drawer.localScroll&&!drawer.pageOverflow),
    drawer??{reason:'Drawer table missing'})
  await page.screenshot({path:'qa-accounts-delivered-artifacts/accounts-with-slidebar-1440.png',fullPage:false})
  await page.goto(base+'/purchase/accounts',{waitUntil:'domcontentloaded',timeout:45000})
  // Width grip is added by client hydration; SSR table alone is not readiness.
  // Allow bounded retry for transient Preview assets. Never treat a missing
  // resize grip as PASS: the final attempt still throws.
  const emailHead=page.locator('.account-table-card th[data-account-col="email"]')
  const grip=emailHead.locator('.mynh-column-resize-grip')
  for(let attempt=0;attempt<3;attempt++){
    await page.locator('.account-table-card .user-table').waitFor({timeout:15000})
    try{
      await grip.waitFor({state:'visible',timeout:12000})
      break
    }catch(error){
      console.log('ACCOUNT_DELIVERED_GRIP_READINESS '+JSON.stringify({
        attempt:attempt+1,
        table:await page.locator('.account-table-card .user-table').count(),
        hydrated:await page.locator('.account-table-card .user-table.mynh-resizable-table').count(),
        grip:await grip.count(),
      }))
      if(attempt===2)throw error
      await page.reload({waitUntil:'domcontentloaded',timeout:45000})
    }
  }
  // The actual pointer drag below remains mandatory for PASS.
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
  // The SSR table can briefly have oversized default widths. Wait for the
  // actual React hydration + Auto Fit to settle, without weakening any gate.
  await page.locator('.account-table-card[data-client-ready="true"]').waitFor({timeout:20000})
  try{
    await page.waitForFunction(saved=>{
      const card=document.querySelector('.account-table-card')
      const table=card?.querySelector('table.user-table')
      const email=table?.querySelector('th[data-account-col="email"]')
      if(!card||!table||!email)return false
      return Math.abs(table.getBoundingClientRect().width-card.clientWidth)<=8
        &&card.scrollWidth<=card.clientWidth+4
        &&Math.abs(email.getBoundingClientRect().width-saved)<10
    },emailAfter,{timeout:12000})
  }catch{
    // Let the original exact persistence assertion FAIL with measurements.
    console.log('ACCOUNT_DELIVERED_PERSISTENCE_SETTLE_TIMEOUT')
  }
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
