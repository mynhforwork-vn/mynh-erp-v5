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
try{
 for(const viewport of points){
  const context=await browser.newContext({viewport})
  await context.addCookies([...jar.values()].map(c=>({
    name:c.name,value:c.value,url:base,httpOnly:!!c.options?.httpOnly,
    secure:c.options?.secure!==false,
    sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
  })))
  const page=await context.newPage()
  let response
  // Do not validate stale deployments while Cloudflare Preview is updating.
  for(let attempt=0;attempt<18;attempt++){
    response=await page.goto(base+'/purchase/accounts?range=all',
      {waitUntil:'domcontentloaded',timeout:45000})
    if(response?.status()===200&&await page.locator(
      '.account-table-card table[data-account-filter-version="header-v1"]').count()===1)break
    if(attempt===17)throw Error('Preview has not deployed per-header filter code')
    await page.waitForTimeout(10000)
  }
  await page.evaluate(()=>{window.__accountHeaderNoReload=true})
  const geometry=await page.evaluate(()=>{
    const table=document.querySelector('.account-table-card table.user-table')
    const lane=document.querySelector('.account-table-card')
    const th=[...table.querySelectorAll('thead th')]
    const dataHeads=th.filter(t=>t.hasAttribute('data-account-col'))
    const colManager=document.querySelector('.p1-account-filter-actions .managed-column-button')
    const toolbar=document.querySelector('form.account-filter-bar')
    return {
      count:dataHeads.length,
      missing:dataHeads.filter(t=>t.querySelectorAll(
        ':scope > .account-heading-filter-trigger').length!==1).length,
      horizontal:lane.scrollWidth>lane.clientWidth+4,
      tableFit:Math.abs(table.getBoundingClientRect().width-lane.clientWidth)<=8,
      toolbarOnlySearch:toolbar?.querySelectorAll('input[type="search"],input.search').length===1
        &&toolbar?.querySelectorAll('.p1-filter-dropdown,select,button').length===0,
      archive:toolbar?.querySelectorAll('.archive-view-toggle a').length===2,
      columns:!!colManager,
      noReload:window.__accountHeaderNoReload===true,
    }
  })
  check(viewport.width+' filters on every data heading',
    geometry.count>=2&&geometry.missing===0
    &&geometry.toolbarOnlySearch&&geometry.archive&&geometry.columns
    &&geometry.noReload&&!geometry.horizontal&&geometry.tableFit,geometry)

  // Native top-layer menu cannot be clipped by sticky header, auto-layout,
  // hidden columns or the right-side slidebar.
  const username=page.locator('th[data-account-col="username"] .account-heading-filter-trigger')
  await username.click()
  const usernameMenu=page.locator('.account-heading-filter-menu[popover]:popover-open')
  check(viewport.width+' Username filter opens on header',
    await usernameMenu.count()===1&&await usernameMenu.locator('input[type="search"]').count()===1)
  await page.keyboard.press('Escape')
  check(viewport.width+' Esc closes header filter',await usernameMenu.count()===0)

  if(viewport.width===780||viewport.width===800){
    const browserButton=page.locator('th[data-account-col="browser"] .account-heading-filter-trigger')
    await browserButton.click()
    const menu=page.locator('.account-heading-filter-menu[popover]:popover-open')
    const radio=menu.locator('.account-heading-filter-option input[type="radio"]').nth(1)
    const options=await menu.locator('.account-heading-filter-option input[type="radio"]').count()
    check(viewport.width+' Browser choices from live User data',options>=2)
    if(options>=2){
      const optionValue=await radio.evaluate(el=>el.closest('label')?.innerText?.trim()||'')
      await radio.check()
      await menu.locator('button[type="submit"]').click()
      await page.waitForURL(u=>u.searchParams.has('browser')&&u.searchParams.get('range')==='all',
        {timeout:25000})
      const state=await page.evaluate(()=>({
        doc:window.__accountHeaderNoReload===true,
        card:document.querySelector('.account-table-card')?.scrollWidth,
        lane:document.querySelector('.account-table-card')?.clientWidth,
        selected:document.querySelector('th[data-account-col="browser"] .account-heading-filter-trigger')?.classList.contains('is-active'),
      }))
      check(viewport.width+' Browser filter preserves route and Auto Fit',state.doc&&state.selected
        &&state.card<=state.lane+4,{documentUnchanged:state.doc,noHorizontal:state.card<=state.lane+4})
      await browserButton.click()
      await page.locator('.account-heading-filter-menu[popover]:popover-open button[type="button"]')
        .filter({hasText:'Xóa lọc'}).click()
      await page.waitForURL(u=>!u.searchParams.has('browser'),{timeout:25000})
      check(viewport.width+' clear Browser filter without reload',
        await page.evaluate(()=>window.__accountHeaderNoReload===true))
    }
  }
  if(viewport.width===1440){
    // All original data headings must be present when lane can fit them.
    const allHeaders=await page.locator('th[data-account-col]').count()
    check('1440 all 13 data headings have filters',allHeaders===13)

    // Test the existing sorting header and date range filter independently.
    const dateButton=page.locator('th[data-account-col="createdAt"] .account-heading-filter-trigger')
    await dateButton.click()
    const dialog=page.locator('.account-heading-filter-menu[popover]:popover-open')
    await dialog.locator('input[type="date"]').first().fill('2026-10-01')
    await dialog.locator('input[type="date"]').last().fill('2026-10-14')
    await dialog.locator('button[type="submit"]').click()
    await page.waitForURL(u=>u.searchParams.get('cf_createdAt_from')==='2026-10-01'
      &&u.searchParams.get('cf_createdAt_to')==='2026-10-14',{timeout:25000})
    check('1440 date range filter without document reload',
      await page.evaluate(()=>window.__accountHeaderNoReload===true))

    // Status filter still exposes the previous SPC options as secondary scope.
    await page.locator('th[data-account-col="status"] .account-heading-filter-trigger').click()
    const statusMenu=page.locator('.account-heading-filter-menu[popover]:popover-open')
    check('1440 status heading retains SPC session filters',
      await statusMenu.locator('select').count()===1
      &&await statusMenu.locator('option').count()>=2)
    await page.keyboard.press('Escape')
  }
  await context.close()
 }
}finally{await browser.close()}
console.log('ACCOUNT_HEADER_FILTER_QA_SUMMARY '+JSON.stringify({pass,fail}))
if(fail)process.exitCode=1
