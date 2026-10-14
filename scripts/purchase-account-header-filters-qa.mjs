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
async function waitRealChoices(page){
  // No menu may show only "Tất cả" when source data has values. Wait for
  // React to commit the choice list, including when native popover opens first.
  await page.waitForFunction(()=>{
    const menu=document.querySelector('.account-heading-filter-menu:popover-open')
    return !!menu&&(menu.querySelectorAll('input[type="radio"]').length>1
      ||!!menu.querySelector('.account-heading-filter-empty'))
  },null,{timeout:8000})
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
  let response
  // Do not validate stale deployments while Cloudflare Preview is updating.
  for(let attempt=0;attempt<18;attempt++){
    response=await page.goto(base+'/purchase/accounts?range=all',
      {waitUntil:'domcontentloaded',timeout:45000})
    if(response?.status()===200&&await page.locator(
      '.account-table-card table[data-account-filter-version="header-v2"]').count()===1)break
    if(attempt===17)throw Error('Preview has not deployed per-header filter code')
    await page.waitForTimeout(10000)
  }
  // SSR can arrive before Preview JS is fully hydrated. Measure only
  // the stable interactive UI; retries are QA-only, not user navigation.
  let ready=false
  for(let retry=0;retry<4;retry++){
    try{
      await page.waitForFunction(()=>{
        const table=document.querySelector('.account-table-card table.user-table')
        const card=document.querySelector('.account-table-card')
        const manager=document.querySelector('.p1-account-filter-actions .managed-column-button')
        const desktopGrips=innerWidth<768||table?.classList.contains('mynh-resizable-table')
        return desktopGrips&&table&&card&&manager&&card.clientWidth>100
          &&Math.abs(table.getBoundingClientRect().width-card.clientWidth)<=8
          &&card.scrollWidth<=card.clientWidth+4
      },null,{timeout:16000})
      ready=true
      break
    }catch{
      const sizes=await page.evaluate(()=>{
        const card=document.querySelector('.account-table-card')
        const table=card?.querySelector('table.user-table')
        return {lane:card?.clientWidth,scroll:card?.scrollWidth,
          table:table?.getBoundingClientRect().width,
          enhanced:table?.classList.contains('mynh-resizable-table'),
          icon:!!document.querySelector('.p1-account-filter-actions .managed-column-button')}
      })
      console.log('ACCOUNT_HEADER_FILTER_WAIT '+JSON.stringify({
        viewport:viewport.width,retry,sizes,
      }))
      if(retry<3){
        await page.reload({waitUntil:'domcontentloaded',timeout:45000})
        await page.locator('.account-table-card table[data-account-filter-version="header-v2"]')
          .waitFor({state:'visible',timeout:25000})
      }
    }
  }
  if(!ready)throw Error('Account interactive header fit did not hydrate at '+viewport.width)
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
  await waitRealChoices(page)
  const usernameMenu=page.locator('.account-heading-filter-menu[popover]:popover-open')
  const usernameChoices=await usernameMenu.locator(
    '.account-heading-filter-option input[type="radio"]').count()
  const manualInputs=await usernameMenu.locator(
    'input[type="search"],input[type="text"],input[type="number"],input[type="date"]').count()
  check(viewport.width+' Username offers existing data only',
    await usernameMenu.count()===1&&usernameChoices>=1&&manualInputs===0,
    {usernameChoices,manualInputs})
  if(viewport.width===390&&usernameChoices>=2){
    const labels=usernameMenu.locator('.account-heading-filter-option input[type="radio"]')
    const selectedUsername=await labels.nth(1).evaluate(el=>
      el.closest('label')?.textContent?.trim()||'')
    await labels.nth(1).check()
    await usernameMenu.locator('button[type="submit"]').click()
    await page.waitForURL(u=>u.searchParams.get('cf_username')===selectedUsername,
      {timeout:25000})
    check('390 selecting real Username filters without document reload',
      await page.evaluate(()=>window.__accountHeaderNoReload===true)
      &&await page.locator('tbody tr[data-account-id]').count()===1)
    await username.click()
    await page.locator('.account-heading-filter-menu[popover]:popover-open button[type="button"]')
      .filter({hasText:'Xóa lọc'}).click()
    await page.waitForURL(u=>!u.searchParams.has('cf_username'),{timeout:25000})
  }else{
    await page.keyboard.press('Escape')
    check(viewport.width+' Esc closes header filter',await usernameMenu.count()===0)
  }

  if(viewport.width===780||viewport.width===800){
    const browserButton=page.locator('th[data-account-col="browser"] .account-heading-filter-trigger')
    await browserButton.click()
    await waitRealChoices(page)
    const menu=page.locator('.account-heading-filter-menu[popover]:popover-open')
    const radio=menu.locator('.account-heading-filter-option input[type="radio"]').nth(1)
    const options=await menu.locator('.account-heading-filter-option input[type="radio"]').count()
    const realBrowserTexts=await page.locator(
      '.account-table-card tbody td[data-account-col="browser"]').allTextContents()
    const nonEmpty=realBrowserTexts.filter(t=>t.trim()&&!['—','-'].includes(t.trim())).length
    check(viewport.width+' Browser options match actual available data',
      options>=2||(options===1&&nonEmpty===0),
      {options,visibleBrowserValues:nonEmpty})
    if(options>=2){
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
    // Every column menu may contain radio lists or the SPC select only.
    // No text/date/number/search input is permitted anywhere in the menus.
    const typed=await page.locator('.account-heading-filter-menu input:not([type="radio"])').count()
    check('1440 all column filters are selection-only',typed===0,{manualFields:typed})

    // Time filter is also choice-only: available day labels come from
    // actual User data; no manual date input is permitted.
    const dateButton=page.locator('th[data-account-col="createdAt"] .account-heading-filter-trigger')
    await dateButton.click()
    await waitRealChoices(page)
    const dialog=page.locator('.account-heading-filter-menu[popover]:popover-open')
    const dateOptions=dialog.locator('.account-heading-filter-option input[type="radio"]')
    const available=await dateOptions.count()
    const realDateTexts=await page.locator(
      '.account-table-card tbody td[data-account-col="createdAt"]').allTextContents()
    const presentDates=realDateTexts.filter(t=>t.trim()&&!['—','-'].includes(t.trim())).length
    check('1440 dates list actual data; no manual input',
      (available>=2||(available===1&&presentDates===0))
       &&await dialog.locator('input[type="date"],input[type="search"]').count()===0,
      {available,presentDates})
    if(available>=2){
      const label=await dateOptions.nth(1).evaluate(el=>
        el.closest('label')?.textContent?.trim()||'')
      const [day,month,year]=label.split('/')
      await dateOptions.nth(1).check()
      await dialog.locator('button[type="submit"]').click()
      await page.waitForURL(u=>u.searchParams.get('cf_createdAt_from')===year+'-'+month+'-'+day
        &&u.searchParams.get('cf_createdAt_to')===year+'-'+month+'-'+day,{timeout:25000})
      check('1440 actual date selected without document reload',
        await page.evaluate(()=>window.__accountHeaderNoReload===true))
    }else await page.keyboard.press('Escape')

    // Status filter still exposes the previous SPC options as secondary scope.
    await page.locator('th[data-account-col="status"] .account-heading-filter-trigger').click()
    const statusMenu=page.locator('.account-heading-filter-menu[popover]:popover-open')
    check('1440 status heading retains SPC session filters',
      await statusMenu.locator('select').count()===1
      &&await statusMenu.locator('option').count()>=2)
    await page.keyboard.press('Escape')
  }
  if(viewport.width===1280){
    // Read-only: selecting a row must move bulk operations into the SAME
    // toolbar without adding any extra vertical band below.
    const first=page.locator('.account-table-card tbody tr[data-account-id] input[type="checkbox"]').first()
    if(await first.count()){
      await first.check()
      const inline=page.locator('.p1-account-filter-actions .user-bulk-toolbar')
      await inline.waitFor({timeout:10000})
      const form=await inline.locator('form.user-bulk-toolbar-form').count()
      check('1280 selected User actions live on existing toolbar',
        form===1&&await inline.locator('button[type="submit"]').count()===1
          &&await page.locator('.order-bulk-bar.user-bulk-bar').count()===0)
      await inline.locator('button.user-bulk-clear').click()
      check('1280 clearing selection removes bulk actions',
        await page.locator('.p1-account-filter-actions .user-bulk-toolbar').count()===0)
    }else check('1280 has User row to test selection without data write',false)
  }
  await context.close()
 }
}finally{await browser.close()}
console.log('ACCOUNT_HEADER_FILTER_QA_SUMMARY '+JSON.stringify({pass,fail}))
if(fail)process.exitCode=1
