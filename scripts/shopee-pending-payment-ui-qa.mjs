import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'
import {sample} from './fixtures/shopee-pending-payment-sample.mjs'
const base=process.env.PREVIEW_URL,url=process.env.SUPABASE_URL,key=process.env.SUPABASE_KEY
if(!base?.includes('preview-production-v227-baseline-20261013-mynh-erp-v5.mynh-forwork.workers.dev')||!url||!key)throw Error('Use sole Preview only')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const cookies=new Map()
const auth=createBrowserClient(url,key,{cookies:{getAll:()=>[...cookies.values()].map(x=>({name:x.name,value:x.value})),setAll:xs=>xs.forEach(x=>cookies.set(x.name,x))}})
const {error}=await auth.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
if(error)throw error
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
fs.mkdirSync('qa-shopee-pending-artifacts',{recursive:true})
let passed=0,failed=0
const check=(name,ok,detail={})=>{console.log('SHOPEE_PENDING_UI '+JSON.stringify({name,pass:!!ok,...detail}));if(ok)passed++;else failed++}
try{
for(const vp of [{width:360,height:800},{width:768,height:1024},{width:1440,height:900}]){
 const ctx=await browser.newContext({viewport:vp})
 await ctx.addCookies([...cookies.values()].map(c=>({name:c.name,value:c.value,url:base,
   httpOnly:!!c.options?.httpOnly,secure:c.options?.secure!==false,
   sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax'})))
 const page=await ctx.newPage()
 await page.goto(base+'/purchase/orders?range=all&mode=create',{waitUntil:'domcontentloaded',timeout:45000})
 const form=page.locator('form.order-editor[data-shopee-recognizer="pending-review-v3"]')
 // Sole Preview can still serve the previous bundle while Git-connected
 // Cloudflare Builds compiles the target SHA. Do not run UI QA against it.
 const input=form.locator('.order-text-recognizer textarea')
 let deployed=false
 let lastEvidence={}
 for(let attempt=0;attempt<35;attempt++){
   if(await form.count()===1&&await input.count()===1){deployed=true;break}
   lastEvidence={url:page.url(),
     orderForms:await page.locator('form.order-editor').count(),
     createModeInputs:await page.locator('form.order-editor .order-text-recognizer textarea').count(),
     markerForms:await form.count()}
   await page.waitForTimeout(5000)
   // Navigate back to the explicit create URL, not a stale edited order.
   await page.goto(base+'/purchase/orders?range=all&mode=create',
     {waitUntil:'domcontentloaded',timeout:45000})
 }
 check(vp.width+' correct deployed CREATE UI revision',deployed,lastEvidence)
 if(!deployed)throw Error('New Shopee create recognizer not available '+JSON.stringify(lastEvidence))
 await input.waitFor({state:'visible',timeout:12000})
 const action=form.getByRole('button',{name:'Nhận diện đơn'})
 // SSR can paint the form before React has hydrated its controlled textarea.
 // Retry typing until React state actually enables the recognizer button.
 let interactive=false
 for(let n=0;n<9;n++){
   await input.fill('')
   await input.fill(sample)
   if(await action.isEnabled()){interactive=true;break}
   await page.waitForTimeout(900)
 }
 check(vp.width+' hydrated recognizer enables button',interactive)
 if(!interactive)throw Error('Shopee recognizer remained disabled after hydration')
 await action.click()
 await page.waitForFunction(()=>document.querySelectorAll('form.order-editor input[name="item_product_name"]').length===2,null,{timeout:16000})
 const values=async(name)=>form.locator('[name="'+name+'"]').evaluateAll(nodes=>nodes.map(x=>x.value))
 check(vp.width+' order code',(await values('shopee_order_id'))[0]==='261013TESTQA01')
 check(vp.width+' recipient fields filled exactly',
   (await values('recipient_name'))[0]==='Nguyễn Thị Mẫu'
   &&(await values('recipient_phone'))[0]==='0900123456'
   &&(await values('recipient_address'))[0]==='Số 10, Đường Mẫu, Phường Cửa Nam, Thành phố Hà Nội')
 check(vp.width+' no duplicate address preview',
   await form.locator('.shopee-recipient-preview').count()===0)
 check(vp.width+' original recipient address editable',
   await form.locator('textarea[name="recipient_address"]').count()===1
   &&await form.locator('textarea[name="recipient_address"]').isEditable())
 check(vp.width+' product prices',JSON.stringify(await values('item_original_price'))==='["19800","80700"]')
 check(vp.width+' product variants',JSON.stringify(await values('item_variant'))===JSON.stringify(['1 Thanh','Đậu Nành 1 Lít,1 Chai']))
 check(vp.width+' voucher tags',JSON.stringify(await values('voucher_tag'))===JSON.stringify(['Phí vận chuyển','Shopee']))
 check(vp.width+' COD unpaid',(await values('payment_status'))[0]==='UNPAID'&&(await values('cod'))[0]==='500'&&(await values('tracking_number'))[0]==='')
 check(vp.width+' Shopee pending review',(await form.locator('.derived-order-state').innerText()).includes('Chờ Shopee xác nhận'))
 check(vp.width+' missing order date explicitly flagged',(await values('order_date'))[0]===''&&(await form.locator('.order-text-recognizer-actions').innerText()).includes('Chưa có ngày đặt'))
 check(vp.width+' payable 500',(await form.locator('.order-value-summary strong').innerText()).includes('500'))
 check(vp.width+' no document overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+6))
 if(vp.width===1440)await page.screenshot({path:'qa-shopee-pending-artifacts/pending-review-form-1440.png',fullPage:false})
 await ctx.close()
}
}finally{await browser.close()}
console.log('SHOPEE_PENDING_UI_QA_SUMMARY '+JSON.stringify({passed,failed}))
if(failed)process.exitCode=1
