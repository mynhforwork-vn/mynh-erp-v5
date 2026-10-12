// Stage C: nonmutating finance filters + QR preview + timezone-unit contracts.
// The browser never sends data to VietQR or modifies payment settings.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'
import {financePeriodStart,withinFinancePeriod,vnDateKey} from '../lib/finance-period.ts'
import {buildVietQRUrl,buildTransferDescription} from '../lib/vietqr.ts'

const base=process.env.PREVIEW_URL,url=process.env.SUPABASE_URL,key=process.env.SUPABASE_KEY
assert.ok(base&&url&&key,'QA Preview required')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const results=[]
const check=(name,pass,meta={})=>{const x={name,pass:Boolean(pass),...meta};results.push(x);console.log('STAGE_C_FINANCE_QR_CHECK '+JSON.stringify(x))}
const fixed=new Date('2026-10-12T02:00:00.000Z')
check('VN today starts 00:00 +07',financePeriodStart('today',fixed)==='2026-10-11T17:00:00.000Z')
check('VN week starts Monday',financePeriodStart('week',fixed)==='2026-10-11T17:00:00.000Z')
check('VN month starts on first day',financePeriodStart('month',fixed)==='2026-09-30T17:00:00.000Z')
check('VN quarter start',financePeriodStart('quarter',fixed)==='2026-09-30T17:00:00.000Z')
check('VN 7-day range',financePeriodStart('7d',fixed)==='2026-10-05T17:00:00.000Z')
check('Before day boundary excluded',!withinFinancePeriod('2026-10-11T16:59:59.000Z',financePeriodStart('today',fixed)))
check('At VN day boundary included',withinFinancePeriod('2026-10-11T17:00:00.000Z',financePeriodStart('today',fixed)))
check('VN calendar date formatter',vnDateKey('2026-10-11T17:01:00.000Z')==='2026-10-12')
const cfg={bank_id:'970436',bank_name:'QA BANK',account_no:'0123456789',account_name:'QA USER',qr_template:'compact2'}
const ref=buildTransferDescription(null,'POS-26 / Hóa đơn #123')
const qr=buildVietQRUrl(cfg,123000,ref)
const parsed=new URL(qr)
check('VietQR points to official image host',parsed.protocol==='https:'&&parsed.hostname==='img.vietqr.io')
check('VietQR amount exact',parsed.searchParams.get('amount')==='123000')
check('VietQR description sanitization',parsed.searchParams.get('addInfo')===ref&&!/[#\/]/.test(ref))
check('VietQR zero amount omitted',!new URL(buildVietQRUrl(cfg,0,ref)).searchParams.has('amount'))
check('Missing bank data cannot produce QR',buildVietQRUrl({...cfg,bank_id:''},123000,ref)==='')
const jar=new Map(),auth=createBrowserClient(url,key,{cookies:{
  getAll:()=>[...jar.values()].map(c=>({name:c.name,value:c.value})),
  setAll:cs=>cs.forEach(c=>jar.set(c.name,c))
}})
const {error}=await auth.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
if(error)throw error
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const ctx=await browser.newContext({viewport:{width:1440,height:900}})
await ctx.addCookies([...jar.values()].map(c=>({name:c.name,value:c.value,url:base,httpOnly:Boolean(c.options?.httpOnly),
  secure:c.options?.secure!==false,sameSite:'Lax'})))
// Avoid transmitting current bank account details to any external image provider during QA.
await ctx.route('https://img.vietqr.io/**',route=>route.abort())
const page=await ctx.newPage()
async function go(path){
  let r
  try{r=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:25000})}
  catch(e){check('Route '+path,false,{error:String(e.message).slice(0,160)});return false}
  const status=r?.status()||0,ray=r?.headers()?.['cf-ray']||null
  if(status!==200){
    const b=await r.text().catch(()=> '')
    const marker=/1102|exceeded resource limits/i.test(b)?'CF_WORKER_1102':/Application error/i.test(b)?'NEXT_ERROR':'unknown'
    check('Route '+path,false,{status,cf_ray:ray,error_marker:marker})
    console.log('STAGE_C_PREVIEW_DIAGNOSTIC '+JSON.stringify({path,status,cf_ray:ray,error_marker:marker}))
    return false
  }
  check('Route '+path,true,{status})
  return true
}
try{
  if(await go('/settings?section=payments')){
    const form=page.locator('form.payment-form-panel-v11')
    const image=page.locator('.payment-preview-panel-v11 img[alt="VietQR xem trước"]')
    check('Payment config form and preview available',await form.count()===1&&await image.count()===1)
    if(await image.count()){
      const attr=await image.getAttribute('src')
      // No bank account identifier is logged or included in artifacts.
      const u=new URL(attr)
      check('Payment preview encodes sample 123000 VND',u.hostname==='img.vietqr.io'&&u.searchParams.get('amount')==='123000')
    }
    check('Printing template settings tab present',await page.getByRole('button',{name:'Mẫu hóa đơn / phiếu thu'}).count()>0)
  }
  if(await go('/finance/cashflow')){
    const bars=page.locator('.finance-period-tabs.finance-period-controls')
    for(const label of ['Toàn thời gian','Hôm nay','7 ngày','Tháng này','Tùy chọn']){
      await bars.getByRole('button',{name:label,exact:true}).click()
      const active=await bars.getByRole('button',{name:label,exact:true}).getAttribute('class')
      check('Finance period '+label,active?.includes('active-preview'))
    }
    const dates=bars.locator('input[type="date"]')
    check('Finance custom range has two date inputs',await dates.count()===2)
    if(await dates.count()===2){
      await dates.nth(0).fill('2026-10-01')
      await dates.nth(1).fill('2026-10-12')
      check('Finance custom dates preserve values',
        await dates.nth(0).inputValue()==='2026-10-01'&&await dates.nth(1).inputValue()==='2026-10-12')
    }
    const selects=page.locator('.finance-toolbar select')
    check('Finance Thu Chi category/source/method/status filters present',await selects.count()>=5)
    const type=selects.first()
    await type.selectOption('INCOME')
    check('Finance INCOME filter selectable',await type.inputValue()==='INCOME')
    await type.selectOption('EXPENSE')
    check('Finance EXPENSE filter selectable',await type.inputValue()==='EXPENSE')
  }
  if(await go('/finance/reports?period=month')){
    const links=page.getByRole('navigation',{name:'Khoảng thời gian báo cáo'})
    check('Finance report period navigation present',await links.count()===1)
    check('Finance report month tab has selected state',
      await links.getByRole('link',{name:'Tháng này',exact:true}).count()===1)
  }
}finally{await browser.close()}
const bad=results.filter(x=>!x.pass)
fs.mkdirSync('qa-stage-c-artifacts',{recursive:true})
fs.writeFileSync('qa-stage-c-artifacts/finance-qr.json',JSON.stringify({checks:results.length,passed:results.length-bad.length,failed:bad.length,results},null,2))
console.log('STAGE_C_FINANCE_QR_SUMMARY '+JSON.stringify({checks:results.length,passed:results.length-bad.length,failed:bad.length}))
if(bad.length)process.exitCode=1
