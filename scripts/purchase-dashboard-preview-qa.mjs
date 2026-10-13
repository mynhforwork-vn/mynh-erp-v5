/**
 * Read-only compact Dashboard regression QA for the sole ERP preview:
 * no business mutations, no additional Named Preview, temporary QA login cleaned by workflow.
 */
import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const base=process.env.PREVIEW_URL
const sbUrl=process.env.SUPABASE_URL
const sbKey=process.env.SUPABASE_KEY
if(!base||!sbUrl||!sbKey)throw Error('PREVIEW_URL / SUPABASE_URL / SUPABASE_KEY required')
if(!base.includes('preview-production-v227-baseline-20261013-mynh-erp-v5.mynh-forwork.workers.dev'))throw Error('Not the approved sole Preview')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const cookieMap=new Map()
const sb=createBrowserClient(sbUrl,sbKey,{cookies:{
  getAll:()=>[...cookieMap.values()].map(c=>({name:c.name,value:c.value})),
  setAll:items=>items.forEach(c=>cookieMap.set(c.name,c)),
}})
const {error}=await sb.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
if(error)throw error
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const folder='qa-purchase-dashboard-artifacts'
fs.mkdirSync(folder,{recursive:true})
const viewports=[
 {name:'mobile-320',width:320,height:568},
 {name:'mobile-360',width:360,height:800},
 {name:'mobile-390',width:390,height:844},
 {name:'tablet-768',width:768,height:1024},
 {name:'tablet-1024',width:1024,height:768},
 {name:'desktop-1280',width:1280,height:800},
 {name:'desktop-1440',width:1440,height:900},
 {name:'desktop-1920',width:1920,height:1080},
]
const checks=[]
const check=(name,pass,meta={})=>{checks.push({name,pass,meta});console.log('PURCHASE_DASHBOARD_QA '+JSON.stringify({name,pass,...meta}));}
async function contextFor(viewport){
  const ctx=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}})
  await ctx.addCookies([...cookieMap.values()].map(c=>({
    name:c.name,value:c.value,url:base,httpOnly:Boolean(c.options?.httpOnly),
    secure:c.options?.secure!==false,
    sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
  })))
  return ctx
}
try{
  for(const viewport of viewports){
    const context=await contextFor(viewport)
    const page=await context.newPage()
    const errors=[]
    page.on('pageerror',e=>errors.push(String(e.message).slice(0,160)))
    let status=0, finalUrl='', layout=null, metrics=[], errorsLocal=[];
    let chartsAbsent=false, kpiContract=false, oneRow=false, overflow=false;
    let datesVisible=false, quarterAbsent=false, groupsCorrect=false, tableCorrect=false;
    let compactPanels=false, scrollIsolated=false, timeToolbar=false, snapshotCorrect=false;
    try{
      // The existing Named Preview builds asynchronously after this branch is pushed.
      for(let retry=0;retry<12;retry++){
        const response=await page.goto(base+'/purchase?range=all',{waitUntil:'domcontentloaded',timeout:40000})
        status=response?.status()??0; finalUrl=page.url()
        if(status===200 && await page.locator('.pd-kpi-card').count()===9)break
        if(retry<11)await page.waitForTimeout(15000)
      }
      metrics=(await page.locator('.pd-kpi-card>b').allTextContents()).map(s=>Number(s.trim()))
      const container=page.locator('.pd-metrics.kpi-grid.order-kpi-grid-v2.entity-status-strip')
      kpiContract=await container.count()===1 &&
        await container.locator(':scope > .pd-kpi-card.kpi-card.entity-status-metric').count()===9
      chartsAbsent=await page.locator('.pd-chart-section,.pd-chart-panel,.pd-chart-grid,.pd-visual-legend').count()===0 &&
        await page.getByText('BIỂU ĐỒ TRỰC QUAN',{exact:true}).count()===0 &&
        await page.getByText('Phân bổ vận chuyển và giao hàng',{exact:true}).count()===0
      datesVisible=await page.locator('.pd-time-calendar input[type="date"]:visible').count()===2
      quarterAbsent=await page.getByRole('link',{name:'Quý này',exact:true}).count()===0
      overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+6)
      layout=await page.evaluate(()=>{
        const kpi=[...document.querySelectorAll('.pd-kpi-card')]
        const panelL=document.querySelector('.pd-summary-table')
        const panelR=document.querySelector('.pd-action-panel')
        const work=document.querySelector('.pd-workspace')
        const foot=document.querySelector('.pd-footer')
        const table=document.querySelector('.pd-status-table')
        const header=document.querySelector('.pd-summary-head-table')
        const scroller=document.querySelector('.pd-summary-table .pd-table-scroll')
        const actions=document.querySelector('.pd-action-orders-scroll')
        const cards=document.querySelector('.pd-action-primary')
        const quick=document.querySelector('.pd-time-quick')
        const calendar=document.querySelector('.pd-time-calendar')
        if(kpi.length!==9||![panelL,panelR,work,foot,table,header,scroller,actions,cards,quick,calendar].every(Boolean))return null
        const a=panelL.getBoundingClientRect(),b=panelR.getBoundingClientRect()
        const label=[...table.querySelectorAll('tbody th[scope="row"]')].every(x=>getComputedStyle(x).textAlign==='left')
        const numeric=[...table.querySelectorAll('tbody td:not([colspan])')].every(x=>getComputedStyle(x).textAlign==='center')
        const th=[...header.querySelectorAll('thead th')]
        const thAligned=th.length===4&&getComputedStyle(th[0]).textAlign==='left'&&th.slice(1).every(x=>getComputedStyle(x).textAlign==='center')
        const tops=kpi.map(x=>Math.round(x.getBoundingClientRect().top))
        const groupTops=[...cards.querySelectorAll('button')].map(x=>Math.round(x.getBoundingClientRect().top))
        return {
          kpiOneRow:Math.max(...tops)-Math.min(...tops)<=2,
          kpiRadius:parseFloat(getComputedStyle(kpi[0]).borderTopLeftRadius),
          kpiHeight:Math.round(kpi[0].getBoundingClientRect().height),
          leftWidth:Math.round(a.width),rightWidth:Math.round(b.width),
          sameHeight:Math.abs(a.height-b.height)<3,sameTop:Math.abs(a.top-b.top)<3,
          labelsAligned:label&&numeric&&thAligned,
          leftScroll:getComputedStyle(scroller).overflowY,
          rightScroll:getComputedStyle(actions).overflowY,
          fixedHeads:!scroller.contains(header)&&!actions.contains(cards),
          primaryRow:groupTops.length===3&&Math.max(...groupTops)-Math.min(...groupTops)<=2,
          footerGap:Math.round(foot.getBoundingClientRect().top-work.getBoundingClientRect().bottom),
          timeRows:Math.abs(quick.getBoundingClientRect().top-calendar.getBoundingClientRect().top)<10?1:2,
        }
      })
      oneRow=!!layout&&layout.kpiOneRow
      compactPanels=!!layout&&layout.footerGap>=0&&layout.footerGap<=25 &&
        (viewport.width<=960||(layout.sameHeight&&layout.sameTop&&layout.leftWidth<layout.rightWidth))
      scrollIsolated=!!layout&&layout.fixedHeads&&layout.primaryRow&&
        layout.leftScroll!=='visible'&&layout.rightScroll!=='visible'&&layout.labelsAligned
      timeToolbar=!!layout&&(viewport.width<=1080||layout.timeRows===1)
      kpiContract=kpiContract&&!!layout&&layout.kpiRadius>=5&&layout.kpiRadius<=8&&layout.kpiHeight>=60&&layout.kpiHeight<=80
      tableCorrect=await page.locator('.pd-status-table').evaluate(table=>{
        const rows=[...table.querySelectorAll('tbody tr')];
        return rows.every(row=>row.querySelectorAll('td').length===3 || row.querySelector('td[colspan="4"]'))
      })
      const groups=page.locator('.pd-action-primary button,.pd-queue-secondary button')
      groupsCorrect=await groups.count()===6
      const tested=viewport.name==='desktop-1440'?6:1
      for(let i=0;i<tested;i++){
        const button=groups.nth(i)
        const expected=Number(await button.locator(i<3?'.pd-primary-count':'b').textContent())
        await button.click()
        const links=page.locator('.pd-action-orders-scroll .action-queue-orders>a')
        const actual=await links.count()
        const hrefsValid=await links.evaluateAll(arr=>arr.every(el=>el.getAttribute('href')?.startsWith('/purchase/orders?')))
        groupsCorrect=groupsCorrect&&actual===expected&&hrefsValid&&await button.getAttribute('aria-pressed')==='true'
      }
      await page.getByRole('button',{name:'Tất cả',exact:true}).click()
      groupsCorrect=groupsCorrect&&await groups.filter({has:page.locator('[aria-pressed="true"]')}).count()===0
      // Both missing-location and exempt express issues must open lists of matching orders.
      const issueButtons=page.locator('.pd-quality-footer button')
      for(let i=0;i<await issueButtons.count();i++){
        const issue=issueButtons.nth(i)
        await issue.click()
        const count=await page.locator('.pd-action-orders-scroll .action-queue-orders>a').count()
        const listOk=count>0&&await issue.getAttribute('aria-pressed')==='true'
        groupsCorrect=groupsCorrect&&listOk
        await page.getByRole('button',{name:'Tất cả',exact:true}).click()
      }
      await page.screenshot({path:folder+'/'+viewport.name+'.png',fullPage:false})
      if(viewport.name==='desktop-1440'){
        const previousExpress=metrics[1]
        await page.getByRole('link',{name:'Hôm nay',exact:true}).click()
        await page.waitForURL(/range=today/,{timeout:25000})
        const todayResponse=await page.goto(page.url(),{waitUntil:'domcontentloaded',timeout:40000})
        const express=Number(await page.locator('.pd-kpi-card>b').nth(1).textContent())
        snapshotCorrect=todayResponse?.status()===200&&previousExpress===express
        check('time-filter-and-express-snapshot',snapshotCorrect,{previousExpress,express,status:todayResponse?.status()})
      }else snapshotCorrect=true
    }catch(e){errorsLocal.push(String(e.message??e).slice(0,270))}
    check(viewport.name,status===200&&!finalUrl.includes('/login')&&metrics.length===9&&metrics.every(Number.isFinite)&&
      chartsAbsent&&kpiContract&&oneRow&&!overflow&&datesVisible&&quarterAbsent&&groupsCorrect&&tableCorrect&&
      compactPanels&&scrollIsolated&&timeToolbar&&snapshotCorrect&&errors.length===0&&errorsLocal.length===0,{
      status,metrics:metrics.length,chartsAbsent,kpiContract,oneRow,overflow,datesVisible,quarterAbsent,
      groupsCorrect,tableCorrect,compactPanels,scrollIsolated,timeToolbar,snapshotCorrect,layout,errors:[...errors,...errorsLocal]})
    await context.close()
  }
}finally{await browser.close()}
fs.writeFileSync(folder+'/summary.json',JSON.stringify(checks,null,2))
const failures=checks.filter(c=>!c.pass)
console.log('PURCHASE_DASHBOARD_QA_SUMMARY '+JSON.stringify({passed:checks.length-failures.length,failed:failures.length}))
if(failures.length)process.exitCode=1
