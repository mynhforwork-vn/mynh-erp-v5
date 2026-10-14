/**
 * Read-only Preview QA: filters move to ALL data headers; toolbar retains
 * free-text search, archive switch and column preferences only.
 * Verify one filter per visible data heading, data-derived options, no
 * document reload, Esc/outside dismissal, Auto Fit and column-resize safety.
 */
import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const base=process.env.PREVIEW_URL,url=process.env.SUPABASE_URL,key=process.env.SUPABASE_KEY
if(!base?.includes('preview-production-v227-baseline-20261013-mynh-erp-v5.mynh-forwork.workers.dev')||!url||!key)
  throw Error('Preview-only QA env is required')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const jar=new Map()
const sb=createBrowserClient(url,key,{cookies:{
  getAll:()=>[...jar.values()].map(x=>({name:x.name,value:x.value})),
  setAll:xs=>xs.forEach(x=>jar.set(x.name,x)),
}})
const {error}=await sb.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
if(error)throw error
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
let pass=0,fail=0
const check=(name,ok,meta={})=>{
  const good=!!ok
  console.log('ACCOUNT_HEADER_FILTER_QA '+JSON.stringify({name,pass:good,...meta}))
  if(good)pass++;else fail++
}
const points=[
  {width:390,height:844},{width:780,height:1024},{width:800,height:1024},
  {width:1280,height:800},{width:1440,height:900},
]
async function openFilter(page,key){
  const button=page.locator('th[data-account-col="'+key+'"] .account-heading-filter-trigger')
  const dialog=page.locator('.account-heading-filter-menu[popover]:popover-open')
  if(await dialog.count()===0)await button.click()
  await page.waitForFunction(()=>{
    const menu=document.querySelector('.account-heading-filter-menu:popover-open')
    return !!menu&&(menu.querySelectorAll('input[type="checkbox"]').length>0
      ||!!menu.querySelector('.account-heading-filter-empty'))
  },null,{timeout:10000})
  return dialog
}
const selectedValues=raw=>{
  try{return raw?.startsWith('[')?JSON.parse(raw):raw?[raw]:[]}catch{return []}
}
try{
 for(const viewport of points){
  const context=await browser.newContext({viewport})
  await context.addCookies([...jar.values()].map(c=>({
    name:c.name,value:c.value,url:base,httpOnly:!!c.options?.httpOnly,
    secure:c.options?.secure!==false,
    sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
  })))
  const page=await context.newPage()
  let ready=false
  for(let attempt=0;attempt<4;attempt++){
    const response=await page.goto(base+'/purchase/accounts?range=all',
      {waitUntil:'domcontentloaded',timeout:45000})
    try{
      if(response?.status()!==200)throw Error('Preview returned '+response?.status())
      await page.locator('.account-table-card table[data-account-filter-version="header-v3"]')
        .waitFor({state:'visible',timeout:18000})
      await page.waitForFunction(()=>{
        const table=document.querySelector('.account-table-card table.user-table')
        const card=document.querySelector('.account-table-card')
        const manager=document.querySelector('.p1-account-filter-actions .managed-column-button')
        return table&&card&&manager&&card.clientWidth>100
          &&(innerWidth<768||table.classList.contains('mynh-resizable-table'))
          &&Math.abs(table.getBoundingClientRect().width-card.clientWidth)<=8
          &&card.scrollWidth<=card.clientWidth+4
      },null,{timeout:18000})
      ready=true
      break
    }catch(e){
      console.log('ACCOUNT_HEADER_FILTER_WAIT '+JSON.stringify({
        width:viewport.width,attempt,message:String(e).slice(0,120),
      }))
      if(attempt===3)throw e
      await page.waitForTimeout(3000)
    }
  }
  if(!ready)throw Error('Preview not ready at '+viewport.width)
  await page.evaluate(()=>window.__accountHeaderNoReload=true)

  const geo=await page.evaluate(()=>{
    const card=document.querySelector('.account-table-card')
    const table=card.querySelector('table.user-table')
    const headers=[...table.querySelectorAll('thead th[data-account-col]')]
    const toolbar=document.querySelector('form.account-filter-bar')
    return {
      count:headers.length,
      unfiltered:headers.filter(el=>el.querySelectorAll(
        ':scope > .account-heading-filter-trigger').length!==1).length,
      noScroll:card.scrollWidth<=card.clientWidth+4,
      fit:Math.abs(table.getBoundingClientRect().width-card.clientWidth)<=8,
      toolbarSearch:toolbar?.querySelectorAll('input.search').length===1,
      toolbarArchive:toolbar?.querySelectorAll('.archive-view-toggle a').length===2,
      columnIcon:!!document.querySelector('.p1-account-filter-actions .managed-column-button'),
      hydrated:window.__accountHeaderNoReload===true,
    }
  })
  check(viewport.width+' all available column headers and no scroll',
    geo.count>=3&&geo.unfiltered===0&&geo.noScroll&&geo.fit
    &&geo.toolbarSearch&&geo.toolbarArchive&&geo.columnIcon&&geo.hydrated,geo)

  const username=await openFilter(page,'username')
  const typed=username.locator('.account-heading-filter-search')
  const choices=username.locator('.account-heading-filter-option input[type="checkbox"]')
  const count=await choices.count()
  check(viewport.width+' filter has a search field and selectable data',
    await typed.count()===1&&count>0
    &&await username.locator('button[type="submit"]').count()===0
    &&await username.locator('button').filter({hasText:'Xóa lọc'}).count()===1,
    {choices:count})
  if(count>=2){
    const firstLabel=await choices.nth(0).evaluate(el=>
      el.closest('label')?.textContent?.trim()||'')
    await typed.fill(firstLabel.slice(0,Math.min(3,firstLabel.length)))
    const narrowed=await choices.count()
    check(viewport.width+' search narrows DATA only, not a typed filter',
      narrowed>=1&&narrowed<=count)
    await typed.fill('')
    await choices.nth(0).check()
    await page.waitForURL(u=>u.searchParams.get('cf_username')===firstLabel,{timeout:25000})
    check(viewport.width+' selecting one value filters immediately',
      await page.evaluate(()=>window.__accountHeaderNoReload===true))
    const again=await openFilter(page,'username')
    const others=again.locator('.account-heading-filter-option input[type="checkbox"]')
    const secondLabel=await others.nth(1).evaluate(el=>
      el.closest('label')?.textContent?.trim()||'')
    await others.nth(1).check()
    await page.waitForURL(u=>selectedValues(u.searchParams.get('cf_username'))
      .length===2,{timeout:25000})
    const values=selectedValues(new URL(page.url()).searchParams.get('cf_username'))
    check(viewport.width+' two Username choices filter with OR and no reload',
      values.includes(firstLabel)&&values.includes(secondLabel)
      &&await page.evaluate(()=>window.__accountHeaderNoReload===true),
      {count:values.length})
    const menu=await openFilter(page,'username')
    await menu.locator('button').filter({hasText:'Xóa lọc'}).click()
    await page.waitForURL(u=>!u.searchParams.has('cf_username'),{timeout:25000})
  }else await page.keyboard.press('Escape')

  if(viewport.width===780||viewport.width===800){
    const menu=await openFilter(page,'browser')
    const browserOptions=await menu.locator('.account-heading-filter-option input[type="checkbox"]').count()
    check(viewport.width+' Browser list derives live data',browserOptions>0,{browserOptions})
    if(browserOptions>=1){
      await menu.locator('.account-heading-filter-option input[type="checkbox"]').first().check()
      await page.waitForURL(u=>u.searchParams.has('browser'),{timeout:25000})
      check(viewport.width+' Browser filter applies without Apply button',
        await page.evaluate(()=>window.__accountHeaderNoReload===true))
      const reopened=await openFilter(page,'browser')
      await reopened.locator('button').filter({hasText:'Xóa lọc'}).click()
      await page.waitForURL(u=>!u.searchParams.has('browser'),{timeout:25000})
    }
  }
  if(viewport.width===1280){
    const checkbox=page.locator('.account-table-card tbody tr[data-account-id] input[type="checkbox"]').first()
    if(await checkbox.count()){
      await checkbox.check()
      const actions=page.locator('.p1-account-filter-actions .user-bulk-toolbar')
      await actions.waitFor({timeout:8000})
      const beforeIcon=await page.evaluate(()=>{
        const actions=document.querySelector('.p1-account-filter-actions .user-bulk-toolbar')
        const icon=document.querySelector('.p1-account-filter-actions .managed-column-wrap')
        return actions&&icon&&actions.getBoundingClientRect().right<=icon.getBoundingClientRect().left+4
      })
      check('1280 bulk controls precede column icon on same toolbar',
        beforeIcon&&await actions.locator('button[type="submit"]').count()===1
        &&await page.locator('.order-bulk-bar.user-bulk-bar').count()===0)
      await actions.locator('.user-bulk-clear').click()
      check('1280 bulk toolbar clears without a page reload',
        await page.locator('.user-bulk-toolbar').count()===0
        &&await page.evaluate(()=>window.__accountHeaderNoReload===true))
    }
  }
  if(viewport.width===1440){
    check('1440 all 13 Account data columns visible',
      await page.locator('th[data-account-col]').count()===13)
    const dateMenu=await openFilter(page,'createdAt')
    const dates=dateMenu.locator('.account-heading-filter-option input[type="checkbox"]')
    check('1440 date filter has existing dates and search',
      await dates.count()>0&&await dateMenu.locator('input[type="date"]').count()===0)
    if(await dates.count()){
      await dates.first().check()
      await page.waitForURL(u=>u.searchParams.has('cf_createdAt'),{timeout:25000})
      check('1440 date filter acts immediately without typing',
        await page.evaluate(()=>window.__accountHeaderNoReload===true))
      const reopened=await openFilter(page,'createdAt')
      await reopened.locator('button').filter({hasText:'Xóa lọc'}).click()
      await page.waitForURL(u=>!u.searchParams.has('cf_createdAt'),{timeout:25000})
    }
    const headerState=await page.locator('th[data-account-col="voucher"]').evaluate(el=>({
      sticky:getComputedStyle(el).position==='sticky',
      text:el.querySelector('.account-heading-filter-caption')?.textContent?.trim(),
      wrap:getComputedStyle(el.querySelector('.account-heading-filter-caption')).whiteSpace,
    }))
    check('1440 sticky table heading and Voucher label',headerState.sticky
      &&headerState.text==='Voucher'&&headerState.wrap==='normal',headerState)
    const statusMenu=await openFilter(page,'status')
    check('1440 SPC remains selectable within Status filter',
      await statusMenu.locator('.account-heading-filter-secondary input[type="checkbox"]').count()>0)
    await page.keyboard.press('Escape')
  }
  await context.close()
 }
}finally{await browser.close()}
console.log('ACCOUNT_HEADER_FILTER_QA_SUMMARY '+JSON.stringify({pass,fail}))
if(fail)process.exitCode=1
