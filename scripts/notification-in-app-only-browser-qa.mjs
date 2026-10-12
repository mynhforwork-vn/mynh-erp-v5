import fs from 'node:fs'
import { chromium } from 'playwright'
import { createBrowserClient } from '@supabase/ssr'

const BASE=process.env.PREVIEW_URL
const URL=process.env.SUPABASE_URL
const KEY=process.env.SUPABASE_KEY
if(!BASE||!URL||!KEY)throw new Error('Missing browser QA configuration')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const cookies=new Map()
const auth=createBrowserClient(URL,KEY,{cookies:{
  getAll(){return [...cookies.values()].map(c=>({name:c.name,value:c.value}))},
  setAll(items){items.forEach(c=>cookies.set(c.name,c))},
}})
const {error}=await auth.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
if(error)throw error

const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const out='qa-notification-artifacts'
fs.mkdirSync(out,{recursive:true})
const results=[]
try{
  const viewports=[
    {width:320,height:568},{width:390,height:844},{width:768,height:1024},
    {width:1440,height:900},{width:1920,height:1080},
  ]
  for(const view of viewports){
    const ctx=await browser.newContext({viewport:view})
    await ctx.addCookies([...cookies.values()].map(c=>({
      name:c.name,value:c.value,url:BASE,httpOnly:Boolean(c.options?.httpOnly),
      secure:c.options?.secure!==false,
      sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
    })))
    const page=await ctx.newPage()
    const errors=[]
    page.on('pageerror',e=>errors.push('page:'+String(e.message)))
    page.on('response',r=>{if(r.status()>=500)errors.push('http:'+r.status()+':'+r.url().split('?')[0])})
    const response=await page.goto(BASE+'/settings?section=notifications',{waitUntil:'domcontentloaded',timeout:35000})
    await page.locator('.notification-in-app-only-v1').waitFor({state:'visible',timeout:25000})
    await page.waitForLoadState('load',{timeout:35000})
    const info=await page.evaluate(()=>{
      const area=document.querySelector('.notification-in-app-only-v1')
      const scroll=area?.querySelector('.notification-rule-scroll-v9')
      const table=area?.querySelector('.notification-rule-table-v9')
      const rows=[...area?.querySelectorAll('form.notification-rule-row-v9')||[]]
      const texts=(area?.textContent||'').toLowerCase()
      const cols=rows[0]?getComputedStyle(rows[0]).gridTemplateColumns.split(' ').length:0
      return {
        rows:rows.length,
        noTelegram:!texts.includes('telegram')&&!texts.includes('bot token')&&!texts.includes('chat id'),
        noTelegramInput:!area?.querySelector('[name="telegram_enabled"],[name="bot_token"],[name="chat_id"]'),
        hasInApp:rows.every(r=>Boolean(r.querySelector('[name="in_app_enabled"]'))),
        hasAlert:rows.every(r=>Boolean(r.querySelector('[name="enabled"]'))),
        hasBatch:rows.every(r=>Boolean(r.querySelector('[name="batch_window_minutes"]'))),
        fits:!!scroll&&!!table&&table.getBoundingClientRect().width<=scroll.getBoundingClientRect().width+5,
        columnCount:cols,
        bodyOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+6,
      }
    })
    const passed=Boolean(response?.ok())&&info.rows===5&&info.noTelegram&&info.noTelegramInput
      &&info.hasInApp&&info.hasAlert&&info.hasBatch&&info.fits
      &&info.columnCount===(view.width<=1100?2:5)&&!info.bodyOverflow
      &&errors.length===0
    results.push({width:view.width,passed,response:response?.status(),...info,errors})
    console.log((passed?'PASS ':'FAIL ')+view.width+' in-app-only notification settings '+JSON.stringify({status:response?.status(),...info,errors}))
    await page.screenshot({path:out+'/settings-'+view.width+'.png',fullPage:true})
    await ctx.close()
  }
}finally{await browser.close()}
fs.writeFileSync(out+'/summary.json',JSON.stringify(results,null,2))
if(results.some(r=>!r.passed))process.exit(2)
console.log('NOTIFICATION_BROWSER_QA '+JSON.stringify({passed:results.length,failed:0}))
