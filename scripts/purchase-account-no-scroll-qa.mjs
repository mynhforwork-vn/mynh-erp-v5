/**
 * Regression gate: Account table must have NO horizontal scrolling at
 * 780/800px (or at smaller responsive widths). The column icon and its
 * floating settings menu must match the Purchase Orders reference.
 * Browser read-only: drag preferences are stored only in the QA browser.
 */
import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const base=process.env.PREVIEW_URL,url=process.env.SUPABASE_URL,key=process.env.SUPABASE_KEY
if(!base?.includes('preview-production-v227-baseline-20261013-mynh-erp-v5.mynh-forwork.workers.dev')||!url||!key)
  throw Error('Sole approved Preview auth settings required')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const cookies=new Map()
const sb=createBrowserClient(url,key,{cookies:{
  getAll:()=>[...cookies.values()].map(c=>({name:c.name,value:c.value})),
  setAll:xs=>xs.forEach(x=>cookies.set(x.name,x)),
}})
const {error}=await sb.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
if(error)throw error
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const viewports=[
  {width:320,height:568},{width:390,height:844},
  {width:768,height:1024},{width:780,height:1024},{width:800,height:1024},
  {width:1024,height:768},{width:1280,height:800},{width:1440,height:900},
]
let passed=0,failed=0
function check(name,ok,extra={}){
  const pass=!!ok
  console.log('ACCOUNT_NO_SCROLL_QA '+JSON.stringify({name,pass,...extra}))
  if(pass)passed++;else failed++
}
async function state(page){
  return page.evaluate(()=>{
    const card=document.querySelector('.account-table-card')
    const table=card?.querySelector('table.user-table')
    if(!card||!table)return null
    const cols=[...table.querySelectorAll('colgroup col')]
    const heads=[...table.querySelectorAll('thead th')]
    const width=e=>e.getBoundingClientRect().width
    const stacked=table.dataset.accountLayout==='stacked'
    const desktopViewport=innerWidth>=768
    const tableRows=[...table.querySelectorAll('tbody tr[data-account-id]')]
    const row=tableRows[0]
    const rowStyle=row?getComputedStyle(row).display:null
    const tdStyle=row?.querySelector('td')?getComputedStyle(row.querySelector('td')).display:null
    const semantic=desktopViewport
      ?(!stacked&&getComputedStyle(table).display==='table'
        &&getComputedStyle(table.tHead).display==='table-header-group'
        &&getComputedStyle(table.tHead.rows[0]).display==='table-row'
        &&(rowStyle===null||rowStyle==='table-row')
        &&(tdStyle===null||tdStyle==='table-cell'))
      :true
    const canonical=['number','username','platform','phone','email','status',
      'mobile','browser','voucher','orders','deliveredOrders','createdAt','note']
    const allFields=canonical.every(k=>table.querySelector('th[data-account-col="'+k+'"]'))
      &&[...table.querySelectorAll('tbody tr[data-account-id]')].every(tr=>
        canonical.every(k=>tr.querySelector('td[data-account-col="'+k+'"]')))
    const labeled=stacked&&[...table.querySelectorAll('tbody tr[data-account-id]')]
      .every(tr=>canonical.every(k=>{
        const td=tr.querySelector('td[data-account-col="'+k+'"]')
        if(!td?.getAttribute('data-account-label'))return false
        const style=getComputedStyle(td)
        const box=td.getBoundingClientRect()
        return style.display!=='none'&&style.visibility==='visible'
          &&box.width>=55&&box.height>=17
          &&getComputedStyle(td,'::before').content!=='none'
      }))
    return {
      stacked,semantic,rowStyle,tdStyle,allFields,labeled,
      lane:card.clientWidth,scrollWidth:card.scrollWidth,table:width(table),
      noScroll:card.scrollWidth<=card.clientWidth+4,
      fits:Math.abs(width(table)-card.clientWidth)<=8,
      aligned:stacked?Boolean(labeled)
        :cols.length===heads.length&&cols.every((col,i)=>
          Math.abs(width(col)-width(heads[i]))<=5),
      pageNoOverflow:document.documentElement.scrollWidth<=innerWidth+5,
      count:heads.length,
      voucher:table.querySelector('th[data-account-col="voucher"]')
        ?width(table.querySelector('th[data-account-col="voucher"]')):null,
      manager:table.classList.contains('mynh-resizable-table'),
      documentUnchanged:window.__mynhQaDoc===true,
    }
  })
}
try{
 for(const viewport of viewports){
  const ctx=await browser.newContext({viewport})
  await ctx.addCookies([...cookies.values()].map(c=>({
    name:c.name,value:c.value,url:base,httpOnly:!!c.options?.httpOnly,
    secure:c.options?.secure!==false,
    sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
  })))
  const page=await ctx.newPage()
  let response
  // Validate an actual hydrated page, not a transient SSR/503 response.
  // Cloudflare may serve a temporary error or an older Preview build during
  // deployment; retry the same sole Preview without modifying business data.
  for(let attempt=0;attempt<18;attempt++){
    response=await page.goto(base+'/purchase/accounts?range=all',
      {waitUntil:'domcontentloaded',timeout:45000})
    if(response?.status()===200){
      try{
        await page.locator('.account-table-card table[data-auto-fit-version="7"]')
          .waitFor({state:'visible',timeout:8000})
        await page.waitForFunction(()=>{
          const card=document.querySelector('.account-table-card')
          const table=card?.querySelector('table.user-table')
          return card&&table&&card.clientWidth>120
            &&table.querySelectorAll('thead th').length>=2
        },null,{timeout:6000})
        break
      }catch{}
    }
    if(attempt===17)throw Error('Account Preview not stable/updated after retries; cannot claim QA PASS')
    await page.waitForTimeout(12000)
  }
  // A 200 SSR response can precede stalled/failed client JS asset loads.
  // Only measure after the managed resize system (Tablet/Desktop) and
  // toolbar portal hydrate. Retry transient Preview script failures, but
  // never swallow a genuine persistent un-fitted table.
  let hydrated=false
  const pageErrors=[]
  page.on('pageerror',error=>pageErrors.push(String(error).slice(0,250)))
  for(let attempt=0;attempt<4;attempt++){
    try{
      await page.waitForFunction(()=>{
        const card=document.querySelector('.account-table-card')
        const table=card?.querySelector('table.user-table')
        const manager=document.querySelector('.p1-account-filter-actions .managed-column-button')
        return card&&table&&manager
          &&(table.dataset.accountLayout==='stacked'
            ||table.classList.contains('mynh-resizable-table'))
          &&Math.abs(table.getBoundingClientRect().width-card.clientWidth)<=8
          &&card.scrollWidth<=card.clientWidth+4
      },null,{timeout:15000})
      hydrated=true
      break
    }catch{
      const snapshot=await state(page)
      console.log('ACCOUNT_NO_SCROLL_WAIT '+JSON.stringify({
        width:viewport.width,attempt,snapshot,pageErrors,
      }))
      if(attempt<3){
        response=await page.reload({waitUntil:'domcontentloaded',timeout:45000})
        await page.locator('.account-table-card table[data-auto-fit-version="7"]')
          .waitFor({state:'visible',timeout:20000})
      }
    }
  }
  if(!hydrated)throw Error('Account Auto Fit not hydrated and fitted: '+JSON.stringify({
    width:viewport.width,snapshot:await state(page),pageErrors,
  }))
  await page.evaluate(()=>{window.__mynhQaDoc=true})
  const initial=await state(page)
  check(viewport.width+' Auto Fit without horizontal scroll',
    response?.status()===200&&initial?.noScroll&&initial?.fits&&initial?.aligned
    &&initial?.semantic&&initial?.allFields&&(!initial.stacked||initial.labeled)
    &&initial?.pageNoOverflow&&initial?.documentUnchanged,{initial})

  const button=page.locator('.p1-account-filter-actions .managed-column-button')
  await button.click()
  const dialog=page.locator('body>.p1-account-floating-menu[role="dialog"]')
  const open=await dialog.count()===1
  const sample=open?await dialog.evaluate(el=>{
    const style=getComputedStyle(el)
    const colBtn=document.querySelector('.p1-account-filter-actions .managed-column-button')
    return {fixed:style.position==='fixed',hasRows:el.querySelectorAll('.column-manager-row').length>=10,
      controls:!!el.querySelector('.column-order-buttons'),
      iconOnly:!!colBtn&&colBtn.querySelectorAll('svg').length===1&&colBtn.querySelectorAll('span').length===0}
  }):null
  check(viewport.width+' Orders-style icon and floating column menu',
    open&&sample?.fixed&&sample?.hasRows&&sample?.controls&&sample?.iconOnly,{sample})
  await page.keyboard.press('Escape')
  check(viewport.width+' Esc closes column menu',await dialog.count()===0)

  if(viewport.width===1280){
    const grip=page.locator('.account-table-card th[data-account-col="voucher"] .mynh-column-resize-grip')
    const present=await grip.count()===1
    check(viewport.width+' manual resize grip available',present)
    if(present){
      const before=await state(page)
      const rect=await grip.boundingBox()
      if(rect){
        const x=rect.x+rect.width/2,y=rect.y+rect.height/2
        await page.mouse.move(x,y)
        await page.mouse.down()
        await page.mouse.move(x+24,y,{steps:6})
        await page.mouse.up()
        await page.waitForTimeout(150)
        const after=await state(page)
        check(viewport.width+' drag column increases Voucher and keeps no scroll',
          after?.voucher>=before.voucher+8&&after?.noScroll&&after?.aligned&&after?.fits,
          {before,after})
      }else check(viewport.width+' grip has accessible rectangle',false)
    }
  }
  const user=page.locator('.account-table-card td[data-account-col="username"] .table-link').first()
  if(await user.count()){
    await user.click()
    await page.locator('.account-workspace>.account-detail-panel').waitFor({timeout:20000})
    await page.waitForTimeout(250)
    const afterPanel=await state(page)
    check(viewport.width+' right User slidebar keeps table within lane',
      afterPanel?.noScroll&&afterPanel?.fits&&afterPanel?.aligned
      &&afterPanel?.allFields&&afterPanel?.semantic
      &&(viewport.width>=768?!afterPanel?.stacked:afterPanel?.stacked&&afterPanel?.labeled)
      &&afterPanel?.documentUnchanged,{afterPanel})
  }
  await ctx.close()
 }
}finally{await browser.close()}
console.log('ACCOUNT_NO_SCROLL_QA_SUMMARY '+JSON.stringify({passed,failed}))
if(failed)process.exitCode=1
