import fs from 'node:fs'
import {randomUUID} from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

const PREVIEW_URL=process.env.PREVIEW_URL
const SUPABASE_URL=process.env.SUPABASE_URL
const SUPABASE_KEY=process.env.SUPABASE_KEY
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!PREVIEW_URL||!SUPABASE_URL||!SUPABASE_KEY||!SERVICE_KEY)throw new Error('Missing RBAC QA environment')
if(!fs.existsSync('qa-session.json'))throw new Error('Missing qa-session.json')
const qa=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const f=qa.fixtures
if(!qa.user_id||!qa.access_token||!qa.refresh_token||!f)throw new Error('RBAC QA requires completed fixture + auth setup')

const outDir='qa-browser-artifacts'
fs.mkdirSync(outDir,{recursive:true})
const summary={routes:[],ui:[],backend:[],sourceGuards:[],consoleErrors:[],pageErrors:[],network5xx:[],failures:[]}
function record(bucket,name,pass,detail={}){
  const row={name,pass:Boolean(pass),...detail}
  summary[bucket].push(row)
  console.log('QA_RBAC_'+bucket.toUpperCase()+' '+JSON.stringify(row))
  if(!row.pass)summary.failures.push(bucket+': '+name)
}
function expectDenied(res,needle){
  return !res.ok&&String(res.text??'').toLowerCase().includes(String(needle).toLowerCase())
}
function expectAllowedPastRole(res,roleNeedle){
  return !String(res.text??'').toLowerCase().includes(String(roleNeedle).toLowerCase())
}

const adminClient=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
let refreshToken=qa.refresh_token

async function setRole(role){
  const {error}=await adminClient.auth.admin.updateUserById(qa.user_id,{app_metadata:{role}})
  if(error)throw new Error('Unable to set QA role '+role+': '+error.message)

  const client=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data,error:sessionError}=await client.auth.setSession({access_token:qa.access_token,refresh_token:refreshToken})
  if(sessionError)throw new Error('Unable to seed QA session '+role+': '+sessionError.message)
  const {data:refreshed,error:refreshError}=await client.auth.refreshSession()
  if(refreshError||!refreshed.session)throw new Error('Unable to refresh QA role '+role+': '+(refreshError?.message??'no session'))
  refreshToken=refreshed.session.refresh_token
  qa.access_token=refreshed.session.access_token
  qa.refresh_token=refreshed.session.refresh_token

  const payload=JSON.parse(Buffer.from(refreshed.session.access_token.split('.')[1],'base64url').toString('utf8'))
  if(String(payload?.app_metadata?.role)!==role)throw new Error('JWT role refresh mismatch expected='+role+' actual='+String(payload?.app_metadata?.role))
  console.log('QA_RBAC_ROLE_READY '+role)
  return refreshed.session
}

async function rest(session,path,{method='GET',body,prefer='return=representation'}={}){
  const res=await fetch(SUPABASE_URL+path,{
    method,
    headers:{
      'content-type':'application/json',
      apikey:SUPABASE_KEY,
      authorization:'Bearer '+session.access_token,
      Prefer:prefer,
    },
    body:body===undefined?undefined:JSON.stringify(body),
  })
  const text=await res.text()
  let json=null;try{json=JSON.parse(text)}catch{}
  return {ok:res.ok,status:res.status,text,json}
}
async function adminRest(path){
  const res=await fetch(SUPABASE_URL+path,{headers:{apikey:SERVICE_KEY,authorization:'Bearer '+SERVICE_KEY}})
  const text=await res.text();let json=null;try{json=JSON.parse(text)}catch{}
  if(!res.ok)throw new Error('Admin read failed '+path+' '+res.status+' '+text.slice(0,240))
  return json
}
async function edge(session,body){
  const res=await fetch(SUPABASE_URL+'/functions/v1/admin-system-users',{
    method:'POST',
    headers:{'content-type':'application/json',apikey:SUPABASE_KEY,authorization:'Bearer '+session.access_token},
    body:JSON.stringify(body),
  })
  const text=await res.text()
  return {ok:res.ok,status:res.status,text}
}

