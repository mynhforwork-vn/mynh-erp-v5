import fs from 'node:fs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const PREVIEW_URL=process.env.PREVIEW_URL
const SUPABASE_URL=process.env.SUPABASE_URL
const SUPABASE_KEY=process.env.SUPABASE_KEY
if(!PREVIEW_URL||!SUPABASE_URL||!SUPABASE_KEY)throw new Error('Missing tracking browser QA env')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
if(!session.fixtures?.hub_order_code)throw new Error('Missing isolated QA order fixture')
const output='qa-tracking-slidebar-artifacts'
fs.mkdirSync(output,{recursive:true})
const cookies=new Map()
const auth=createBrowserClient(SUPABASE_URL,SUPABASE_KEY,{
  cookies:{
    getAll(){return [...cookies.values()].map(item=>({name:item.name,value:item.value}))},
    setAll(items){items.forEach(item=>cookies.set(item.name,item))},
  }
})
const {error}=await auth.auth.setSession({
  access_token:session.access_token,
  refresh_token:session.refresh_token,
})
if(error)throw error
const browser=await chromium.launch({
  headless:true,
  ...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})
})
const results=[]
const check=(name,pass,details={})=>{
  results.push({name,pass:Boolean(pass),...details})
  console.log((pass?'PASS ':'FAIL ')+name+' '+JSON.stringify(details))
}
try{
  for(const viewport of [{width:1280,height:900},{width:1440,height:900},{width:2560,height:1600}]){
    const context=await browser.newContext({viewport})
    await context.addCookies([...cookies.values()].map(c=>({
      name:c.name,value:c.value,url:PREVIEW_URL,
      httpOnly:Boolean(c.options?.httpOnly),secure:c.options?.secure!==false,
      sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax'
    })))
    const page=await context.newPage()
    await page.goto(PREVIEW_URL+'/purchase/tracking?range=all',{waitUntil:'domcontentloaded',timeout:35000})
    await page.locator('.tracking-content-workspace').waitFor({state:'visible',timeout:15000})
    await page.waitForTimeout(550)
    const toggle=page.locator('.desktop-sidebar-seam-handle .sidebar-collapse-toggle')
    const orderLink=page.locator('.tracking-hub-table a.table-link').filter({hasText:session.fixtures.hub_order_code}).first()
    const measuring=async(name,expectedLeftCollapsed,expectedPanel)=>{
      const v=await page.evaluate(()=>{
        const rect=s=>{const el=document.querySelector(s);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}}
        const shell=document.querySelector('.brand-shell-v1')
        const grip=document.querySelector('.tracking-hub-table-v2 th.tracking-col-product .mynh-column-resize-grip')
        const head=document.querySelector('.tracking-hub-table-v2 th.tracking-action-head')
        const button=document.querySelector('.tracking-hub-table-v2 .tracking-sync-icon-button')
        return {
          leftCollapsed: Boolean(shell?.classList.contains('desktop-sidebar-collapsed')),
          bodyOverflowX:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
          shell:rect('.brand-shell-v1'),left:rect('.brand-shell-v1>.sidebar'),
          main:rect('.brand-shell-v1>.main'),
          kpis:rect('.tracking-status-strip-v2'),
          workspace:rect('.tracking-content-workspace'),
          hub:rect('.tracking-content-workspace>.tracking-hub-stack-v2'),
          panel:rect('.tracking-content-workspace>.context-order-panel'),
          table:rect('.tracking-hub-table-v2'),
          tableWrap:rect('.tracking-hub-table-wrap-v2'),
          columns:Object.fromEntries(['order','product','cod','recipient','status','actions'].map(name=>{
            const cell=document.querySelector('.tracking-hub-table-v2 th.tracking-col-'+name)
            return [name,cell?Math.round(cell.getBoundingClientRect().width):null]
          })),
          customized:Boolean(document.querySelector('.tracking-hub-table-v2.mynh-resizable-table')),
          action:head?{width:head.getBoundingClientRect().width}:null,
          icon:button?{width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height}:null,
          resizerPresent:Boolean(grip),
          tableScrollElement:Boolean(document.querySelector('.tracking-hub-table-wrap-v2')),
        }
      })
      const panelOK=expectedPanel
        ?Boolean(v.panel&&v.workspace&&v.hub
          &&v.panel.top>=v.workspace.top-3
          &&v.panel.bottom<=v.workspace.bottom+3
          &&v.panel.left>=v.hub.right-2
          &&v.panel.right<=viewport.width+2
          &&v.panel.width>=350)
        :!v.panel
      const leftOK=v.leftCollapsed===expectedLeftCollapsed
        &&v.left&&Math.abs(v.left.width-(expectedLeftCollapsed?72:224))<=10
      const layoutOK=Boolean(v.kpis&&v.workspace&&v.hub&&v.main)
        &&v.workspace.top>=v.kpis.bottom-3
        &&v.hub.left>=v.main.left-2
        &&v.hub.right<=viewport.width+2
        &&!v.bodyOverflowX
      const compactOK=Boolean(v.action&&v.action.width<=50)
        &&(!v.icon||v.icon.width<=25&&v.icon.height<=25)
      const tableFits=Boolean(v.table&&v.tableWrap)
        &&v.table.width<=Math.max(expectedPanel?680:0,v.tableWrap.width)+8
      // With right panel closed, the table must actually FILL its lane.
      // A narrow 1280px right-panel case may use a limited local scrollbar.
      const adaptive=expectedPanel
        ?tableFits
        :tableFits&&Math.abs(v.table.width-v.tableWrap.width)<=8
      check(viewport.width+' '+name,Boolean(panelOK&&leftOK&&layoutOK&&compactOK&&v.resizerPresent&&adaptive),v)
      await page.screenshot({path:output+'/'+viewport.width+'-'+name+'.png',fullPage:false})
      return v
    }
    const ensureLeft=async(collapsed)=>{
      const state=await page.locator('.brand-shell-v1').evaluate(el=>el.classList.contains('desktop-sidebar-collapsed'))
      if(state!==collapsed){
        await toggle.click()
        await page.waitForTimeout(430)
      }
    }
    await ensureLeft(false)
    const initial=await measuring('left-open_right-closed',false,false)
    let draggedProduct=null
    if(viewport.width===1440){
      const grip=page.locator('.tracking-hub-table-v2 th.tracking-col-product .mynh-column-resize-grip').first()
      if(await grip.count()){
        await grip.scrollIntoViewIfNeeded()
        const th=page.locator('.tracking-hub-table-v2 th.tracking-col-product').first()
        const before=await th.evaluate(el=>el.getBoundingClientRect().width)
        const box=await grip.boundingBox()
        if(box){
          await page.mouse.move(box.x+box.width/2,box.y+box.height/2)
          await page.mouse.down()
          await page.mouse.move(box.x+box.width/2+42,box.y+box.height/2,{steps:5})
          await page.mouse.up()
          await page.waitForTimeout(250)
          const after=await th.evaluate(el=>el.getBoundingClientRect().width)
          draggedProduct=after
          check('1440 drag product column',after>=before+20&&after<=before+60,{before,after})
        }else check('1440 drag product column',false,{reason:'Resize grip has no bounding box'})
      }else check('1440 drag product column',false,{reason:'Resize grip missing'})
    }
    if(draggedProduct!==null){
      const afterDrag=await measuring('left-open_right-closed_after-manual-resize',false,false)
      check('1440 manual drag still fits full lane',
        Math.abs(afterDrag.table.width-afterDrag.tableWrap.width)<=8,
        {table:afterDrag.table.width,available:afterDrag.tableWrap.width})
    }
    await ensureLeft(true)
    const leftCollapsed=await measuring('left-closed_right-closed',true,false)
    check(viewport.width+' left toggle expands table into free space',
      leftCollapsed.table.width>initial.table.width+95,
      {leftOpen:initial.table.width,leftCollapsed:leftCollapsed.table.width})
    await ensureLeft(false)
    const leftReopened=await measuring('left-reopened_right-closed',false,false)
    check(viewport.width+' reopen left restores fitted width',
      Math.abs(leftReopened.table.width-initial.table.width)<=8,
      {initial:initial.table.width,afterReopen:leftReopened.table.width})
    await ensureLeft(true)
    check(viewport.width+' QA order link available',await orderLink.count()>0)
    if(await orderLink.count()){
      await orderLink.click()
      await page.locator('aside.context-order-panel').waitFor({state:'visible',timeout:15000})
      await page.waitForTimeout(300)
      const panelNarrow=await measuring('left-closed_right-open',true,true)
      await ensureLeft(false)
      const panelWide=await measuring('left-open_right-open',false,true)
      check(viewport.width+' right open shrinks table',
        Boolean(initial.table&&panelWide.table&&panelWide.table.width<initial.table.width-60
          &&panelWide.table.width<=Math.max(680,panelWide.tableWrap.width)+12),
        {before:initial.table?.width,after:panelWide.table?.width,available:panelWide.tableWrap?.width,customized:panelWide.customized})
      check(viewport.width+' right panel changes widths',Boolean(initial.columns&&panelWide.columns
        &&(panelWide.columns.product??0)<(initial.columns.product??0)
        &&(panelWide.columns.recipient??0)<(initial.columns.recipient??0)),
        {before:initial.columns,after:panelWide.columns})
      if(draggedProduct!==null){
        check('1440 custom saved widths fit with right slidebar',
          Boolean(panelWide.customized&&panelWide.table&&panelWide.tableWrap
            &&panelWide.table.width<=Math.max(680,panelWide.tableWrap.width)+12),
          {table:panelWide.table?.width,available:panelWide.tableWrap?.width})
      }
      const close=page.locator('aside.context-order-panel a[aria-label="Đóng toàn bộ"]').first()
      if(await close.count()){
        await close.click()
        await page.locator('aside.context-order-panel').waitFor({state:'detached',timeout:12000})
        const restored=await measuring('left-open_right-reclosed',false,false)
        check(viewport.width+' right close restores table width',
          Boolean(initial.table&&restored.table&&restored.table.width>panelWide.table.width+60),
          {initial:initial.table?.width,restored:restored.table?.width,opened:panelWide.table?.width})
        check(viewport.width+' right closed table fills available lane',
          Math.abs(restored.table.width-restored.tableWrap.width)<=8,
          {table:restored.table.width,available:restored.tableWrap.width})
        if(draggedProduct!==null){
          check('1440 custom product width restored',Math.abs((restored.columns.product??0)-draggedProduct)<=6,
            {saved:draggedProduct,restored:restored.columns.product})
        }
      }else check(viewport.width+' right panel closes',false,{reason:'Missing close action'})
    }
    await context.close()
  }
}finally{
  await browser.close()
}
const failed=results.filter(x=>!x.pass)
const summary={preview:PREVIEW_URL,commit:process.env.GITHUB_SHA??'unknown',total:results.length,failed:failed.length,passed:results.length-failed.length,results}
fs.writeFileSync(output+'/summary.json',JSON.stringify(summary,null,2))
console.log('TRACKING_LAYOUT_QA '+JSON.stringify({total:summary.total,passed:summary.passed,failed:summary.failed}))
assert.equal(failed.length,0,'Tracking sidebar/table visual layout QA failed')
