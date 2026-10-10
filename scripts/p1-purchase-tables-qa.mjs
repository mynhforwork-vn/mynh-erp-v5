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
  {width:320,height:568},{width:360,height:800},{width:390,height:844},
  {width:414,height:896},{width:600,height:960},{width:768,height:1024},
  {width:820,height:1180},{width:844,height:390},{width:1024,height:768},
  {width:1280,height:720},{width:1366,height:768},{width:1440,height:900},
  {width:1536,height:864},{width:1920,height:1080},{width:2560,height:1600},
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
      accountCols:[...table.querySelectorAll('thead th[data-account-col]')].map(el=>{
        const r=el.getBoundingClientRect()
        return {id:el.getAttribute('data-account-col'),left:r.left,right:r.right,width:r.width}
      }),
      columnButton:(()=>{
        const btn=document.querySelector('.account-table-shell .managed-column-button')
        const r=btn?.getBoundingClientRect()
        return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom}:null
      })(),
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
    if(spec.name==='User'){
      check('User device filter removed',await page.locator('.account-filter-bar [name="device"]').count()===0)
      check('User bulk archive hidden until checkbox selection',await page.locator('.user-bulk-bar').count()===0)
      const filterMenu=page.locator('.p1-filter-dropdown').filter({has:page.locator('input[name="orders"]')})
      await filterMenu.locator('.p1-filter-trigger').click()
      check('User exact order-count preset options',await filterMenu.getByRole('option',{name:'2 đơn'}).count()===1)
      await filterMenu.getByRole('option',{name:'2 đơn'}).click()
      check('User order filter captures exact selection',await filterMenu.locator('input[name="orders"]').inputValue()==='2')
      const voucherMenu=page.locator('.p1-filter-dropdown').filter({has:page.locator('input[name="voucher"]')})
      await voucherMenu.locator('.p1-filter-trigger').click()
      check('User voucher filter displays real tags',await voucherMenu.getByRole('option',{name:'SHHD'}).count()===1)
      await page.keyboard.press('Escape')
      check('User themed dropdown closes with Escape',!(await voucherMenu.getByRole('listbox').isVisible().catch(()=>false)))
      const checkBox=page.locator('.user-table tbody input[type="checkbox"]').first()
      await checkBox.check()
      check('User selected-only archive toolbar visible',await page.locator('.user-bulk-bar').isVisible())
      await checkBox.uncheck()
      check('User archive toolbar disappears when selection clears',await page.locator('.user-bulk-bar').count()===0)
    }
    await menu.click()
    const menuPanel=page.locator((spec.name==='User'?'.account-table-shell':'.order-table-shell')+' .column-manager-menu')
    check(spec.name+' column manager opens',await menuPanel.isVisible())
    await page.keyboard.press('Escape')
    check(spec.name+' column manager Escape closes',!(await menuPanel.isVisible().catch(()=>false)))
    await menu.click()
    await page.locator(spec.name==='User'?'.p1-account-table-tools-label':'.page-head').first().click()
    check(spec.name+' column manager closes on outside click',
      !(await menuPanel.isVisible().catch(()=>false)))
    for(const view of viewports){
      await page.setViewportSize(view)
      await page.waitForTimeout(80)
      const m=await measure(spec)
      check(spec.name+' fit '+view.width+'x'+view.height,fits(m,view),m??{})
      if(spec.name==='User'&&[390,768,1024,1440,1920,2560].includes(view.width)){
        const compact=['number','voucher','orders'].map(id=>m?.accountCols?.find(c=>c.id===id))
        check('User semantic narrow columns '+view.width,
          compact.every((c,i)=>c&&c.width<=[43,106,69][i]),{compact})
        check('User adjacent columns never overlap '+view.width,
          Boolean(m?.accountCols?.every((c,i,all)=>i===0||all[i-1].right<=c.left+2)),
          {cols:m?.accountCols})
        check('User column manager stays in table lane '+view.width,
          Boolean(m?.columnButton&&m.columnButton.left>=m.wrap.left-2
            &&m.columnButton.right<=m.wrap.right+2),
          {button:m?.columnButton,lane:m?.wrap})
      }
      if(view.width===1440){
        check(spec.name+' Desktop 1440 table fits without unnecessary horizontal scroll',
          Boolean(m&&m.table.width<=m.wrap.width+9),
          {table:m?.table.width,lane:m?.wrap.width})
      }
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
      &&restored.filter(x=>x.includes(spec.name==='User'?'Trạng thái':'COD')).length===1,
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
          &&(spec.name==='User'
            ?!m.lastAction&&m.columnButton&&m.columnButton.right<=m.wrap.right+2
            :m.lastAction&&m.lastAction.width>=26&&m.lastAction.width<=60
              &&m.actionHead&&m.actionHead.width>=26&&m.actionHead.width<=60)),m??{})
      await page.screenshot({path:output+'/'+(spec.name==='User'?'accounts':'orders')+'-panel-1440.png',fullPage:false})
      if(spec.name==='User'){
        const trigger=page.locator('.account-table-shell .managed-column-button')
        const menu=page.locator('.account-table-shell .column-manager-menu')
        const geometry=async()=>page.evaluate(()=>{
          const shell=document.querySelector('.account-table-card')?.getBoundingClientRect()
          const btn=document.querySelector('.account-table-shell .managed-column-button')?.getBoundingClientRect()
          const menu=document.querySelector('.account-table-shell .column-manager-menu')?.getBoundingClientRect()
          const panel=document.querySelector('.account-detail-panel')?.getBoundingClientRect()
          return shell&&btn&&menu&&panel?{
            laneLeft:shell.left,laneRight:shell.right,menuLeft:menu.left,menuRight:menu.right,
            buttonRight:btn.right,panelLeft:panel.left,viewport:innerWidth,
          }:null
        })
        await trigger.click()
        const opened=await geometry()
        check('User column menu anchored inside narrow lane with right slidebar',
          Boolean(opened&&opened.menuLeft>=opened.laneLeft-3
            &&opened.menuRight<=opened.laneRight+3
            &&opened.menuRight<=opened.panelLeft+4),opened??{})
        const noteOption=menu.locator('.column-manager-row').filter({hasText:'Ghi chú'}).locator('input[type="checkbox"]')
        await noteOption.uncheck()
        check('User hide column while slidebar open',
          await page.locator('.user-table th[data-account-col="note"]').count()===0)
        await noteOption.check()
        check('User show column restores geometry',
          await page.locator('.user-table th[data-account-col="note"]').count()===1)
        await page.keyboard.press('Escape')
        const collapsedToggle=page.locator('.sidebar-collapse-toggle')
        if(await collapsedToggle.count()){
          await collapsedToggle.click()
          await page.waitForTimeout(270)
          await trigger.click()
          const collapsed=await geometry()
          check('User column menu anchored after left sidebar collapse',
            Boolean(collapsed&&collapsed.menuLeft>=collapsed.laneLeft-3
              &&collapsed.menuRight<=collapsed.laneRight+3
              &&collapsed.menuRight<=collapsed.panelLeft+4),collapsed??{})
          await page.keyboard.press('Escape')
          await collapsedToggle.click()
          await page.waitForTimeout(270)
          await trigger.click()
          const expanded=await geometry()
          check('User column menu anchored after left sidebar expand',
            Boolean(expanded&&expanded.menuLeft>=expanded.laneLeft-3
              &&expanded.menuRight<=expanded.laneRight+3
              &&expanded.menuRight<=expanded.panelLeft+4),expanded??{})
          await page.keyboard.press('Escape')
        }
      }
      await page.setViewportSize({width:390,height:844})
      await page.waitForTimeout(100)
      const mobile=await page.evaluate(s=>{
        const p=document.querySelector(s.panel),r=p?.getBoundingClientRect()
        return {panel:!!p,left:r?.left,right:r?.right,width:r?.width,
          viewport:innerWidth,bodyWidth:document.documentElement.scrollWidth}
      },spec)
      check(spec.name+' detail slidebar fits mobile',
        mobile.panel&&mobile.left>=-3&&mobile.right<=394&&mobile.bodyWidth<=394,mobile)
      if(spec.name==='User'){
        await page.setViewportSize({width:1440,height:900})
        const withOrder=page.locator('.user-table tbody tr').filter({
          has:page.locator('td.count-cell').filter({hasText:/^[1-9][0-9]*$/})
        }).first()
        const found=await withOrder.count()>0
        check('User regression: at least one account has an order',found)
        if(found){
          const targetLink=withOrder.locator('a.table-link').first()
          const targetHref=await targetLink.getAttribute('href')
          const targetUserId=new URL(targetHref,base).searchParams.get('user')
          const targetUsername=(await targetLink.innerText()).trim()
          assert.ok(targetUserId&&targetUsername,'Expected a valid User link')
          await targetLink.click()
          await page.waitForURL(url=>url.searchParams.get('user')===targetUserId,{timeout:15000})
          await page.locator('.account-detail-panel .panel-head h2').getByText(targetUsername,{exact:true}).waitFor({state:'visible',timeout:15000})
          await page.locator('.user-panel-tabs').getByRole('link',{name:/Đơn hàng/}).click()
          await page.waitForURL(url=>url.searchParams.get('user')===targetUserId&&url.searchParams.get('tab')==='orders',{timeout:15000})
          const orderDiagnostics=await page.evaluate(()=>({
            url:location.href,
            listCount:document.querySelectorAll('.user-order-card.detailed').length,
            panelText:document.querySelector('.account-detail-panel')?.textContent?.slice(0,650),
            errors:[...document.querySelectorAll('.error-box')].map(el=>el.textContent?.slice(0,250)),
          }))
          console.log('P1_USER_ORDER_DIAGNOSTICS '+JSON.stringify(orderDiagnostics))
          check('User order list actually renders after opening Orders',
            orderDiagnostics.listCount>0,orderDiagnostics)
          if(orderDiagnostics.listCount){
          await page.locator('.user-order-card.detailed').first().click()
          await page.locator('.context-order-panel').waitFor({state:'visible',timeout:15000})
          check('User → Orders → Order detail remains in Purchase Accounts',
            new URL(page.url()).pathname==='/purchase/accounts'&&Boolean(new URL(page.url()).searchParams.get('order')))
          const trackingTab=page.locator('.context-order-tabs').getByRole('link',{name:'Tracking'})
          if(await trackingTab.count()){
            await trackingTab.click()
            await page.waitForURL(url=>url.searchParams.get('orderTab')==='tracking')
            check('User → Order → Tracking opens without switching module',
              new URL(page.url()).pathname==='/purchase/accounts')
            await page.locator('.context-stack-back').click()
            await page.waitForURL(url=>url.searchParams.get('orderTab')==='info')
            check('Tracking Back returns to same order',
              Boolean(new URL(page.url()).searchParams.get('order')))
          }
          await page.locator('.context-stack-back').click()
          await page.waitForURL(url=>!url.searchParams.get('order')&&url.searchParams.get('tab')==='orders')
          check('Order Back returns to User orders, not another module',
            new URL(page.url()).pathname==='/purchase/accounts')
          }
        }
      }
    }
  }

  await nav('/purchase/tracking?range=all')
  const tracking=await page.evaluate(()=>{
    const first=document.querySelector('.tracking-hub-head-v2')
    const r=first?.getBoundingClientRect()
    const cells=[...document.querySelectorAll('.tracking-hub-table-v2 thead th')]
      .map(x=>x.textContent?.replace(/[↑↓↕⇅]/g,'').trim()??'')
    return{exists:!!first,height:r?.height,detailIndex:cells.indexOf('Trạng thái chi tiết'),statusIndex:cells.indexOf('Trạng thái'),labels:cells}
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
