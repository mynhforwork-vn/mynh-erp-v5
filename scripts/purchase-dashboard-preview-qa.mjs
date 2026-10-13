/**
 * Read-only visual/regression QA for the sole ERP preview:
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
    let status=0,finalUrl='',metrics=[],charts=0,filterRemoved=false,oneRow=false,overflow=false,
      chartTotal=[],isChartRendered=false,datesVisible=false,quarterRemoved=false,tablePresent=false,groupedActions=false,chartValuesAgree=false,tableValuesAgree=false,tableScrollIsolated=false,actionScrollIsolated=false,narrowerLeft=false,
      layout=null,panelBalance=false,leftAligned=false,kpiShape=false,compactToolbar=false;
    try{
      const response=await page.goto(base+'/purchase?range=all',{waitUntil:'domcontentloaded',timeout:40000})
      status=response?.status()??0;finalUrl=page.url()
      await page.locator('.pd-chart-panel').first().waitFor({state:'visible',timeout:20000})
      await page.waitForTimeout(120)
      metrics=await page.locator('.pd-metric strong').allTextContents()
      charts=await page.locator('.pd-chart-panel').count()
      filterRemoved=await page.locator('.pd-location-filters').count()===0
      oneRow=await page.locator('.pd-metrics').evaluate(el=>{
        const cards=[...el.querySelectorAll('.pd-metric')]
        if(cards.length!==9)return false
        const tops=cards.map(x=>Math.round(x.getBoundingClientRect().top))
        return Math.max(...tops)-Math.min(...tops)<=2
      })
      overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+6)
      chartTotal=(await page.locator('.pd-chart-total b').allTextContents()).map(s=>Number(s.trim()))
      const kpis=metrics.map(s=>Number(s.trim()))
      chartValuesAgree=chartTotal.length===5&&
        chartTotal[0]===kpis[2]&&chartTotal[1]===kpis[3]&&chartTotal[2]===kpis[3]&&
        chartTotal[3]===kpis[6]&&chartTotal[4]===kpis[6]
      datesVisible=await page.locator('.pd-time-calendar input[type="date"]:visible').count()===2
      quarterRemoved=await page.getByRole('link',{name:'Quý này',exact:true}).count()===0
      tablePresent=await page.locator('.pd-left-rail .pd-status-table').count()===1
        && await page.locator('.pd-status-table tbody tr th[scope="row"]').count()>=1
        && await page.locator('.pd-status-table tbody tr.pd-table-section').count()===0
      groupedActions=await page.locator('.pd-right-rail button.action-queue-summary').count()===3
        && await page.locator('.pd-right-rail button.pd-queue-mini').count()===3
        && await page.locator('.pd-right-rail .pd-action-orders-scroll').count()===1
        && await page.locator('.pd-left-rail .action-queue-summary').count()===0
      layout=await page.evaluate(()=>{
        const left=document.querySelector('.pd-summary-table')
        const right=document.querySelector('.pd-action-panel')
        const bodyTable=document.querySelector('.pd-status-table')
        const headTable=document.querySelector('.pd-summary-head-table')
        const scroll=document.querySelector('.pd-summary-table .pd-table-scroll')
        const actionScroll=document.querySelector('.pd-action-orders-scroll')
        const actionCards=document.querySelector('.pd-action-primary')
        const kpi=document.querySelector('.pd-metric')
        const toolbar=document.querySelector('.pd-time-calendar')
        const quick=document.querySelector('.pd-time-quick')
        if(!(left&&right&&bodyTable&&headTable&&scroll&&actionScroll&&actionCards&&kpi&&toolbar&&quick))return null
        const lr=left.getBoundingClientRect(),rr=right.getBoundingClientRect()
        const labels=[...bodyTable.querySelectorAll('tbody th[scope="row"]')]
        const nums=[...bodyTable.querySelectorAll('tbody td:not([colspan])')]
        const hds=[...headTable.querySelectorAll('thead th')]
        const labelLeft=labels.every(el=>getComputedStyle(el).textAlign==='left')
        const numsCentered=nums.every(el=>getComputedStyle(el).textAlign==='center')
        const headerAligned=hds[0]&&getComputedStyle(hds[0]).textAlign==='left'&&hds.slice(1).every(el=>getComputedStyle(el).textAlign==='center')
        const kpiRadius=parseFloat(getComputedStyle(kpi).borderTopLeftRadius)
        const aligned=Math.abs(lr.top-rr.top)<3&&Math.abs(lr.height-rr.height)<3
        const toolbarVisible=toolbar.getBoundingClientRect().height>=28
        const scrollCss=getComputedStyle(scroll).overflowY
        const actionCss=getComputedStyle(actionScroll).overflowY
        const actionCardsTop=actionCards.getBoundingClientRect().top
        const headerTop=headTable.getBoundingClientRect().top
        const leftScrollPossible=scroll.scrollHeight>scroll.clientHeight+1
        const beforeL=scroll.scrollTop,beforeR=actionScroll.scrollTop
        scroll.scrollTop=120
        actionScroll.scrollTop=120
        const fixedTable=Math.abs(headTable.getBoundingClientRect().top-headerTop)<=1
        const fixedCards=Math.abs(actionCards.getBoundingClientRect().top-actionCardsTop)<=1
        scroll.scrollTop=beforeL;actionScroll.scrollTop=beforeR
        return {
          aligned,leftWidth:Math.round(lr.width),rightWidth:Math.round(rr.width),
          leftHeight:Math.round(lr.height),rightHeight:Math.round(rr.height),
          labelLeft,numsCentered,headerAligned,fixedTable,fixedCards,leftScrollPossible,
          scrollCss,actionCss,headingOutsideScroll:!scroll.contains(headTable),
          actionCardsOutsideScroll:!actionScroll.contains(actionCards),
          kpiRadius,toolbarVisible,
          timeRows:Math.abs(quick.getBoundingClientRect().top-toolbar.getBoundingClientRect().top)<10?1:2,
          primaryInRow:(()=>{
            const items=[...actionCards.querySelectorAll('button')]
            if(items.length!==3)return false
            const tops=items.map(el=>el.getBoundingClientRect().top)
            return Math.max(...tops)-Math.min(...tops)<=2
          })()
        }
      })
      panelBalance=!!layout&&(viewport.width<=960||layout.aligned)
      leftAligned=!!layout&&layout.labelLeft&&layout.numsCentered&&layout.headerAligned
      kpiShape=!!layout&&layout.kpiRadius<=5
      compactToolbar=!!layout&&layout.toolbarVisible&&(viewport.width<=1080||layout.timeRows===1)
      const tableScrollIsolated=!!layout&&layout.headingOutsideScroll&&layout.fixedTable&&layout.scrollCss!=='visible'
      const actionScrollIsolated=!!layout&&layout.actionCardsOutsideScroll&&layout.fixedCards&&layout.actionCss!=='visible'&&layout.primaryInRow
      const narrowerLeft=!!layout&&(viewport.width<=960||layout.leftWidth<layout.rightWidth)
      const tableSums=await page.locator('.pd-status-table').evaluate(table=>{
        const rows=[...table.querySelectorAll('tbody tr')]
        const sums={area:[0,0,0]}
        for(const row of rows){
          if(row.classList.contains('pd-table-section'))continue
          const vals=[...row.querySelectorAll('td')].map(td=>Number(td.textContent?.trim()))
          if(vals.length===3){for(let j=0;j<3;j++)sums.area[j]+=vals[j]}
        }
        return sums
      })
      tableValuesAgree=tableSums.area[0]===kpis[2]&&tableSums.area[1]===kpis[3]&&tableSums.area[2]===kpis[6]
      // Nhấp từng nhóm phải hiện đúng danh sách; đóng lọc phải trả về tất cả.
      const firstGroup=page.locator('.pd-action-primary button').first()
      const primaryCount=Number(await firstGroup.locator('.pd-primary-count').textContent())
      await firstGroup.click()
      const selectedCount=await page.locator('.pd-action-orders-scroll .action-queue-orders>a').count()
      const selectedCorrect=selectedCount===primaryCount&&
        await firstGroup.getAttribute('aria-pressed')==='true'
      await page.getByRole('button',{name:'Tất cả',exact:true}).click()
      const allRestored=await page.locator('.pd-action-primary button[aria-pressed="true"]').count()===0
      // Đơn Hỏa tốc không áp dụng HUB hiện được liên kết để xem chi tiết, không xem là lỗi.
      const exempt=page.locator('.pd-quality-neutral')
      const exemptCount=await exempt.count()
      let exemptClickable=true
      if(exemptCount>0){
        await exempt.click()
        const issueLinks=await page.locator('.pd-action-orders-scroll .action-queue-orders>a').count()
        exemptClickable=issueLinks>0&&await exempt.getAttribute('aria-pressed')==='true'
        await page.getByRole('button',{name:'Tất cả',exact:true}).click()
      }
      groupedActions=groupedActions&&selectedCorrect&&allRestored&&exemptClickable
      isChartRendered=await page.locator('.pd-chart-bars .pd-chart-bar-track, .pd-chart-columns .pd-chart-column-space, .pd-chart-empty').count()>=5
      if(charts===5)await page.screenshot({path:folder+'/'+viewport.name+'.png',fullPage:false})
    }catch(e){errors.push(String(e.message??e).slice(0,260))}
    check(viewport.name,status===200&&!finalUrl.includes('/login')&&metrics.length===9&&charts===5&&
      filterRemoved&&oneRow&&!overflow&&chartValuesAgree&&datesVisible&&quarterRemoved&&tablePresent&&groupedActions&&tableValuesAgree&&panelBalance&&leftAligned&&kpiShape&&compactToolbar&&tableScrollIsolated&&actionScrollIsolated&&narrowerLeft&&isChartRendered&&errors.length===0,{
      status,metricCount:metrics.length,chartCount:charts,oneRow,overflow,filterRemoved,chartValuesAgree,datesVisible,quarterRemoved,tablePresent,groupedActions,tableValuesAgree,panelBalance,leftAligned,kpiShape,compactToolbar,tableScrollIsolated,actionScrollIsolated,narrowerLeft,layout,
      isChartRendered,chartTotal,errors
    })
    if(viewport.name==='desktop-1440'&&status===200&&charts===5){
      let todayStatus=0,todayCharts=0,expressSame=false,rangeChanged=false
      try{
        const priorExpress=Number(metrics[1])
        await page.getByRole('link',{name:'Hôm nay',exact:true}).click()
        await page.waitForURL(/range=today/,{timeout:22000})
        todayStatus=(await page.goto(page.url(),{waitUntil:'domcontentloaded',timeout:30000}))?.status()??0
        todayCharts=await page.locator('.pd-chart-panel').count()
        const todayExpress=Number(await page.locator('.pd-metric strong').nth(1).textContent())
        expressSame=todayExpress===priorExpress
        rangeChanged=page.url().includes('range=today')
      }catch(e){errors.push('Date navigation: '+String(e.message??e).slice(0,150))}
      check('time-filter-and-express-snapshot',todayStatus===200&&todayCharts===5&&expressSame&&rangeChanged,{
        todayStatus,todayCharts,expressSame,rangeChanged,errors:errors.filter(e=>e.startsWith('Date navigation'))
      })
    }
    await context.close()
  }
}finally{await browser.close()}
fs.writeFileSync(folder+'/summary.json',JSON.stringify(checks,null,2))
const failures=checks.filter(c=>!c.pass)
console.log('PURCHASE_DASHBOARD_QA_SUMMARY '+JSON.stringify({passed:checks.length-failures.length,failed:failures.length}))
if(failures.length)process.exitCode=1
