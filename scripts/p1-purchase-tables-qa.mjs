// MYNH ERP V5 — P1 Purchase Tables QA on isolated Named Preview.
// Read-only UI interaction: no archive/delete/payment action is submitted.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const base=process.env.PREVIEW_URL
const sbUrl=process.env.SUPABASE_URL
const sbKey=process.env.SUPABASE_KEY
assert.ok(base&&sbUrl&&sbKey,'Missing P1 QA environment')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
assert.ok(session.access_token&&session.refresh_token,'Missing temporary QA session')
const output='qa-p1-purchase-artifacts'
fs.mkdirSync(output,{recursive:true})
const jar=new Map()
const client=createBrowserClient(sbUrl,sbKey,{
  cookies:{
    getAll:()=>[...jar.values()].map(x=>({name:x.name,value:x.value})),
    setAll:items=>items.forEach(x=>jar.set(x.name,x)),
  }
})
const {error}=await client.auth.setSession({
  access_token:session.access_token,
  refresh_token:session.refresh_token,
})
if(error)throw error
const browser=await chromium.launch({
  headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})
})
const checks=[]
const check=(name,pass,details={})=>{
  checks.push({name,pass:Boolean(pass),...details})
  console.log((pass?'PASS ':'FAIL ')+name+' '+JSON.stringify(details))
}
const viewports=[
  {width:320,height:568},{width:390,height:844},{width:768,height:1024},
  {width:844,height:390},{width:1024,height:768},{width:1280,height:720},
  {width:1440,height:900},{width:1920,height:1080},
]
try {
  const context=await browser.newContext({viewport:{width:1440,height:900}})
  await context.addCookies([...jar.values()].map(c=>({
    name:c.name,value:c.value,url:base,
    secure:c.options?.secure!==false,httpOnly:Boolean(c.options?.httpOnly),
    sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
  })))
  const page=await context.newPage()
  const nav=async(route)=>{
    const resp=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:35000})
    const status=resp?.status()??0
    if(status>=500){
      const body=(await page.locator('body').innerText().catch(()=>'' )).slice(0,260)
      throw new Error('Preview unavailable; abort QA, no retry: '+JSON.stringify({route,status,body}))
    }
    if(status<200||status>=400||new URL(page.url()).pathname==='/login')
      throw new Error('P1 preview route inaccessible: '+JSON.stringify({route,status,url:page.url()}))
    await page.waitForLoadState('load',{timeout:35000})
    await page.waitForTimeout(250)
  }
  const selectors=[
    {name:'User',path:'/purchase/accounts?range=all',wrap:'.account-table-card',
      table:'table.user-table',panel:'.account-workspace.with-panel .system-slidebar-v1',
      open:'.user-table tbody a.table-link',storage:'mynh-v5-purchase-account-columns',
      order:'mynh-v5-purchase-account-column-order',required:'Username',schemaMin:890},
    {name:'Đơn nhập',path:'/purchase/orders?range=all',wrap:'.order-table-card',
      table:'table.order-table',panel:'.order-workspace.with-panel .system-slidebar-v1',
      open:'.order-table tbody a.table-link',storage:'mynh-v5-purchase-order-columns',
      order:'mynh-v5-purchase-order-column-order',required:'Mã đơn',schemaMin:890},
  ]
  const measure=async(spec)=>page.evaluate(s=>{
    const wrap=document.querySelector(s.wrap)
    const table=document.querySelector(s.table)
    const head=table?.querySelector('thead th')
    const cell=table?.querySelector('tbody td')
    if(!wrap||!table||!head||!cell)return null
    const wr=wrap.getBoundingClientRect(),tr=table.getBoundingClientRect()
    const panel=document.querySelector(s.panel)
    const pr=panel?.getBoundingClientRect()
    const last=table.querySelector('thead th.row-actions-head')?.getBoundingClientRect()
    const bodyLast=table.querySelector('tbody tr td.row-actions-cell')?.getBoundingClientRect()
    const initial=wrap.scrollLeft
    wrap.scrollLeft=wrap.scrollWidth
    const canScroll=wrap.scrollWidth<=wrap.clientWidth+4||wrap.scrollLeft>initial+1
    wrap.scrollLeft=initial
    return {
      viewport:innerWidth,docWidth:document.documentElement.scrollWidth,
      wrap:{left:wr.left,right:wr.right,width:wr.width},
      table:{width:tr.width},scrollWidth:wrap.scrollWidth,clientWidth:wrap.clientWidth,
      overflowX:getComputedStyle(wrap).overflowX,canScroll,
      headerFont:parseFloat(getComputedStyle(head).fontSize),
      bodyFont:parseFloat(getComputedStyle(cell).fontSize),
      headerSticky:getComputedStyle(head).position==='sticky',
      rows:table.querySelectorAll('tbody tr').length,
      lastAction:bodyLast?{width:bodyLast.width,right:bodyLast.right,sticky:getComputedStyle(table.querySelector('tbody tr td.row-actions-cell')).position==='sticky'}:null,
      actionHead:last?{width:last.width,right:last.right}:null,
      panel:pr?{left:pr.left,right:pr.right,width:pr.width}:null,
      columns:[...table.querySelectorAll('thead th')].map(el=>el.textContent.trim()),
    }
  },spec)
  const fits=(m,view)=>{
    return Boolean(m&&m.wrap.left>=-3&&m.wrap.right<=view.width+4
      &&m.wrap.width>=(view.width<=430?Math.min(175,view.width*.54):150)
      &&m.docWidth<=view.width+4
      &&m.overflowX!=='hidden'&&m.canScroll
      &&m.headerFont>=9.3&&m.bodyFont>=10.6&&m.headerSticky
      &&m.rows>=1
      &&(m.table.width<=m.wrap.width+6||m.scrollWidth>m.clientWidth+6))
  }

  for(const spec of selectors){
    await nav(spec.path)
    await page.locator(spec.table+' thead th').first().waitFor({state:'visible',timeout:15000})
    check(spec.name+' valid identifier column',
      (await page.locator(spec.table+' thead').innerText()).includes(spec.required))
    const menu=page.locator((spec.name==='User'?'.account-table-shell':'.order-table-shell')+' .managed-column-button').first()
    await menu.click()
    const menuPanel=page.locator((spec.name==='User'?'.account-table-shell':'.order-table-shell')+' .column-manager-menu')
    check(spec.name+' column manager opens',await menuPanel.isVisible())
    await page.keyboard.press('Escape')
    check(spec.name+' column manager Escape closes',!(await menuPanel.isVisible().catch(()=>false)))
    for(const view of viewports){
      await page.setViewportSize(view)
      await page.waitForTimeout(80)
      const m=await measure(spec)
      check(spec.name+' fit '+view.width+'x'+view.height,fits(m,view),m??{})
      if([390,1440].includes(view.width))
        await page.screenshot({path:output+'/'+(spec.name==='User'?'accounts':'orders')+'-'+view.width+'.png',fullPage:false})
    }
    await page.setViewportSize({width:1440,height:900})
    // Interaction with saved legacy preferences, without overwriting real users'
    // storage (this browser context belongs only to the temporary QA user).
    await page.evaluate(({storage,order,required})=>{
      const first=required==='Username'?'username':'order'
      const second=required==='Username'?'status':'cod'
      localStorage.setItem(storage,JSON.stringify([second,second,'invalid-column']))
      localStorage.setItem(order,JSON.stringify([second,second,'invalid-column',first]))
    },spec)
    await page.reload({waitUntil:'load',timeout:35000})
    await page.locator(spec.table+' thead th').first().waitFor({state:'visible',timeout:15000})
    const restored=await page.locator(spec.table+' thead th').allTextContents()
    check(spec.name+' restores required column and rejects corrupt duplicate preferences',
      restored.some(x=>x.includes(spec.required))
      &&restored.filter(x=>x.trim()===(spec.name==='User'?'Trạng thái':'COD')).length===1,
      {headers:restored})
    // Return to the full column layout for panel fit and resize.
    await page.evaluate(({storage,order})=>{
      localStorage.removeItem(storage);localStorage.removeItem(order)
    },spec)
    await page.reload({waitUntil:'load',timeout:35000})
    await page.setViewportSize({width:1440,height:900})
    const opener=page.locator(spec.open).first()
    check(spec.name+' has detail-link',await opener.count()>0)
    if(await opener.count()){
      await opener.click()
      await page.locator(spec.panel).waitFor({state:'visible',timeout:15000})
      await page.waitForTimeout(200)
      const m=await measure(spec)
      check(spec.name+' remains contained when right slidebar opens',
        fits(m,{width:1440})&&Boolean(m.panel&&m.panel.right<=1444
          &&m.lastAction&&m.lastAction.width>=26&&m.lastAction.width<=60
          &&m.actionHead&&m.actionHead.width>=26&&m.actionHead.width<=60),m??{})
      await page.screenshot({path:output+'/'+(spec.name==='User'?'accounts':'orders')+'-panel-1440.png',fullPage:false})
      await page.setViewportSize({width:390,height:844})
      await page.waitForTimeout(100)
      const mobile=await page.evaluate(s=>{
        const p=document.querySelector(s.panel),r=p?.getBoundingClientRect()
        return {panel:!!p,left:r?.left,right:r?.right,width:r?.width,
          viewport:innerWidth,bodyWidth:document.documentElement.scrollWidth}
      },spec)
      check(spec.name+' detail slidebar fits mobile',
        mobile.panel&&mobile.left>=-3&&mobile.right<=394&&mobile.bodyWidth<=394,mobile)
    }
  }

  await nav('/purchase/tracking?range=all')
  const tracking=await page.evaluate(()=>{
    const first=document.querySelector('.tracking-hub-head-v2')
    const r=first?.getBoundingClientRect()
    const cells=[...document.querySelectorAll('.tracking-hub-table-v2 thead th')].map(x=>x.textContent?.trim())
    return{exists:!!first,height:r?.height,detailIndex:cells.indexOf('Trạng thái chi tiết'),statusIndex:cells.indexOf('Trạng thái')}
  })
  check('Tracking HUB one-row and detail column retained',
    tracking.exists&&tracking.height<=53
    &&tracking.detailIndex===tracking.statusIndex+1,tracking)
  await page.screenshot({path:output+'/tracking-regression-390.png',fullPage:false})
  await context.close()
}finally{await browser.close()}
const failed=checks.filter(x=>!x.pass)
const result={commit:process.env.GITHUB_SHA??'unknown',checks:checks.length,passed:checks.length-failed.length,failed:failed.length,failures:failed}
fs.writeFileSync(output+'/summary.json',JSON.stringify(result,null,2))
console.log('P1_PURCHASE_TABLE_QA '+JSON.stringify(result))
if(failed.length)process.exit(1)
