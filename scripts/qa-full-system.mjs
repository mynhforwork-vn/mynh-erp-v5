import fs from 'node:fs'
import path from 'node:path'

function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const p=path.join(dir,e.name)
    return e.isDirectory()?walk(p):[p]
  })
}
const pages=walk('app').filter(p=>p.endsWith('/page.tsx'))
const routes=new Set(pages.map(p=>{
  let r=p.replace(/^app\/\(erp\)/,'').replace(/^app/,'').replace(/\/page\.tsx$/,'')
  return r||'/'
}))
routes.add('/login')

const sources=[...walk('app'),...walk('components')].filter(p=>/\.(tsx|ts)$/.test(p))
const failures=[]
const warnings=[]
let buttonCount=0, formActionCount=0, linkCount=0, clientHandlerCount=0

for(const file of sources){
  const s=fs.readFileSync(file,'utf8')
  buttonCount+=(s.match(/<button\b/g)||[]).length
  formActionCount+=(s.match(/\baction=\{/g)||[]).length
  clientHandlerCount+=(s.match(/\bonClick=\{/g)||[]).length
  for(const m of s.matchAll(/href=["'](\/[A-Za-z0-9_\-\/]+)(?:\?[^"']*)?["']/g)){
    linkCount++
    const href=m[1].replace(/\/$/,'')||'/'
    if(!routes.has(href) && !href.startsWith('/api/')){
      warnings.push(`${file}: literal href ${href} has no page.tsx route`)
    }
  }
  if(/<button\b[^>]*disabled[^>]*>\s*(Huỷ hóa đơn|Hoàn hàng)/.test(s)){
    warnings.push(`${file}: Sales history cancel/return button is disabled`)
  }
  if(/DỮ LIỆU DEMO|DEMO_/.test(s) && !file.includes('/preview/')){
    warnings.push(`${file}: demo marker remains in live source`)
  }
}

const mustRoutes=[
  '/','/purchase','/purchase/accounts','/purchase/orders','/purchase/tracking',
  '/warehouse','/warehouse/receive','/warehouse/inventory','/warehouse/history',
  '/sales','/sales/pos','/sales/history','/sales/customers','/sales/debt',
  '/finance','/finance/cashflow','/finance/shipper-payments','/finance/reports',
  '/settings','/account','/login'
]
for(const r of mustRoutes) if(!routes.has(r)) failures.push(`Missing route: ${r}`)

const actionFiles=['lib/actions/core.ts','lib/actions/warehouse.ts','lib/actions/sales.ts','lib/actions/finance.ts']
for(const f of actionFiles) if(!fs.existsSync(f)) failures.push(`Missing action file: ${f}`)

console.log(JSON.stringify({
  routes:[...routes].sort(),
  routeCount:routes.size,
  scannedFiles:sources.length,
  buttonCount,formActionCount,clientHandlerCount,linkCount,
  warnings,failures
},null,2))
if(failures.length) process.exit(1)
