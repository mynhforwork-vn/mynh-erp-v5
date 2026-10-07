import { chromium } from 'playwright'
import { createBrowserClient } from '@supabase/ssr'
import fs from 'node:fs'

const PREVIEW_URL=process.env.PREVIEW_URL
const SUPABASE_URL=process.env.SUPABASE_URL
const SUPABASE_KEY=process.env.SUPABASE_KEY
if(!PREVIEW_URL||!SUPABASE_URL||!SUPABASE_KEY)throw new Error('Missing QA environment')
if(!fs.existsSync('qa-session.json'))throw new Error('Missing qa-session.json')

const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const cookieMap=new Map()
const cookieClient=createBrowserClient(SUPABASE_URL,SUPABASE_KEY,{
  cookies:{
    getAll(){return [...cookieMap.values()].map(x=>({name:x.name,value:x.value}))},
    setAll(items){for(const item of items)cookieMap.set(item.name,item)},
  },
})
const {error}=await cookieClient.auth.setSession({
  access_token:session.access_token,
  refresh_token:session.refresh_token,
})
if(error)throw error

const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const context=await browser.newContext({viewport:{width:1440,height:900}})
await context.addCookies([...cookieMap.values()].map(c=>({
  name:c.name,value:c.value,url:PREVIEW_URL,
  httpOnly:Boolean(c.options?.httpOnly),secure:c.options?.secure!==false,
  sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
})))
const page=await context.newPage()
const results=[]

await page.goto(PREVIEW_URL+'/purchase/tracking?range=all',{waitUntil:'domcontentloaded',timeout:30000})
await page.waitForTimeout(700)

function rec(name,pass,detail={}){results.push({name,pass:Boolean(pass),...detail})}
async function read(){
  return page.evaluate(()=>{
    const shell=document.querySelector('.brand-shell-v1')
    const sidebar=document.querySelector('.brand-shell-v1>.sidebar')
    const nav=sidebar?.querySelector('.nav')
    const foot=sidebar?.querySelector('.sidebar-foot-v2')
    const account=sidebar?.querySelector('.sidebar-account-trigger')
    const avatar=sidebar?.querySelector('.sidebar-user-avatar')
    const copy=sidebar?.querySelector('.sidebar-user-copy')
    const alert=sidebar?.querySelector('.sidebar-alert-trigger')
    const active=nav?.querySelector('a.active')
    if(!shell||!sidebar||!nav||!foot||!account||!avatar||!alert)return null
    const r=x=>x.getBoundingClientRect()
    const sr=r(sidebar),fr=r(foot),ar=r(account),avr=r(avatar),br=r(alert),nr=r(nav),act=active?r(active):null
    return {
      collapsed:shell.classList.contains('desktop-sidebar-collapsed'),
      sidebar:{left:sr.left,right:sr.right,top:sr.top,bottom:sr.bottom,width:sr.width,height:sr.height},
      nav:{top:nr.top,bottom:nr.bottom,height:nr.height,scrollHeight:nav.scrollHeight,clientHeight:nav.clientHeight},
      foot:{left:fr.left,right:fr.right,top:fr.top,bottom:fr.bottom,width:fr.width,height:fr.height},
      account:{left:ar.left,right:ar.right,top:ar.top,bottom:ar.bottom,width:ar.width,height:ar.height},
      avatar:{left:avr.left,right:avr.right,top:avr.top,bottom:avr.bottom,width:avr.width,height:avr.height},
      bell:{left:br.left,right:br.right,top:br.top,bottom:br.bottom,width:br.width,height:br.height},
      copyDisplay:copy?getComputedStyle(copy).display:null,
      activeVisible:!act||(act.top>=nr.top-1&&act.bottom<=nr.bottom+1),
      bodyScrollX:document.documentElement.scrollWidth>document.documentElement.clientWidth,
      viewportH:innerHeight,
    }
  })
}

let m=await read()
rec('Sidebar mở rộng đúng width',m&&m.sidebar.width>=215&&m.sidebar.width<=235,m??{})
rec('Sidebar mở rộng footer một hàng',m&&Math.abs(m.account.top-m.bell.top)<=4&&m.account.height<=40&&m.bell.height<=36,m??{})
rec('Sidebar mở rộng copy hiển thị',m&&m.copyDisplay!=='none',m??{})
rec('Sidebar mở rộng không tràn ngang',m&&!m.bodyScrollX,m??{})

const toggle=page.locator('.sidebar-collapse-toggle').first()
if(!await toggle.count())throw new Error('Missing sidebar collapse toggle')
await toggle.click()
await page.waitForTimeout(350)

m=await read()
rec('Sidebar thu gọn đúng width',m&&m.sidebar.width>=66&&m.sidebar.width<=78,m??{})
rec('Sidebar thu gọn avatar + chuông cùng hàng',m&&Math.abs(m.avatar.top-m.bell.top)<=5&&m.account.width<=34&&m.bell.width<=34,m??{})
rec('Sidebar thu gọn copy ẩn',m&&m.copyDisplay==='none',m??{})
rec('Sidebar thu gọn footer gọn',m&&m.foot.height<=48&&m.foot.width<=78,m??{})
rec('Sidebar thu gọn active menu còn nhìn thấy',m&&m.activeVisible,m??{})
rec('Sidebar thu gọn không tràn ngang',m&&!m.bodyScrollX,m??{})
await page.screenshot({path:'qa-desktop-slidebar-artifacts/sidebar-collapsed.png',fullPage:false})

await toggle.click()
await page.waitForTimeout(350)
m=await read()
rec('Sidebar mở lại đúng width',m&&m.sidebar.width>=215&&m.sidebar.width<=235,m??{})
rec('Sidebar mở lại active menu còn nhìn thấy',m&&m.activeVisible,m??{})
await page.screenshot({path:'qa-desktop-slidebar-artifacts/sidebar-expanded.png',fullPage:false})

const pass=results.every(x=>x.pass)
console.log(JSON.stringify({preview:PREVIEW_URL,pass,results},null,2))
await browser.close()
if(!pass)process.exit(1)
