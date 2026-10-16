import assert from 'node:assert/strict'
import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const url=process.env.PREVIEW_URL,supabaseUrl=process.env.SUPABASE_URL,key=process.env.SUPABASE_KEY
assert.ok(url&&supabaseUrl&&key,'Missing environment')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const jar=new Map()
const client=createBrowserClient(supabaseUrl,key,{cookies:{
  getAll(){return [...jar.values()].map(c=>({name:c.name,value:c.value}))},
  setAll(list){list.forEach(c=>jar.set(c.name,c))},
}})
const signed=await client.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
if(signed.error)throw signed.error
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const dir='qa-tracking-toast-table'
fs.mkdirSync(dir,{recursive:true})
const results=[]
const sizes=[[320,568],[390,844],[768,1024],[1280,800],[1440,900],[1920,1080]]
const assertMetric=(label,ok,meta)=>{results.push({label,pass:Boolean(ok),...meta});console.log((ok?'PASS ':'FAIL ')+label+' '+JSON.stringify(meta))}

async function inspect(page){
  return page.evaluate(()=>{
    const wrap=document.querySelector('.tracking-hub-card-v2.open .tracking-hub-table-wrap-v2')
    const table=wrap?.querySelector('table.tracking-hub-table-v2')
    if(!wrap||!table)return null
    const wr=wrap.getBoundingClientRect(),tr=table.getBoundingClientRect()
    const scrollable=wrap.scrollWidth>wrap.clientWidth+4
    const html=document.documentElement
    return {pane:Math.round(wr.width),table:Math.round(tr.width),
      fill:tr.width>=wr.width-4,scrollable,
      localOverflow:scrollable&&getComputedStyle(wrap).overflowX!=='hidden',
      pageOverflow:html.scrollWidth>html.clientWidth+5,
      actions:Math.round(table.querySelector('.tracking-action-head')?.getBoundingClientRect().width??0),
      custom:table.classList.contains('mynh-resizable-table'),
      visibleColumns:table.querySelectorAll('thead th').length,
    }
  })
}
try{
 for(const [width,height] of sizes){
  const ctx=await browser.newContext({viewport:{width,height}})
  await ctx.addCookies([...jar.values()].map(c=>({
    name:c.name,value:c.value,url,httpOnly:Boolean(c.options?.httpOnly),
    secure:c.options?.secure!==false,
    sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
  })))
  const page=await ctx.newPage()
  // Virtual clock avoids six real 30-second waits while testing the full lifetime.
  await page.clock.install()
  // Capture the exact effect activation, even on a slow server-rendered page.
  await page.addInitScript(()=>{
    const original=window.history.replaceState
    window.history.replaceState=function(...args){
      const before=new URL(location.href)
      const next=new URL(String(args[2]??location.href),location.href)
      if((before.searchParams.has('received')||before.searchParams.has('payment'))&&
        !next.searchParams.has('received')&&!next.searchParams.has('payment')){
        window.__qaToastEffectStartedAt=Date.now()
      }
      return original.apply(this,args)
    }
  })
  const errors=[]
  page.on('pageerror',e=>errors.push(String(e.message)))
  page.on('response',r=>{
    if(r.status()>=500)errors.push('HTTP '+r.status()+' '+new URL(r.url()).pathname)
  })
  try{
    const path='/purchase/tracking?range=all&received=1&payment=1'
    const response=await page.goto(url+path,{waitUntil:'domcontentloaded',timeout:40000})
    assert.ok(response?.ok(),'Tracking Preview navigation failed')
    const toast=page.locator('.tracking-success-toast')
    await toast.first().waitFor({state:'visible',timeout:15000})
    const details=await toast.first().evaluate(el=>{
      const r=el.getBoundingClientRect()
      return {left:Math.round(r.left),right:Math.round(r.right),
        title:el.querySelector('strong')?.textContent,close:!!el.querySelector('button')}
    })
    const toastOne=await toast.count()===1
    const rightSide=details.left>=0&&details.right<=width+5&&width-details.right<=40
    // SSR may render the toast before the page hydrates. The 30-second
    // timer starts only after TrackingSuccessToast's effect removes query flags.
    // Time from the real effect rather than from DOMContentLoaded or SSR paint.
    await page.waitForFunction(()=>{
      const q=new URLSearchParams(location.search)
      return !q.has('received')&&!q.has('payment')
    },null,{timeout:25000})
    const effectStartedAt=await page.evaluate(()=>window.__qaToastEffectStartedAt??0)
    assert.ok(effectStartedAt>0,'Toast effect activation not observed')
    // A visible notification must survive until the 30-second threshold.
    await page.clock.fastForward(29500)
    const beforeExpiry=await toast.first().isVisible()
    await page.clock.fastForward(600)
    await toast.first().waitFor({state:'hidden',timeout:5000})
    const timerElapsed=await page.evaluate(start=>Date.now()-start,effectStartedAt)
    assertMetric(width+'x'+height+' toast',Boolean(toastOne&&rightSide&&details.close&&
      details.title?.includes('nhận hàng')&&beforeExpiry&&
      timerElapsed>=30000&&timerElapsed<=32000),
      {toastOne,...details,beforeExpiry,timerElapsed,errors:[...errors]})
    await page.locator('.tracking-content-workspace').waitFor({state:'visible',timeout:18000})
    let hub=page.locator('.tracking-hub-card-v2.open .tracking-hub-table-v2')
    if(await hub.count()===0)await page.locator('.tracking-hub-card-v2.collapsed .tracking-hub-toggle').first().click()
    await page.locator('.tracking-hub-card-v2.open .tracking-hub-table-v2').first()
      .waitFor({state:'visible',timeout:12000})
    await page.waitForTimeout(600)
    const full=await inspect(page)
    assertMetric(width+'x'+height+' table',Boolean(full&&full.fill&&!full.pageOverflow&&
      (full.pane>=900?full.actions<=49:true)&&errors.length===0),{...full,errors:[...errors]})
    if(width===1440){
      // Simulate persisted per-user drag widths, including legacy narrow values.
      await page.evaluate(()=>{
        const table=document.querySelector('.tracking-hub-card-v2.open .tracking-hub-table-v2')
        const names=[...table.classList].filter(c=>!['table','active','striped','mynh-resizable-table','account-table-stacked'].includes(c)).sort()
        const id='mynh-col-widths-v1:'+location.pathname+':'+names.join('.')
        localStorage.setItem(id,JSON.stringify({'Sản phẩm':120,'Người nhận / Địa chỉ':140,'Trạng thái':90}))
      })
      await page.reload({waitUntil:'domcontentloaded'})
      await page.locator('.tracking-hub-card-v2.open .tracking-hub-table-v2').first()
        .waitFor({state:'visible',timeout:14000})
      await page.waitForTimeout(700)
      const saved=await inspect(page)
      assertMetric('1440 saved-width fit',Boolean(saved?.custom&&saved?.fill&&!saved?.pageOverflow),saved??{})
      const link=page.locator('.tracking-hub-card-v2.open .tracking-hub-table a.table-link').first()
      if(await link.count()){
        await link.click()
        await page.locator('.tracking-content-workspace.with-panel').waitFor({state:'visible',timeout:20000})
        await page.waitForTimeout(700)
        const panel=await inspect(page)
        assertMetric('1440 with order slidebar',Boolean(panel?.fill&&!panel?.pageOverflow&&(panel.table<=panel.pane+4||panel.localOverflow)),panel??{})
        await page.goBack({waitUntil:'domcontentloaded'}).catch(()=>null)
        await page.waitForTimeout(500)
        const back=await inspect(page)
        assertMetric('1440 after slidebar back',Boolean(back?.fill&&!back?.pageOverflow),back??{})
      }else{
        assertMetric('1440 with order slidebar',false,{error:'No existing order link in read-only Preview'})
      }
    }
    await page.screenshot({path:dir+'/tracking-'+width+'x'+height+'.png',fullPage:false})
  }catch(e){
    assertMetric(width+'x'+height+' runtime',false,{error:String(e).slice(0,450),errors})
  }finally{await ctx.close()}
 }
}finally{await browser.close()}
fs.writeFileSync(dir+'/results.json',JSON.stringify(results,null,2))
assert.ok(results.length>=sizes.length*2)
assert.ok(results.every(r=>r.pass),'Tracking table/toast browser QA has failures')
console.log('TRACKING_TOAST_TABLE_BROWSER_QA_SUMMARY '+JSON.stringify({passed:results.length,failed:0}))
