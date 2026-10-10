// PR #59 — read-only responsive table QA on authenticated Named Preview.
// Uses the workflow's disposable QA session and tracking fixture. Never writes to DB.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const base=process.env.PREVIEW_URL
const supabaseUrl=process.env.SUPABASE_URL
const supabaseKey=process.env.SUPABASE_KEY
assert.ok(base&&supabaseUrl&&supabaseKey,'Missing preview/browser QA configuration')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
assert.ok(session.fixtures?.hub_order_code,'Missing isolated Tracking fixture')
const output='qa-tracking-slidebar-artifacts'
fs.mkdirSync(output,{recursive:true})

const jar=new Map()
const auth=createBrowserClient(supabaseUrl,supabaseKey,{
  cookies:{
    getAll:()=>[...jar.values()].map(x=>({name:x.name,value:x.value})),
    setAll:(items)=>items.forEach(x=>jar.set(x.name,x)),
  },
})
const {error}=await auth.auth.setSession({
  access_token:session.access_token,refresh_token:session.refresh_token,
})
if(error)throw error
const browser=await chromium.launch({
  headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})
})
const results=[]
const check=(name,pass,meta={})=>{
  const result={name,pass:Boolean(pass),...meta}
  results.push(result)
  console.log((result.pass?'PASS ':'FAIL ')+name+' '+JSON.stringify(meta))
}
const widths=[
  {width:320,height:568},{width:360,height:800},
  {width:390,height:844},{width:430,height:932},
  {width:844,height:390},{width:600,height:960},
  {width:768,height:1024},{width:1024,height:768},
  {width:1180,height:820},{width:1280,height:720},
  {width:1440,height:900},{width:1920,height:1080},
]
const paths=[
  ['/purchase/accounts','.account-table-card','Tài khoản'],
  ['/purchase/orders?range=all','.order-table-card','Đơn nhập'],
  ['/warehouse/inventory','.whx-table-scroll','Tồn kho'],
  ['/warehouse/history','.whx-table-scroll','Lịch sử kho'],
  ['/sales/history','.sales-history-table-wrap','Lịch sử POS'],
  ['/sales/customers','.customer-demo-table-wrap','Khách hàng'],
  ['/sales/debt','.debt-demo-table-wrap','Công nợ'],
  ['/finance/cashflow','.finance-table-card','Thu Chi'],
  ['/finance/reports','.finance-report-day-table-wrap','Báo cáo'],
  ['/finance/shipper-payments?mode=customer','.compact-table-wrap','Đối soát'],
]
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}})
  await context.addCookies([...jar.values()].map(c=>({
    name:c.name,value:c.value,url:base,
    httpOnly:Boolean(c.options?.httpOnly),
    secure:c.options?.secure!==false,
    sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax'
  })))
  const page=await context.newPage()
  let consecutiveNavigationFailures=0
  const nav=async(path)=>{
    const probes=[]
    for(let attempt=0;attempt<4;attempt++){
      const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:35000}).catch(error=>{
        probes.push({attempt:attempt+1,error:String(error?.message??error).slice(0,180)})
        return null
      })
      const status=response?.status()??0
      const finalUrl=page.url()
      if(status>=200&&status<400&&!new URL(finalUrl).pathname.startsWith('/login')){
        consecutiveNavigationFailures=0
        await sleep(200)
        return true
      }
      const body=(await page.locator('body').innerText().catch(()=>'' )).slice(0,160)
      probes.push({attempt:attempt+1,status,url:new URL(finalUrl).pathname,
        ray:response?.headers()['cf-ray']??null,body})
      // Cloudflare 1102 is a Worker resource ceiling, not a transient page failure.
      // Stop immediately rather than spending the user's Worker quota on retries.
      if(status===503&&/1102|exceeded resource limits/i.test(body))
        throw new Error('Cloudflare Worker 1102 on Named Preview; abort browser QA without retries. route='+path)
      // Do not hammer rate-limited or temporarily unavailable environments.
      if(attempt<3)await sleep(status===429||status===503||status===1027
        ?[1800,3500,7000][attempt]:[800,1500,2500][attempt])
    }
    consecutiveNavigationFailures++
    console.warn('PREVIEW_QA_NAVIGATION_FAILED '+JSON.stringify({
      path,consecutiveNavigationFailures,probes
    }))
    if(consecutiveNavigationFailures>=2)throw new Error(
      'Preview navigation unavailable twice in a row; stop QA to protect infrastructure. route='+path
    )
    return false
  }
  const inspect=async(wrapSelector)=>page.evaluate(selector=>{
    const wrap=document.querySelector(selector)
    const table=wrap?.querySelector('table.table')
    const head=table?.querySelector('thead th')
    const body=table?.querySelector('tbody td')
    if(!wrap||!table||!head||!body)return null
    const wrapRect=wrap.getBoundingClientRect()
    const tableRect=table.getBoundingClientRect()
    const hStyle=getComputedStyle(head),bStyle=getComputedStyle(body)
    const before=wrap.scrollLeft
    if(wrap.scrollWidth>wrap.clientWidth+8)wrap.scrollLeft=wrap.scrollWidth-wrap.clientWidth
    const horizontalScrollWorks=wrap.scrollWidth<=wrap.clientWidth+8
      ||wrap.scrollLeft>before+2
    const m={
      viewport:innerWidth,
      docScrollWidth:document.documentElement.scrollWidth,
      wrapLeft:Math.round(wrapRect.left),
      wrapRight:Math.round(wrapRect.right),
      wrapWidth:Math.round(wrapRect.width),
      tableWidth:Math.round(tableRect.width),
      scrollWidth:wrap.scrollWidth,
      clientWidth:wrap.clientWidth,
      horizontalScrollWorks,
      headerFont:parseFloat(hStyle.fontSize),
      cellFont:parseFloat(bStyle.fontSize),
      headerHeight:Math.round(head.getBoundingClientRect().height),
      cellHeight:Math.round(body.getBoundingClientRect().height),
      headerSticky:hStyle.position==='sticky',
      rows:table.querySelectorAll('tbody tr').length,
    }
    wrap.scrollLeft=before
    return m
  },wrapSelector)
  const verify=(label,view,m)=>{
    const mobileLaneUsable=view.width>900||Boolean(m
      &&m.wrapLeft<=100&&m.wrapWidth>=Math.max(170,view.width-135))
    const fits=Boolean(m)
      &&mobileLaneUsable
      &&m.docScrollWidth<=view.width+4
      &&m.wrapLeft>=-3&&m.wrapRight<=view.width+4
      &&m.headerFont>=9.2
      &&m.cellFont>=10.7
      &&m.headerSticky
      &&m.rows>0
      &&m.horizontalScrollWorks
      &&(m.tableWidth<=m.wrapWidth+8||m.scrollWidth>m.clientWidth+8)
    check(view.width+'x'+view.height+' '+label,fits,m??{reason:'table or wrapper not found'})
  }
  // Only one HTTP navigation for the whole responsive Tracking matrix.
  // Resizing the existing authenticated page tests CSS without repeating costly RSC/DB loads.
  if(!await nav('/purchase/tracking?range=all'))throw new Error('Tracking Preview unavailable')
  for(const view of widths){
    await page.setViewportSize(view)
    await page.waitForTimeout(90)
    const wrap='.tracking-hub-table-wrap-v2'
    const m=await inspect(wrap)
    verify('Tracking table',view,m)
    const orderLink=page.locator('.tracking-hub-table a.table-link').filter({hasText:session.fixtures.hub_order_code}).first()
    check(view.width+' QA order in Tracking',await orderLink.count()>0)
    if([320,390,768,1024,1440].includes(view.width)){
      await page.screenshot({path:output+'/table-'+view.width+'-closed.png',fullPage:false})
    }
    if([320,768,1440].includes(view.width)&&await page.locator('.tracking-product-cell').count()){
      const long=await page.locator('.tracking-product-cell').first().evaluate(el=>{
        const old=el.textContent
        el.textContent='Sản phẩm dài / SKU-2026 / phiên bản nhiều thuộc tính '.repeat(12)
        const r=el.getBoundingClientRect(),table=el.closest('table'),wrap=el.closest('.tracking-hub-table-wrap-v2')
        const tr=table?.getBoundingClientRect(),wr=wrap?.getBoundingClientRect()
        const s=getComputedStyle(el)
        const result={cellWidth:r.width,tableWidth:tr?.width,wrapWidth:wr?.width,
          scrollWidth:wrap?.scrollWidth,viewport:innerWidth,
          docScrollWidth:document.documentElement.scrollWidth,
          overflow:s.overflow,textOverflow:s.textOverflow}
        el.textContent=old
        return result
      })
      check(view.width+' Tracking long product contained',Boolean(long&&long.docScrollWidth<=view.width+4
        &&long.cellWidth>0&&long.cellWidth<=Math.max(long.tableWidth??0,long.wrapWidth??0)+3
        &&(long.tableWidth<=long.wrapWidth+8||long.scrollWidth>long.wrapWidth+8)),long??{})
    }
    if([320,390,768,1024,1440].includes(view.width)
      &&await orderLink.count()){
      await orderLink.click()
      const panel=page.locator('aside.context-order-panel')
      const visible=await panel.waitFor({state:'visible',timeout:12000}).then(()=>true).catch(()=>false)
      const measure=visible?await panel.evaluate(el=>{
        const r=el.getBoundingClientRect()
        return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,
          width:r.width,viewport:innerWidth,height:innerHeight}
      }):null
      check(view.width+' right slidebar visible in viewport',
        Boolean(measure&&measure.left>=-3&&measure.right<=view.width+4
          &&measure.width>Math.min(240,view.width*.6)),measure??{visible})
      if(visible){
        if([320,390,768,1024,1440].includes(view.width)){
          await page.screenshot({path:output+'/table-'+view.width+'-panel.png',fullPage:false})
        }
        const close=page.locator('aside.context-order-panel a[aria-label="Đóng toàn bộ"]').first()
        if(await close.count()){
          await close.click()
          const closed=await panel.waitFor({state:'detached',timeout:12000}).then(()=>true).catch(()=>false)
          check(view.width+' close right slidebar',closed)
        }else check(view.width+' close right slidebar',false,{reason:'close control absent'})
      }
    }
  }
  // Visit each operational module only once, then resize in-place. This
  // avoids multiplying Cloudflare/Supabase requests by the number of viewports.
  for(const [path,selector,label] of paths){
    const ready=await nav(path)
    if(!ready){check('Module route '+label,false,{path,url:page.url()});continue}
    for(const view of [
      {width:390,height:844},{width:768,height:1024},{width:1440,height:900}
    ]){
      if(view.width===768&&!['Đơn nhập','Tồn kho','Lịch sử POS','Thu Chi'].includes(label))continue
      await page.setViewportSize(view)
      await page.waitForTimeout(70)
      verify(label,view,await inspect(selector))
      if(view.width===390&&['Đơn nhập','Tồn kho','Công nợ'].includes(label)){
        await page.screenshot({path:output+'/table-'+view.width+'-'+label.replaceAll(' ','_')+'.png',fullPage:false})
      }
    }
  }
  // Regressions reported from Desktop screenshots: Finance concealed columns and
  // Warehouse compressed both tables of each receiving location into a strip.
  await page.setViewportSize({width:1440,height:900})
  if(await nav('/finance/cashflow')){
    const first=page.locator('table.finance-table tbody tr').first()
    if(await first.count()){
      await first.click()
      await sleep(250)
      const fm=await page.evaluate(()=>{
        const workspace=document.querySelector('.finance-ledger-layout.with-panel,.finance-live-workspace.has-slidebar,.finance-preview-workspace.has-slidebar')
        const table=workspace?.querySelector('table.finance-table')
        const wrap=workspace?.querySelector('.finance-table-card')
        if(!workspace||!table||!wrap)return null
        const cells=[...table.querySelectorAll('thead th')]
        const style=getComputedStyle(wrap)
        const initial=wrap.scrollLeft
        wrap.scrollLeft=wrap.scrollWidth
        const moved=wrap.scrollLeft
        wrap.scrollLeft=initial
        return {
          totalHeaders:cells.length,
          hiddenHeaders:cells.filter(el=>getComputedStyle(el).display==='none').length,
          wrapClient:wrap.clientWidth,wrapScroll:wrap.scrollWidth,
          overflowX:style.overflowX,
          horizontalScrollWorks:wrap.scrollWidth<=wrap.clientWidth+4||moved>0,
          docScrollWidth:document.documentElement.scrollWidth,
          viewport:innerWidth,
        }
      })
      check('1440 Finance panel retains all columns and internal scroll',
        Boolean(fm&&fm.totalHeaders>=7&&fm.hiddenHeaders===0
          &&fm.overflowX!=='hidden'&&fm.horizontalScrollWorks
          &&fm.docScrollWidth<=1444),fm??{reason:'finance panel not found'})
    }else check('1440 Finance detail row exists',false)
  }else check('1440 Finance route available',false)
  if(await nav('/warehouse/receive')){
    const wm=await page.evaluate(()=>{
      const card=document.querySelector('.warehouse-receive-card.open')
      const split=card?.querySelector('.warehouse-split-table')?.parentElement
      const ready=card?.querySelector('.warehouse-ready-table')?.parentElement
      const heading=card?.querySelector('.warehouse-intake-section-head.ready')
      const list=document.querySelector('.whx-intake-main')
      if(!card||!split||!ready||!heading||!list)return null
      const sp=split.getBoundingClientRect(),rp=ready.getBoundingClientRect(),h=heading.getBoundingClientRect()
      const style=getComputedStyle(split)
      const before=list.scrollTop
      list.scrollTop=list.scrollHeight
      const scrolled=list.scrollTop
      list.scrollTop=before
      return{splitHeight:sp.height,readyHeight:rp.height,
        splitBottom:sp.bottom,readyHeadingTop:h.top,readyTop:rp.top,
        wrapOverflow:style.overflowY,groupScrollHeight:list.scrollHeight,
        groupClientHeight:list.clientHeight,groupScrollWorks:
          list.scrollHeight<=list.clientHeight+4||scrolled>0,
        docScrollWidth:document.documentElement.scrollWidth}
    })
    check('1440 Warehouse receiving sections remain separated',
      Boolean(wm&&wm.splitHeight>=70&&wm.readyHeight>=70
        &&wm.readyHeadingTop>=wm.splitBottom-3
        &&wm.wrapOverflow!=='visible'&&wm.groupScrollWorks
        &&wm.docScrollWidth<=1444),wm??{reason:'warehouse receiving groups missing'})
  }else check('1440 Warehouse receive route available',false)

  // PR #59 screenshot set: verify detail panels do not make their data tables
  // inaccessible. All navigation and measurements are read-only.
  const splitCases=[
    {path:'/purchase/accounts',label:'User',link:'.user-table tbody a.table-link',
      wrap:'.account-table-card',table:'.user-table',panel:'.account-workspace .system-slidebar-v1'},
    {path:'/purchase/orders?range=all',label:'Đơn nhập',link:'.order-table tbody a.table-link',
      wrap:'.order-table-card',table:'.order-table',panel:'.order-workspace .system-slidebar-v1'},
    {path:'/warehouse/inventory',label:'Tồn kho',link:'.whx-table tbody tr',
      wrap:'.whx-table-scroll',table:'.whx-table',panel:'.whx-stock-layout.with-panel .whx-detail-panel-v2'},
    {path:'/sales/history',label:'Lịch sử POS',link:'.sales-history-table tbody a.table-link',
      wrap:'.sales-history-table-wrap',table:'.sales-history-table',panel:'.sales-history-workspace .system-slidebar-v1'},
    {path:'/sales/customers',label:'Khách hàng',link:'.customer-demo-table tbody a.table-link',
      wrap:'.customer-demo-table-wrap',table:'.customer-demo-table',panel:'.customer-demo-workspace .system-slidebar-v1'},
    {path:'/sales/debt',label:'Công nợ',link:'.debt-demo-table tbody a.table-link',
      wrap:'.debt-demo-table-wrap',table:'.debt-demo-table',panel:'.debt-demo-workspace .system-slidebar-v1'},
  ]
  for(const spec of splitCases){
    const ready=await nav(spec.path)
    if(!ready){check('1440 '+spec.label+' panel route',false,{url:page.url()});continue}
    const opener=page.locator(spec.link).first()
    if(!await opener.count()){
      check('1440 '+spec.label+' has a selectable row',false)
      continue
    }
    await opener.click()
    const shown=await page.locator(spec.panel).first().waitFor({state:'visible',timeout:15000})
      .then(()=>true).catch(()=>false)
    const m=await page.evaluate(spec=>{
      const wrap=document.querySelector(spec.wrap)
      const table=document.querySelector(spec.table)
      const panel=document.querySelector(spec.panel)
      if(!wrap||!table||!panel)return null
      const panelRect=panel.getBoundingClientRect()
      const before=wrap.scrollLeft
      wrap.scrollLeft=wrap.scrollWidth
      const after=wrap.scrollLeft
      wrap.scrollLeft=before
      const action=table.querySelector('tbody td.row-actions-cell')
        ||(spec.label==='Công nợ'?table.querySelector('tbody tr td:last-child'):null)
      const style=getComputedStyle(wrap)
      return{
        viewport:innerWidth,
        docScroll:document.documentElement.scrollWidth,
        tableWidth:Math.round(table.getBoundingClientRect().width),
        wrapWidth:Math.round(wrap.getBoundingClientRect().width),
        scrollWidth:wrap.scrollWidth,clientWidth:wrap.clientWidth,
        overflowX:style.overflowX,
        horizontalScrollWorks:wrap.scrollWidth<=wrap.clientWidth+4||after>0,
        panelLeft:panelRect.left,panelRight:panelRect.right,
        panelWidth:Math.round(panelRect.width),panelTop:panelRect.top,
        actionSticky:action?getComputedStyle(action).position==='sticky':null,
      }
    },spec)
    check('1440 '+spec.label+' panel retains accessible table',
      Boolean(shown&&m&&m.docScroll<=1444
        &&m.wrapWidth>150
        &&m.panelWidth>=350&&m.panelRight<=1444&&m.panelLeft>=-2
        &&m.overflowX!=='hidden'&&m.horizontalScrollWorks
        &&(m.tableWidth<=m.wrapWidth+8||m.scrollWidth>m.clientWidth+4)
        &&(!['User','Đơn nhập','Công nợ'].includes(spec.label)||m.actionSticky)),
      m??{visible:shown})
  }
  // Regression checks for screenshot-reported operational screens.
  // All checks inspect DOM/layout only; no form submissions or DB updates.
  await page.setViewportSize({width:1440,height:900})
  if(await nav('/warehouse/receive')){
    const group=page.locator('.warehouse-receive-card.open').first()
    const measure=await group.evaluate(el=>{
      const first=el.querySelector('.tracking-hub-table-wrap-v2')
      const next=el.querySelector('.warehouse-intake-section-head.ready')
      const wraps=[...el.querySelectorAll('.tracking-hub-table-wrap-v2')]
      if(!first||!next||wraps.length<2)return null
      const a=first.getBoundingClientRect(),b=next.getBoundingClientRect()
      return{firstTableBottom:a.bottom,nextTitleTop:b.top,
        overlapping:a.bottom>b.top+2,
        wraps:wraps.map(w=>({
          clientHeight:w.clientHeight,scrollHeight:w.scrollHeight,
          clientWidth:w.clientWidth,scrollWidth:w.scrollWidth,
          overflowY:getComputedStyle(w).overflowY
        }))}
    }).catch(()=>null)
    check('Warehouse receive two queues do not overlap',
      Boolean(measure&&!measure.overlapping&&measure.wraps.every(w=>w.clientHeight>0&&w.overflowY!=='visible')),
      measure??{reason:'queues absent'})
    const row=page.locator('.warehouse-split-table tbody tr')
      .filter({hasText:session.fixtures.warehouse_order_code}).first()
    if(await row.count()){
      await row.click()
      const panel=page.locator('aside.warehouse-intake-panel')
      const rect=await panel.evaluate(el=>{
        const r=el.getBoundingClientRect()
        return{left:r.left,right:r.right,width:r.width,viewport:innerWidth}
      }).catch(()=>null)
      check('Warehouse receive slidebar fits viewport',
        Boolean(rect&&rect.width>=350&&rect.left>=-3&&rect.right<=1444),rect??{})
      const next=await group.evaluate(el=>{
        const a=el.querySelector('.tracking-hub-table-wrap-v2')?.getBoundingClientRect()
        const b=el.querySelector('.warehouse-intake-section-head.ready')?.getBoundingClientRect()
        return a&&b?{bottom:a.bottom,top:b.top}:null
      }).catch(()=>null)
      check('Warehouse receive queues do not overlap beside slidebar',
        Boolean(next&&next.bottom<=next.top+2),next??{})
      await page.screenshot({path:output+'/warehouse-1440-panel.png',fullPage:false})
    }
  }else check('Warehouse receive route accessible',false)

  if(await nav('/finance/cashflow')){
    const ledger=page.locator('table.finance-table').first()
    const test=await ledger.evaluate(el=>{
      const scroll=el.closest('.finance-table-card')
      const last=el.querySelector('tbody tr td:last-child')
      const r=last?.getBoundingClientRect(),w=scroll?.getBoundingClientRect()
      return{columnWidth:r?.width,scrollRight:w?.right,lastRight:r?.right,
        sticky:last?getComputedStyle(last).position:null,
        scrollable:scroll?scroll.scrollWidth>scroll.clientWidth:false}
    }).catch(()=>null)
    check('Finance last status remains visible',Boolean(test&&test.columnWidth>=108
      &&test.sticky==='sticky'&&test.lastRight<=test.scrollRight+4),test??{})
    const first=page.locator('table.finance-table tbody tr').first()
    if(await first.count()){
      await first.click()
      const pane=page.locator('.finance-table-card').first()
      const m=await pane.evaluate(el=>{
        const r=el.getBoundingClientRect()
        return{width:r.width,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,
          overflow:getComputedStyle(el).overflowX}
      }).catch(()=>null)
      check('Finance keeps horizontal scroll with right panel',
        Boolean(m&&m.width>=300&&m.overflow!=='hidden'&&m.scrollWidth>=m.clientWidth),m??{})
      await page.screenshot({path:output+'/cashflow-1440-panel.png',fullPage:false})
    }
  }else check('Finance cashflow route accessible',false)

  if(await nav('/settings?section=tracking')){
    const tab=page.getByRole('button',{name:/Mapping SPX/}).first()
    if(await tab.count())await tab.click()
    const head=page.locator('.tracking-mapping-head-v7')
    const font=await head.evaluate(el=>({
      font:parseFloat(getComputedStyle(el).fontSize),
      rows:el.closest('.tracking-mapping-panel-v7')?.querySelectorAll('.tracking-mapping-row-v7').length??0
    })).catch(()=>null)
    check('Tracking mapping grid legible',
      Boolean(font&&font.font>=9.5&&font.rows>0),font??{})
    const unknown=await page.locator('.tracking-unknown-panel-v7').first().evaluate(el=>({
      height:Math.round(el.getBoundingClientRect().height),
      scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,
      overflow:getComputedStyle(el).overflowY
    })).catch(()=>null)
    if(unknown)check('Tracking unmapped SPX status queue not clipped',
      unknown.height>=99&&(unknown.scrollHeight<=unknown.clientHeight+3||unknown.overflow==='auto'),
      unknown)
  }else check('Tracking settings route accessible',false)

  if(await nav('/finance/shipper-payments')){
    const frame=await page.evaluate(()=>({
      docWidth:document.documentElement.scrollWidth,view:innerWidth,
      viewHubButtons:[...document.querySelectorAll('button,a')].filter(el=>el.textContent?.includes('Xem HUB')).length
    }))
    check('Shipper settlement list fits viewport',
      frame.docWidth<=frame.view+4&&frame.viewHubButtons>0,frame)
    const metric=await page.locator('.shipper-payment-batch-metrics').first().evaluate(el=>{
      const n=el.querySelector('b'),label=el.querySelector('span')
      return{numberFont:n?parseFloat(getComputedStyle(n).fontSize):0,
        labelFont:label?parseFloat(getComputedStyle(label).fontSize):0}
    }).catch(()=>null)
    if(metric)check('Shipper settlement amounts legible',
      metric.numberFont>=10.5&&metric.labelFont>=9.5,metric)
  }else check('Shipper settlement route accessible',false)
  await context.close()
}finally{
  await browser.close()
}
const failures=results.filter(x=>!x.pass)
const report={commit:process.env.GITHUB_SHA??'unknown',
  preview:base,checks:results.length,failed:failures.length,
  passed:results.length-failures.length,results}
fs.writeFileSync(output+'/responsive-summary.json',JSON.stringify(report,null,2))
console.log('RESPONSIVE_TABLE_QA '+JSON.stringify({
  checks:report.checks,passed:report.passed,failed:report.failed,
  failures:failures.slice(0,20).map(x=>x.name)
}))
assert.equal(failures.length,0,'Responsive table checks failed')
