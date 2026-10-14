/**
 * Read-only browser regression: Dashboard date bar is the shared reference
 * for Đơn nhập and Cảnh báo vận chuyển. Verifies 7 responsive widths,
 * quick/custom links, preserved filters and no document reload.
 */
import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const base=process.env.PREVIEW_URL,url=process.env.SUPABASE_URL,key=process.env.SUPABASE_KEY
if(!base?.includes('preview-production-v227-baseline-20261013-mynh-erp-v5.mynh-forwork.workers.dev')||!url||!key)
  throw Error('Wrong sole Preview QA env')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const cookies=new Map()
const db=createBrowserClient(url,key,{cookies:{
  getAll:()=>[...cookies.values()].map(x=>({name:x.name,value:x.value})),
  setAll:xs=>xs.forEach(x=>cookies.set(x.name,x)),
}})
const {error}=await db.auth.setSession({
  access_token:session.access_token,refresh_token:session.refresh_token,
})
if(error)throw error
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const viewports=[
  {width:320,height:568},{width:390,height:844},{width:768,height:1024},
  {width:1024,height:768},{width:1280,height:800},{width:1440,height:900},
  {width:1920,height:1080},
]
const pages=[
  {path:'/purchase',extra:'',expected:''},
  {path:'/purchase/orders',extra:'&tracking=shipping',expected:'tracking=shipping'},
  {path:'/purchase/tracking',extra:'&status=OUT_FOR_DELIVERY',expected:'status=OUT_FOR_DELIVERY'},
]
let passed=0,failed=0
const check=(name,ok,details={})=>{
  const yes=!!ok
  console.log('PURCHASE_TIME_FILTER_QA '+JSON.stringify({name,pass:yes,...details}))
  if(yes)passed++;else failed++
}
try{
  for(const vp of viewports){
    const ctx=await browser.newContext({viewport:vp})
    await ctx.addCookies([...cookies.values()].map(c=>({
      name:c.name,value:c.value,url:base,httpOnly:!!c.options?.httpOnly,
      secure:c.options?.secure!==false,
      sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
    })))
    const page=await ctx.newPage()
    for(const target of pages){
      const address=target.path+'?range=all'+target.extra
      const response=await page.goto(base+address,{waitUntil:'domcontentloaded',timeout:45000})
      await page.locator('.pd-time-filter .pd-time-calendar input[type="date"]').first().waitFor({timeout:25000})
      // The stylesheet is shared with Dashboard: wait for the real grid, not
      // a temporarily unstyled SSR tree.
      await page.waitForFunction(()=>{
        const bar=document.querySelector('.pd-time-filter')
        return bar&&getComputedStyle(bar).display==='grid'
          &&bar.querySelectorAll('.pd-time-calendar input[type="date"]').length===2
      },null,{timeout:15000})
      const geometry=await page.locator('.pd-time-filter').evaluate(bar=>{
        const quick=bar.querySelector('.pd-time-quick')
        const calendar=bar.querySelector('.pd-time-calendar')
        const inputs=[...calendar.querySelectorAll('input[type="date"]')]
        const rect=bar.getBoundingClientRect()
        const ar=calendar.getBoundingClientRect()
        const apply=calendar.querySelector('button').getBoundingClientRect()
        return {
          grid:getComputedStyle(bar).display==='grid',
          options:[...quick.querySelectorAll('a')].map(x=>x.textContent?.trim()),
          selected:quick.querySelector('a[aria-current="page"]')?.textContent?.trim(),
          dateCount:inputs.length,
          dateWidths:inputs.map(x=>Math.round(x.getBoundingClientRect().width)),
          withinViewport:rect.left>=-3&&rect.right<=innerWidth+4
            &&ar.left>=-3&&apply.right<=innerWidth+4,
          quickScroll:/auto|scroll/.test(getComputedStyle(quick).overflowX),
        }
      })
      const labels=['Tất cả','Hôm nay','Tuần này','7 ngày','30 ngày','Tháng này','Năm nay']
      const ok=response?.status()===200&&geometry.grid
        &&labels.every(x=>geometry.options.includes(x))
        &&geometry.selected==='Tất cả'&&geometry.dateCount===2
        &&geometry.dateWidths.every(x=>x>=55)
        &&geometry.withinViewport&&geometry.quickScroll
      check(vp.width+' '+target.path+' Dashboard date filter parity',ok,{
        status:response?.status(),...geometry,
      })

      // Exercise both interactions on Desktop: same document and preserved
      // module filters, with no mutations or full document reload.
      if(vp.width!==1440)continue
      await page.evaluate(()=>{window.__mynhTimeFilterDocument='persist'})
      await page.locator('.pd-time-filter .pd-time-quick a').filter({hasText:'Tuần này'}).click()
      await page.waitForURL(u=>u.pathname===target.path&&u.searchParams.get('range')==='week',
        {timeout:25000})
      const afterQuick=await page.evaluate(()=>window.__mynhTimeFilterDocument==='persist')
      const quickUrl=new URL(page.url())
      check(target.path+' quick range without reload',afterQuick
        &&(!target.expected||quickUrl.search.includes(target.expected))
        &&await page.locator('.pd-time-option[aria-current="page"]').textContent()==='Tuần này',
        {url:quickUrl.pathname+quickUrl.search,afterQuick})

      const from=page.locator('.pd-time-calendar input[name="from"]')
      const to=page.locator('.pd-time-calendar input[name="to"]')
      await from.fill('2026-10-01')
      await to.fill('2026-10-10')
      await page.locator('.pd-time-calendar button[type="submit"]').click()
      await page.waitForURL(u=>u.pathname===target.path&&u.searchParams.get('range')==='custom'
        &&u.searchParams.get('from')==='2026-10-01'&&u.searchParams.get('to')==='2026-10-10',
        {timeout:25000})
      const afterCustom=await page.evaluate(()=>window.__mynhTimeFilterDocument==='persist')
      const customUrl=new URL(page.url())
      check(target.path+' custom dates without reload',afterCustom
        &&(!target.expected||customUrl.search.includes(target.expected)),{
        url:customUrl.pathname+customUrl.search,afterCustom,
      })
    }
    await ctx.close()
  }
}finally{await browser.close()}
console.log('PURCHASE_TIME_FILTER_QA_SUMMARY '+JSON.stringify({passed,failed}))
if(failed)process.exitCode=1
