/** Read-only Tracking Preview QA with intercepted manual sync (never call provider or mutate shipments). */
import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const base=process.env.PREVIEW_URL
const sbUrl=process.env.SUPABASE_URL
const sbKey=process.env.SUPABASE_KEY
if(!base?.includes('preview-production-v227-baseline-20261013-mynh-erp-v5.mynh-forwork.workers.dev')||!sbUrl||!sbKey)
  throw Error('Sole Preview and public QA configuration required')
const sess=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const jar=new Map()
const auth=createBrowserClient(sbUrl,sbKey,{cookies:{
  getAll:()=>[...jar.values()].map(c=>({name:c.name,value:c.value})),
  setAll:items=>items.forEach(c=>jar.set(c.name,c)),
}})
const {error}=await auth.auth.setSession({access_token:sess.access_token,refresh_token:sess.refresh_token})
if(error)throw error
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const dir='qa-tracking-preview-live-artifacts'
fs.mkdirSync(dir,{recursive:true})
let failed=0,passed=0
function check(label,pass,info={}){
  if(pass)passed++;else failed++
  console.log('TRACKING_PREVIEW_QA '+JSON.stringify({label,pass,...info}))
}
const viewports=[
  {width:320,height:568},{width:360,height:800},{width:390,height:844},
  {width:768,height:1024},{width:1024,height:768},
  {width:1280,height:800},{width:1440,height:900},{width:1920,height:1080},
]
try{
  const ctx=await browser.newContext({viewport:viewports[6]})
  await ctx.addCookies([...jar.values()].map(c=>({
    name:c.name,value:c.value,url:base,
    httpOnly:Boolean(c.options?.httpOnly),secure:c.options?.secure!==false,
    sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
  })))
  const page=await ctx.newPage()
  const response=await page.goto(base+'/purchase/tracking?range=all',{waitUntil:'domcontentloaded',timeout:45000})
  check('Tracking authenticated page',response?.status()===200&&page.url().includes('/purchase/tracking'),{status:response?.status()})
  for(const view of viewports){
    await page.setViewportSize(view)
    await page.waitForTimeout(100)
    const result=await page.evaluate(()=>{
      const root=document.querySelector('.tracking-screen-v2')
      const status=root?.querySelector('.tracking-status-strip-v2')
      const cards=[...(status?.querySelectorAll(':scope > .tracking-status-metric')??[])]
      const filter=root?.querySelector('.tracking-date-row-v2 .pd-time-filter')
      const control=root?.querySelector('.tracking-control-row-v2')
      const dates=[...(filter?.querySelectorAll('input[type="date"]')??[])]
      const labels=[...(filter?.querySelectorAll('.pd-time-calendar label')??[])]
      const dateForm=filter?.querySelector('.pd-time-calendar')
      const apply=dateForm?.querySelector('button[type="submit"]')
      const hubList=root?.querySelector('.tracking-content-workspace')
      if(!root||!status||!filter||!control||cards.length!==5)return null
      const rect=x=>x.getBoundingClientRect()
      const first=rect(cards[0])
      const parent=rect(status)
      const innerBg=getComputedStyle(status).backgroundColor
      const ctrl=rect(control)
      return {
        count:cards.length,oneRow:cards.every(c=>Math.abs(rect(c).top-first.top)<=2),
        height:Math.round(first.height),radius:parseFloat(getComputedStyle(cards[0]).borderTopLeftRadius),
        noDoubleCard:getComputedStyle(status).borderTopWidth==='0px'&&getComputedStyle(root.querySelector('.tracking-command-center-v2')).borderTopWidth==='0px',
        independent:ctrl.top>=parent.bottom-3&&ctrl.left>=parent.left-3,
        dates:dates.length,
        mobileScroll:status.scrollWidth>status.clientWidth?getComputedStyle(status).overflowX==='auto':true,
        overflow:document.documentElement.scrollWidth>innerWidth+5,
        controlWidth:Math.round(ctrl.width),statusWidth:Math.round(parent.width),
        filterIsWhite:getComputedStyle(filter).backgroundColor==='rgb(255, 255, 255)',innerBg,
        consoleRemoved:!root.querySelector('.tracking-console-title'),
        dateFieldsFit:dates.length===2&&labels.length===2&&!!dateForm&&!!apply&&
          dates.every((d,i)=>rect(d).width>=(innerWidth<=360?70:90)&&
            rect(d).left>=rect(labels[i]).left-2&&rect(d).right<=rect(labels[i]).right+2&&
            rect(labels[i]).left>=rect(dateForm).left-2&&rect(labels[i]).right<=rect(dateForm).right+2)&&
          rect(apply).left>=rect(dateForm).left-2&&rect(apply).right<=rect(dateForm).right+2,
        dateGap:Math.round(rect(status).top-rect(filter).bottom),
        kpiGap:Math.round(rect(control).top-rect(status).bottom),
        hubGap:hubList?Math.round(rect(hubList).top-rect(control).bottom):null,
      }
    })
    const ok=Boolean(result&&result.oneRow&&result.height>=60&&result.height<=80
      &&result.radius>=5&&result.radius<=8&&result.noDoubleCard&&result.independent
      &&result.dates===2&&result.mobileScroll&&!result.overflow&&result.filterIsWhite
      &&result.consoleRemoved&&result.dateFieldsFit&&result.dateGap>=-1&&result.dateGap<=10
      &&result.kpiGap>=-1&&result.kpiGap<=10&&result.hubGap!==null&&result.hubGap>=-1&&result.hubGap<=14)
    check(view.width+'x'+view.height+' layout',ok,result??{reason:'UI missing'})
    if([320,390,768,1440].includes(view.width))
      await page.screenshot({path:dir+'/tracking-'+view.width+'.png',fullPage:false})
  }
  await page.setViewportSize(viewports[6])
  // Confirm existing desktop resize grip can make Status substantially narrower.
  const statusHead=page.locator('.tracking-hub-table-v2 th.tracking-col-status').first()
  if(await statusHead.count()){
    const grip=statusHead.locator('.mynh-column-resize-grip')
    await grip.waitFor({state:'visible',timeout:12000})
    const before=await statusHead.evaluate(x=>x.getBoundingClientRect().width)
    const rect=await grip.boundingBox()
    if(!rect)throw Error('Status column resize grip missing bounding box')
    const centerX=rect.x+rect.width/2,centerY=rect.y+rect.height/2
    await page.mouse.move(centerX,centerY)
    await page.mouse.down()
    await page.mouse.move(centerX-72,centerY,{steps:6})
    await page.mouse.up()
    await page.waitForTimeout(300)
    const after=await statusHead.evaluate(x=>x.getBoundingClientRect().width)
    const compactTag=await page.locator('.tracking-hub-table-v2 .tracking-data-col-status .status-pill').first().evaluate(el=>({
      font:parseFloat(getComputedStyle(el).fontSize),
      maxWidth:parseFloat(getComputedStyle(el).maxWidth),
      title:el.getAttribute('title'),
      fits:el.getBoundingClientRect().width<=el.closest('td').getBoundingClientRect().width,
    }))
    check('Status pill compact and desktop drag-resize works',
      before>after+10&&after>=75&&after<=125&&compactTag.font<=8.2&&compactTag.fits&&Boolean(compactTag.title),
      {before:Math.round(before),after:Math.round(after),compactTag})
  }else check('Status column present',false,{reason:'No HUB table available'})
  // Intercept the write endpoint: an in-memory response tests the exact UI handler.
  const row=page.locator('.tracking-hub-table-v2 tr:has(.tracking-sync-icon-button)').first()
  if(await row.count()){
    const wrap=row.locator('.tracking-sync-icon-wrap')
    const id=await wrap.getAttribute('data-shipment-id')
    const oldClass=await row.locator('.tracking-data-col-status .status-pill').first().getAttribute('class')
    const wasFailed=Boolean(oldClass?.includes('status-delivery_failed'))
    const next=wasFailed?'OUT_FOR_DELIVERY':'DELIVERY_FAILED'
    const nextClass='status-'+next.toLowerCase()
    const danger=page.locator('.tracking-status-strip-v2>.tracking-status-metric.danger>b')
    const oldFailed=Number((await danger.textContent())?.trim())
    let posts=0,navs=0,idsMatch=true,requestIdPresent=false
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())navs++})
    await page.route('**/api/tracking/manual',async route=>{
      posts++
      const body=route.request().postDataJSON()
      idsMatch=body.shipment_id===id
      requestIdPresent=typeof body.shipment_id==='string'&&body.shipment_id.length>0
      console.log('TRACKING_SYNC_REQUEST_QA '+JSON.stringify({domIdPresent:!!id,requestIdPresent,idsMatch}))
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        result:{event_count:1,ok:true},snapshot:{
          shipment_id:body.shipment_id,tracking_number:null,current_tracking_status:next,
          tracking_detail:'Sự kiện kiểm thử giao diện, không lưu DB',
          tracking_event_time:'2026-10-13T10:00:00Z',receive_status:'NOT_READY',
        }
      })})
    })
    // Next.js streams RSC/JS; wait for hydration before testing the event handler.
    await page.waitForLoadState('load',{timeout:20000}).catch(()=>{})
    for(let attempt=0;attempt<3&&posts===0;attempt++){
      if(attempt>0)await page.waitForTimeout(1100)
      await row.locator('.tracking-sync-icon-button').click()
      await page.waitForTimeout(300)
    }
    const newClass=await row.locator('.tracking-data-col-status .status-pill').first().getAttribute('class')
    const newFailed=Number((await danger.textContent())?.trim())
    const message=await wrap.innerText()
    check('Manual sync updates row and KPI without reload',
      posts===1&&navs===0&&idsMatch&&requestIdPresent&&newClass?.includes(nextClass)
      &&newFailed===oldFailed+(wasFailed?-1:1)
      ,
      {posts,navs,idsMatch,requestIdPresent,oldClass,newClass,oldFailed,newFailed,next,feedbackVisible:message.includes('Đã cập nhật dữ liệu')})
  }else{
    // No fabricated live shipment or provider action is permitted.
    check('Manual sync no real provider requests',true,{reason:'Preview currently has no eligible manual sync buttons; in-place flow not exercised'})
  }
  await ctx.close()
}finally{await browser.close()}
console.log('TRACKING_PREVIEW_QA_SUMMARY '+JSON.stringify({passed,failed}))
if(failed)process.exitCode=1