async function browserFor(session,role){
  const cookieMap=new Map()
  const cookieClient=createBrowserClient(SUPABASE_URL,SUPABASE_KEY,{
    cookies:{
      getAll(){return [...cookieMap.values()].map(x=>({name:x.name,value:x.value}))},
      setAll(items){for(const item of items)cookieMap.set(item.name,item)},
    },
  })
  const {error}=await cookieClient.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
  if(error)throw new Error('Cookie session failed '+role+': '+error.message)

  const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
  const context=await browser.newContext({viewport:{width:1440,height:900}})
  await context.addCookies([...cookieMap.values()].map(c=>({
    name:c.name,value:c.value,url:PREVIEW_URL,
    httpOnly:Boolean(c.options?.httpOnly),secure:c.options?.secure!==false,
    sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
  })))
  const page=await context.newPage()
  page.on('console',m=>{if(m.type()==='error')summary.consoleErrors.push({role,url:page.url(),text:m.text()})})
  page.on('pageerror',e=>summary.pageErrors.push({role,url:page.url(),text:String(e)}))
  page.on('response',r=>{if(r.status()>=500)summary.network5xx.push({role,url:r.url(),status:r.status(),resourceType:r.request().resourceType()})})
  return {browser,page}
}
async function go(page,role,path){
  let status=0
  let login=false
  let serverError=false
  let finalUrl=''
  let navigationError=''
  const target=PREVIEW_URL+path
  const retryDelay=[500,1500,3000,5000,7000]

  for(let attempt=1;attempt<=5;attempt++){
    try{
      const res=await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000})
      await page.waitForTimeout(attempt===1?500:1000)
      status=res?.status()??0
      finalUrl=page.url()
      login=/\/login(?:\?|$)/.test(new URL(finalUrl).pathname)
      const body=(await page.locator('body').innerText().catch(()=>'' )).slice(0,4000)
      serverError=/Application error|Internal Server Error|Server Components render/i.test(body)
      navigationError=''

      if(status>0&&status<500&&!login&&!serverError){
        summary.network5xx=summary.network5xx.filter(x=>!(x.role===role&&x.resourceType==='document'&&x.url===target))
        record('routes',role+' '+path,true,{status,finalUrl,attempt})
        return
      }
    }catch(error){
      navigationError=error instanceof Error?error.message:String(error)
      finalUrl=page.url()
    }

    if(attempt<5)await page.waitForTimeout(retryDelay[attempt-1])
  }

  record('routes',role+' '+path,false,{status,finalUrl,login,serverError,navigationError})
}

const routes=[
  '/','/purchase','/purchase/accounts','/purchase/orders?range=all','/purchase/tracking?range=all',
  '/warehouse','/warehouse/receive','/warehouse/inventory','/warehouse/history',
  '/sales','/sales/pos','/sales/history','/sales/customers','/sales/debt',
  '/finance','/finance/cashflow','/finance/shipper-payments','/finance/reports',
  '/settings','/account',
]

function auditSourceGuards(){
  const files=['lib/actions/core.ts','lib/actions/sales.ts','lib/actions/warehouse.ts','lib/actions/finance.ts']
  const delegateAllow=new Map([['createSalesCustomer','createPOSCustomer']])
  const adminOnly=new Set([
    'deleteOrderPermanent','deleteOrdersBulkPermanent','purgeEligibleArchivedOrders','deleteERPUserPermanent',
    'updateSystemUserRole','sendSystemUserPasswordReset','resetERPSystemData','createSystemUserAccount',
    'setSystemUserTemporaryPassword','deleteSystemUserAccount',
    'saveTrackingProviderConfig','saveTrackingRuntimeSettings','saveTrackingRule','saveCarrierStatusMapping','testTrackingConnection',
    'saveAlertRuleConfig','saveTelegramAlertSettings','saveTelegramAlertDestination','deleteTelegramAlertDestination','testTelegramConnection',
  ])
  for(const path of files){
    const src=fs.readFileSync(path,'utf8')
    const matches=[...src.matchAll(/export async function\s+([A-Za-z0-9_]+)/g)]
    for(let i=0;i<matches.length;i++){
      const name=matches[i][1]
      const start=matches[i].index
      const end=i+1<matches.length?matches[i+1].index:src.length
      const seg=src.slice(start,end)
      const guarded=/await\s+actor\s*\(\s*\)/.test(seg)
      const delegated=delegateAllow.has(name)&&seg.includes('await '+delegateAllow.get(name)+'(')
      const pass=guarded||delegated
      record('sourceGuards','server action '+name+' has operator/admin guard',pass,{file:path,direct:guarded,delegated:delegated||false})
      if(adminOnly.has(name))record('sourceGuards','admin action '+name+' calls requireAdmin',/requireAdmin\s*\(\s*role\s*\)/.test(seg),{file:path})
    }
  }
}

