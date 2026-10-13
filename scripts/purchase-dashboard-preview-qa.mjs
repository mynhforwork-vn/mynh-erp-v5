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
      chartTotal=[],isChartRendered=false,datesVisible=false,quarterRemoved=false,tablePresent=false,groupedActions=false,chartValuesAgree=false,tableValuesAgree=false;
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
      groupedActions=await page.locator('.pd-right-rail .pd-action-group').count()===6
        && await page.locator('.pd-left-rail .pd-action-group').count()===0
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
      isChartRendered=await page.locator('.pd-chart-bars .pd-chart-bar-track, .pd-chart-columns .pd-chart-column-space, .pd-chart-empty').count()>=5
      if(charts===5)await page.screenshot({path:folder+'/'+viewport.name+'.png',fullPage:false})
    }catch(e){errors.push(String(e.message??e).slice(0,260))}
    check(viewport.name,status===200&&!finalUrl.includes('/login')&&metrics.length===9&&charts===5&&
      filterRemoved&&oneRow&&!overflow&&chartValuesAgree&&datesVisible&&quarterRemoved&&tablePresent&&groupedActions&&tableValuesAgree&&isChartRendered&&errors.length===0,{
      status,metricCount:metrics.length,chartCount:charts,oneRow,overflow,filterRemoved,chartValuesAgree,datesVisible,quarterRemoved,tablePresent,groupedActions,tableValuesAgree,
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