auditSourceGuards()

const originalUser=(await adminRest('/rest/v1/erp_users?select=id,note&id=eq.'+encodeURIComponent(f.erp_user_id)))[0]
const originalNote=String(originalUser?.note??'')

for(const role of ['admin','operator','viewer']){
  const session=await setRole(role)
  const {browser,page}=await browserFor(session,role)
  try{
    for(const path of routes)await go(page,role,path)

    await go(page,role,'/settings')
    const inAppAlertBell=await page.locator('.sidebar-alert-trigger').count()>0
    record('ui',role+' In-app alert bell visibility',inAppAlertBell,{inAppAlertBell})
    const accountMenu=await page.locator('.sidebar-account-trigger').count()>0
    record('ui',role+' compact account menu visibility',accountMenu,{accountMenu})

    await go(page,role,'/settings?section=access')
    const accessVisible=await page.getByRole('link',{name:'Tài khoản & quyền'}).count()>0
    const accessWorkspace=await page.locator('.admin-access-settings-v10').count()>0
    record('ui',role+' settings access visibility',role==='admin'?(accessVisible&&accessWorkspace):(!accessVisible&&!accessWorkspace),{accessVisible,accessWorkspace})
    if(role==='admin'){
      const accessHasSystemReset=await page.getByText('Xóa dữ liệu hệ thống',{exact:true}).count()>0
      record('ui','Admin reset removed from Access',!accessHasSystemReset,{accessHasSystemReset})
    }

    await go(page,role,'/settings?section=data-management')
    const dataWorkspace=await page.locator('.data-management-settings-v10').count()>0
    const resetTab=page.locator('.data-management-settings-v10 .settings-subtabs-v6').getByRole('button',{name:/^Reset hệ thống/}).first()
    const resetVisible=await resetTab.count()>0
    record('ui',role+' data reset visibility',role==='admin'?(dataWorkspace&&resetVisible):(dataWorkspace&&!resetVisible),{dataWorkspace,resetVisible})


    // SAFE reset QA: never supply valid reset confirmation on a shared Supabase DB.
    if(role==='admin'){
      await go(page,role,'/settings?section=data-management')
      const reset=page.locator('.data-management-settings-v10').getByRole('button',{name:/^Reset hệ thống/}).first()
      await reset.click()
      for(const [scope,label,expected] of [
        ['DATA','Xóa dữ liệu vận hành','RESET DU LIEU'],
        ['ALL','Xóa toàn bộ dữ liệu + cài đặt','RESET TOAN HE THONG'],
      ]){
        await page.getByRole('button',{name:label}).click()
        const dialog=page.getByRole('dialog').last()
        const exists=await dialog.count()>0
        const instruction=exists?await dialog.innerText():''
        if(exists){
          await dialog.locator('input').fill('QA_SAI_XAC_NHAN')
          await dialog.getByRole('button',{name:'Xác nhận xóa'}).click()
        }
        const rejects=await page.getByText('Chuỗi xác nhận chưa đúng.').count()>0
        record('ui','Admin '+scope+' reset rejects incorrect confirmation',exists&&instruction.includes(expected)&&rejects)
        if(exists)await dialog.getByRole('button',{name:'Hủy'}).click()
        const backend=await rest(session,'/rest/v1/rpc/admin_reset_erp_data',{method:'POST',body:{p_scope:scope,p_confirm:'QA_SAI_XAC_NHAN'}})
        record('backend','Admin '+scope+' reset RPC refuses invalid confirmation',expectDenied(backend,'Chuỗi xác nhận chưa đúng'),{status:backend.status})
      }
      const canary=(await adminRest('/rest/v1/orders?select=id&id=eq.'+encodeURIComponent(f.hub_order_id)))[0]
      record('backend','Safe reset probes preserve unrelated QA order',String(canary?.id)===String(f.hub_order_id))
    }

    await go(page,role,'/settings?section=shipping')
    const carrierInputs=page.locator('.carrier-config-row input:not([type="hidden"]), .carrier-config-row select')
    const carrierEditable=await carrierInputs.count()>0&&!(await carrierInputs.first().isDisabled())
    const carrierSave=await page.locator('.carrier-config-row').getByRole('button',{name:/Lưu|Thêm ĐVVC/}).count()>0
    record('ui',role+' carrier settings edit state',role==='viewer'?(!carrierEditable&&!carrierSave):(carrierEditable&&carrierSave),{carrierEditable,carrierSave})

    await go(page,role,'/settings?section=payments')
    const bankInput=page.locator('.payment-form-panel-v11 input[name="account_no"]').first()
    const bankEditable=await bankInput.count()>0&&!(await bankInput.isDisabled())
    const bankSave=await page.locator('.payment-form-panel-v11').getByRole('button',{name:'Lưu cấu hình'}).count()>0
    record('ui',role+' payment settings edit state',role==='viewer'?(!bankEditable&&!bankSave):(bankEditable&&bankSave),{bankEditable,bankSave})

    const templateTab=page.locator('.payment-settings-v12 .settings-subtabs-v6').getByRole('button',{name:/^Mẫu hóa đơn/}).first()
    if(await templateTab.count())await templateTab.click()
    const templateBrand=page.locator('.payment-template-form-v12 input').first()
    const templateEditable=await templateBrand.count()>0&&!(await templateBrand.isDisabled())
    const templateSave=await page.locator('.payment-template-form-v12').getByRole('button',{name:'Lưu mẫu'}).count()>0
    record('ui',role+' print template edit state',role==='viewer'?(!templateEditable&&!templateSave):(templateEditable&&templateSave),{templateEditable,templateSave})

    await go(page,role,'/settings?section=tracking')
    const trackingTabVisible=await page.locator('.settings-page-tabs-v3').getByRole('link',{name:'Tracking',exact:true}).count()>0
    const trackingWorkspace=await page.locator('.tracking-settings-v9').count()>0
    const quietStart=page.locator('.tracking-settings-v9 input[name="quiet_start"]').first()
    const trackingEditable=await quietStart.count()>0&&!(await quietStart.isDisabled())
    const trackingSave=await page.locator('.tracking-settings-v9').getByRole('button',{name:'Lưu',exact:true}).count()>0
    if(role==='viewer'){
      record('ui',role+' Tracking visibility',!trackingTabVisible&&!trackingWorkspace,{trackingTabVisible,trackingWorkspace})
    }else if(role==='admin'){
      record('ui',role+' Tracking visibility',trackingTabVisible&&trackingWorkspace,{trackingTabVisible,trackingWorkspace})
      record('ui',role+' Tracking edit state',trackingEditable&&trackingSave,{trackingEditable,trackingSave})
    }else{
      record('ui',role+' Tracking visibility',trackingTabVisible&&trackingWorkspace,{trackingTabVisible,trackingWorkspace})
      record('ui',role+' Tracking read-only state',!trackingEditable&&!trackingSave,{trackingEditable,trackingSave})
    }

    await go(page,role,'/settings?section=notifications')
    const telegramTabVisible=await page.locator('.settings-page-tabs-v3').getByRole('link',{name:'Thông báo',exact:true}).count()>0
    const telegramWorkspace=await page.locator('.tracking-telegram-settings').count()>0
    const telegramSubtab=page.locator('.notification-settings-v9 .settings-subtabs-v6').getByRole('button',{name:/^Kết nối Telegram/}).first()
    if(await telegramSubtab.count())await telegramSubtab.click()
    const telegramToken=page.locator('.telegram-settings-grid-v9 input[name="bot_token"]').first()
    const telegramEditable=await telegramToken.count()>0&&!(await telegramToken.isDisabled())
    const telegramSave=await page.locator('.telegram-settings-grid-v9').getByRole('button',{name:'Lưu Telegram'}).count()>0
    if(role==='viewer'){
      record('ui',role+' Notification visibility',!telegramTabVisible&&!telegramWorkspace,{telegramTabVisible,telegramWorkspace})
    }else if(role==='admin'){
      record('ui',role+' Alerts visibility',telegramTabVisible&&telegramWorkspace,{telegramTabVisible,telegramWorkspace})
      record('ui',role+' Notification edit state',telegramEditable&&telegramSave,{telegramEditable,telegramSave})
    }else{
      record('ui',role+' Alerts visibility',telegramTabVisible&&telegramWorkspace,{telegramTabVisible,telegramWorkspace})
      record('ui',role+' Notification read-only state',!telegramEditable&&!telegramSave,{telegramEditable,telegramSave})
    }

    await go(page,role,'/settings?section=data-management')
    // The permanent purge control is rendered only after opening the Archive subtab.
    // Checking from the default Overview tab produces a false-negative for Admin.
    const archiveTab=page.locator('.data-management-settings-v10 .settings-subtabs-v6')
      .getByRole('button',{name:/^Lưu trữ & dọn dẹp/}).first()
    const archiveTabVisible=await archiveTab.count()>0
    if(archiveTabVisible)await archiveTab.click()
    const permanentDelete=await page.locator('.data-management-settings-v10 .data-danger-confirm-v10')
      .getByText('Xóa dữ liệu lưu trữ',{exact:true}).count()>0
    record('ui',role+' permanent purge visibility',archiveTabVisible&&(role==='admin'?permanentDelete:!permanentDelete),{archiveTabVisible,permanentDelete})

    await go(page,role,'/settings?section=shipping&shipping_tab=hubs')
    const hubSubtab=page.locator('.shipping-settings-v6 .settings-subtabs-v6').getByRole('button',{name:/^Kho đích/}).first()
    if(await hubSubtab.count())await hubSubtab.click()
    const hubAdd=page.getByRole('button',{name:/Thêm HUB/}).first()
    const hubEditable=await hubAdd.count()>0&&!await hubAdd.isDisabled()
    record('ui',role+' HUB settings edit state',role==='viewer'?!hubEditable:hubEditable,{hubEditable})

    await go(page,role,'/warehouse/inventory')
    const stockTool=page.getByRole('button',{name:'Kiểm kê kho'}).first()
    const stockToolEditable=await stockTool.count()>0&&!await stockTool.isDisabled()
    record('ui',role+' warehouse tools edit state',role==='viewer'?!stockToolEditable:stockToolEditable,{stockToolEditable})

    await go(page,role,'/purchase/accounts')
    const addUser=page.getByRole('link',{name:/Thêm tài khoản/}).first()
    const addUserVisible=await addUser.count()>0
    record('ui',role+' purchase account create visibility',role==='viewer'?!addUserVisible:addUserVisible,{addUserVisible})

    await go(page,role,'/purchase/orders?range=all')
    const createOrder=page.getByRole('link',{name:/Tạo đơn/}).first()
    const createOrderVisible=await createOrder.count()>0
    record('ui',role+' purchase order create visibility',role==='viewer'?!createOrderVisible:createOrderVisible,{createOrderVisible})

    await go(page,role,'/sales/pos')
    const search=page.getByRole('textbox',{name:'Tìm sản phẩm theo barcode, SKU hoặc tên'}).first()
    if(await search.count()){
      await search.fill(f.sale_sku);await page.waitForTimeout(200)
      const tile=page.locator('button.pos-product-tile-final').filter({hasText:f.sale_sku}).first()
      const tileEnabled=await tile.count()>0&&!await tile.isDisabled()
      record('ui',role+' POS sell control',role==='viewer'?!tileEnabled:tileEnabled,{tileEnabled})
    }

    if(f.mutation_sale_id){
      await go(page,role,'/sales/history?sale='+encodeURIComponent(f.mutation_sale_id))
      const cancel=page.getByRole('button',{name:'Huỷ hóa đơn'}).first()
      const returnBtn=page.getByRole('button',{name:'Hoàn hàng'}).first()
      const canCancel=await cancel.count()>0&&!await cancel.isDisabled()
      const canReturn=await returnBtn.count()>0&&!await returnBtn.isDisabled()
      record('ui',role+' sale mutation controls',role==='viewer'?(!canCancel&&!canReturn):(canCancel&&canReturn),{canCancel,canReturn})
    }

    if(role==='admin'){
      // Isolated, labelled purchase order. Never select a real order in this QA.
      const orderId=randomUUID()
      const itemId=randomUUID()
      const orderCode='QA-DELETE-'+Date.now().toString(36).toUpperCase()
      f.critical_delete_order_id=orderId
      f.critical_delete_item_id=itemId
      qa.fixtures=f
      fs.writeFileSync('qa-session.json',JSON.stringify(qa))
      const {error:createError}=await adminClient.from('orders').insert({
        id:orderId,shopee_order_id:orderCode,recipient_name:'QA Delete Only',
        recipient_phone:'0900000012',recipient_address:'QA isolated deletion',
        cod:12345,receive_status:'WAITING_RECEIVE',warehouse_status:'NOT_READY',
        order_status:'COMPLETED',payment_status:'UNPAID',
        source:'MANUAL',shipping_service:'STANDARD',
      })
      if(createError)throw new Error('QA isolated order insert failed '+createError.message)
      const {error:itemError}=await adminClient.from('order_items').insert({
        id:itemId,order_id:orderId,sku:'QA-DELETE',product_name:'QA disposable item',
        variant:'Default',quantity:1,original_price:12345,final_price:12345,inventory_multiplier:1,
      })
      if(itemError)throw new Error('QA isolated item insert failed '+itemError.message)
      await go(page,role,'/purchase/orders?range=all&q='+encodeURIComponent(orderCode))
      const matching=page.locator('tr').filter({hasText:orderCode}).first()
      const found=await matching.count()>0
      record('ui','Delete-order QA fixture visible only by unique code',found,{orderCode})
      if(!found)throw new Error('Cannot locate unique QA deletion order')
      await matching.getByRole('button',{name:'Mở thao tác'}).click()
      await matching.getByRole('button',{name:'Xóa đơn',exact:true}).click()
      const dialog=page.getByRole('dialog',{name:'Xóa vĩnh viễn đơn hàng'})
      await dialog.waitFor({state:'visible'})
      const noCredentials=await dialog.locator('input[type="password"],input[type="email"],input[name="confirm_text"]').count()===0
      const reasonOptional=await dialog.locator('textarea').count()===1&&!(await dialog.locator('textarea').first().evaluate(el=>el.required))
      const correctTarget=await dialog.getByText(orderCode,{exact:true}).count()>0
      record('ui','Order delete requires only confirmation, optional reason',noCredentials&&reasonOptional&&correctTarget)
      await dialog.locator('textarea').fill(f.marker+' deleted for QA audit')
      await dialog.getByRole('button',{name:'Xác nhận xóa'}).click()
      let vanished=false
      for(let i=0;i<30;i++){
        const rows=await adminRest('/rest/v1/orders?select=id&id=eq.'+encodeURIComponent(orderId))
        if(rows.length===0){vanished=true;break}
        await new Promise(res=>setTimeout(res,400))
      }
      const itemRows=await adminRest('/rest/v1/order_items?select=id&id=eq.'+encodeURIComponent(itemId))
      record('backend','Admin deletes isolated QA order via UI',vanished,{orderCode})
      record('backend','Deletion cascades QA order item',vanished&&itemRows.length===0)
      const auditRows=await adminRest('/rest/v1/audit_logs?select=actor_user_id,old_value,new_value&action=eq.DELETE_ORDER_PERMANENT&order=created_at.desc&limit=20')
      const deleteAudit=(auditRows??[]).find(row=>(row.old_value?.order_ids??[]).includes(orderId))
      record('backend','Delete audit retains actor, order and optional reason',Boolean(deleteAudit?.actor_user_id)&&deleteAudit?.new_value?.reason===f.marker+' deleted for QA audit')
      const otherOrder=(await adminRest('/rest/v1/orders?select=id&id=eq.'+encodeURIComponent(f.hub_order_id)))[0]
      record('backend','Deletion preserves unrelated QA order',String(otherOrder?.id)===String(f.hub_order_id))
    }
  }finally{
    await browser.close()
  }

  const readOrders=await rest(session,'/rest/v1/orders?select=id&limit=1')
  const readSales=await rest(session,'/rest/v1/sales?select=id&limit=1')
  const readWarehouses=await rest(session,'/rest/v1/warehouses?select=id&limit=1')
  record('backend',role+' authenticated read access',readOrders.ok&&readSales.ok&&readWarehouses.ok,{orders:readOrders.status,sales:readSales.status,warehouses:readWarehouses.status})

  const writeNote=f.marker+' RBAC '+role
  const patch=await rest(session,'/rest/v1/erp_users?id=eq.'+encodeURIComponent(f.erp_user_id),{method:'PATCH',body:{note:writeNote}})
  const afterPatch=(await adminRest('/rest/v1/erp_users?select=note&id=eq.'+encodeURIComponent(f.erp_user_id)))[0]
  const patchApplied=String(afterPatch?.note??'')===writeNote
  record('backend',role+' direct table UPDATE RLS',role==='viewer'?(!patchApplied):(patch.ok&&patchApplied),{status:patch.status,applied:patchApplied})
  if(role!=='viewer'){
    await rest(session,'/rest/v1/erp_users?id=eq.'+encodeURIComponent(f.erp_user_id),{method:'PATCH',body:{note:originalNote}})
  }

  const transfer=await rest(session,'/rest/v1/rpc/create_stock_transfer',{
    method:'POST',
    body:{
      p_from_warehouse_id:f.warehouse_id,
      p_to_warehouse_id:f.transfer_warehouse_id,
      p_items:[{product_variant_id:f.mutation_variant_id,quantity:1}],
      p_note:f.marker+' RBAC '+role,
    },
  })
  record('backend',role+' create_stock_transfer RPC',role==='viewer'?expectDenied(transfer,'Operator role required'):transfer.ok,{status:transfer.status,body:transfer.text.slice(0,160)})

  if(f.mutation_sale_id){
    const archive=await rest(session,'/rest/v1/rpc/archive_pos_sales',{method:'POST',body:{p_sale_ids:[f.mutation_sale_id]}})
    if(role==='viewer'){
      record('backend',role+' archive_pos_sales RPC denied',expectDenied(archive,'Operator role required'),{status:archive.status,body:archive.text.slice(0,160)})
    }else{
      record('backend',role+' archive_pos_sales RPC allowed',archive.ok,{status:archive.status})
      const restore=await rest(session,'/rest/v1/rpc/restore_pos_sales',{method:'POST',body:{p_sale_ids:[f.mutation_sale_id]}})
      record('backend',role+' restore_pos_sales RPC allowed',restore.ok,{status:restore.status,body:restore.text.slice(0,160)})
    }
  }

  const receiveProbe=await rest(session,'/rest/v1/rpc/receive_orders_into_warehouse',{
    method:'POST',body:{p_order_ids:[f.warehouse_order_id],p_note:'RBAC probe'},
  })
  record('backend',role+' receive warehouse role gate',role==='viewer'?expectDenied(receiveProbe,'Operator role required'):expectAllowedPastRole(receiveProbe,'Operator role required'),{status:receiveProbe.status,body:receiveProbe.text.slice(0,180)})

  const posProbe=await rest(session,'/rest/v1/rpc/create_pos_sale_v2',{
    method:'POST',
    body:{
      p_warehouse_id:f.warehouse_id,p_customer_id:f.customer_id,p_items:[],
      p_discount_amount:0,p_other_fee:0,p_payments:[],p_note:'RBAC probe',p_invoice_code:null,
    },
  })
  record('backend',role+' POS RPC role gate',role==='viewer'?expectDenied(posProbe,'Operator role required'):expectAllowedPastRole(posProbe,'Operator role required'),{status:posProbe.status,body:posProbe.text.slice(0,180)})

  const providerProbe=await rest(session,'/rest/v1/rpc/save_tracking_provider_config_secure',{
    method:'POST',
    body:{
      p_carrier:'RBAC',
      p_enabled:true,
      p_endpoint_url:'http://invalid-rbac.local',
      p_http_method:'GET',
      p_timeout_ms:8000,
      p_auth_header_name:null,
      p_auth_secret:null,
      p_clear_secret:false,
    },
  })
  const providerProbePass=role==='admin'
    ? (!providerProbe.ok&&providerProbe.text.includes('HTTPS endpoint'))
    : expectDenied(providerProbe,'Admin role required')
  record('backend',role+' tracking provider admin RPC gate',providerProbePass,{status:providerProbe.status,body:providerProbe.text.slice(0,180)})

  const runtimeProbe=await rest(session,'/rest/v1/rpc/get_telegram_alert_runtime_settings',{method:'POST',body:{}})
  record('backend',role+' Telegram secret runtime RPC hidden',!runtimeProbe.ok,{status:runtimeProbe.status,body:runtimeProbe.text.slice(0,160)})

  const destinationPayload={
    destination_hub:f.shipper_hub,
    chat_id:'0',
    alert_types:['DELIVERED'],
    is_active:false,
  }
  const destinationWrite=await rest(session,'/rest/v1/telegram_alert_destinations',{method:'POST',body:destinationPayload})
  if(role==='admin'){
    record('backend',role+' Telegram destination write RLS',destinationWrite.ok,{status:destinationWrite.status,body:destinationWrite.text.slice(0,160)})
    await rest(session,'/rest/v1/telegram_alert_destinations?destination_hub=eq.'+encodeURIComponent(f.shipper_hub),{method:'DELETE'})
  }else{
    record('backend',role+' Telegram destination write RLS',!destinationWrite.ok,{status:destinationWrite.status,body:destinationWrite.text.slice(0,160)})
  }

  const adminList=await rest(session,'/rest/v1/rpc/admin_list_system_users',{method:'POST',body:{}})
  record('backend',role+' admin_list_system_users',role==='admin'?adminList.ok:expectDenied(adminList,'Admin role required'),{status:adminList.status,body:adminList.text.slice(0,160)})

  const adminRole=await rest(session,'/rest/v1/rpc/admin_set_system_user_role',{method:'POST',body:{p_user_id:qa.user_id,p_role:role}})
  record('backend',role+' admin_set_system_user_role',role==='admin'?adminRole.ok:expectDenied(adminRole,'Admin role required'),{status:adminRole.status,body:adminRole.text.slice(0,160)})

  const resetProbe=await rest(session,'/rest/v1/rpc/admin_reset_erp_data',{method:'POST',body:{p_scope:'DATA',p_confirm:'RBAC INVALID CONFIRM'}})
  const resetPass=role==='admin'
    ? (!resetProbe.ok&&resetProbe.text.includes('Chuỗi xác nhận chưa đúng'))
    : expectDenied(resetProbe,'Admin role required')
  record('backend',role+' admin_reset_erp_data safe probe',resetPass,{status:resetProbe.status,body:resetProbe.text.slice(0,180)})

  const edgeProbe=await edge(session,{action:'rbac_probe'})
  const edgePass=role==='admin'
    ? edgeProbe.status===400&&edgeProbe.text.includes('Action không hợp lệ')
    : edgeProbe.status===403&&edgeProbe.text.includes('Admin role required')
  record('backend',role+' admin-system-users Edge Function gate',edgePass,{status:edgeProbe.status,body:edgeProbe.text.slice(0,180)})
}

await setRole('operator')
fs.writeFileSync('qa-session.json',JSON.stringify(qa))

if(summary.consoleErrors.length)summary.failures.push('Console errors: '+summary.consoleErrors.length)
if(summary.pageErrors.length)summary.failures.push('Page errors: '+summary.pageErrors.length)
if(summary.network5xx.length)summary.failures.push('5xx responses: '+summary.network5xx.length)
fs.writeFileSync(outDir+'/rbac-summary.json',JSON.stringify(summary,null,2))
console.log('QA_RBAC_SUMMARY_START')
console.log(JSON.stringify(summary,null,2))
console.log('QA_RBAC_SUMMARY_END')
if(summary.failures.length)process.exit(2)
