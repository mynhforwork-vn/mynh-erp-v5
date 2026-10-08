import fs from 'node:fs'
import path from 'node:path'

const roots=['app','components','lib']
const files=[]
for(const root of roots)walk(root)

function walk(dir){
  if(!fs.existsSync(dir))return
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,entry.name)
    if(entry.isDirectory())walk(p)
    else if(/\.(ts|tsx)$/.test(entry.name))files.push(p)
  }
}

const issues=[]
const warnings=[]
let buttonCount=0
let handlerCount=0
let formActionCount=0
let linkCount=0
const routes=[]

for(const file of files){
  const src=fs.readFileSync(file,'utf8')
  if(/mobile-entity-list|mobile-purchase-summary-list|mobile-date-picker|mobile-pos-cart-bar|mobile-cart-close/.test(src)){
    issues.push(`${file}: dedicated Mobile card/cart UI must be excluded from Desktop-only release`)
  }
  buttonCount+=(src.match(/<button\b/g)||[]).length
  handlerCount+=(src.match(/\bonClick\s*=\s*\{/g)||[]).length
  formActionCount+=(src.match(/\baction\s*=\s*\{/g)||[]).length
  linkCount+=(src.match(/<Link\b/g)||[]).length

  if(/\/page\.tsx$/.test(file)){
    let route='/'+file
      .replace(/^app\//,'')
      .replace(/\/page\.tsx$/,'')
      .replace(/\([^/]+\)\//g,'')
    if(route==='/')route='/'
    routes.push(route)
  }

  const bareDisabled=[...src.matchAll(/<button\b[^>]*\bdisabled(?=[\s>])/gs)]
  for(const hit of bareDisabled){
    const line=src.slice(0,hit.index).split('\n').length
    issues.push(`${file}:${line}: static disabled button remains`)
  }

  if(/DỮ LIỆU DEMO|\bDEMO_[A-Z0-9_]+\b/.test(src)){
    issues.push(`${file}: demo data marker remains`)
  }

  if(file!=='components/module-placeholder.tsx'&&/ModulePlaceholder/.test(src)){
    issues.push(`${file}: ModulePlaceholder is still used`)
  }

  if(/className=["'][^"']*\bdisabled\b/.test(src)){
    warnings.push(`${file}: disabled visual state remains; verify it is intentional`)
  }
  if(/\bTODO\b|\bFIXME\b/.test(src)){
    warnings.push(`${file}: TODO/FIXME remains`)
  }
}

const required=[
  ['lib/actions/sales.ts','cancelPOSSale'],
  ['lib/actions/sales.ts','returnPOSSale'],
  ['lib/actions/sales.ts','archivePOSSalesBulk'],
  ['lib/actions/core.ts','bulkImportERPUsers'],
  ['components/user-bulk-import.tsx','Import TSV'],
  ['components/sales-history-actions.tsx','Xác nhận hoàn'],
  ['components/sales-history-table.tsx','Lưu trữ đã chọn'],
]
for(const [file,needle] of required){
  const src=fs.existsSync(file)?fs.readFileSync(file,'utf8'):''
  if(!src.includes(needle))issues.push(`${file}: missing remediation marker ${needle}`)
}

/* Contextual slidebar contract: linked details stay in the current workspace.
   Explicit "Mở module" actions are the only intentional cross-module escape hatch. */
const contextualRequired=[
  ['components/context-order-panel.tsx','parentLabel'],
  ['components/context-order-panel.tsx','Mở trong module Đơn ↗'],
  ['components/context-sale-panel.tsx','context-stack-back'],
  ['app/(erp)/sales/customers/page.tsx','ContextSalePanel'],
  ['app/(erp)/sales/customers/page.tsx','customer-collect-context'],
  ['app/(erp)/sales/debt/page.tsx','ContextSalePanel'],
  ['components/warehouse-inventory-workspace.tsx',"historyScope"],
  ['app/(erp)/warehouse/history/page.tsx','openTransactionHref'],
  ['app/(erp)/warehouse/history/page.tsx','parentLabel="Lịch sử kho"'],
  ['app/(erp)/warehouse/history/page.tsx','Xem hóa đơn POS →'],
  ['app/(erp)/warehouse/history/page.tsx','Xem đơn nhập →'],
  ['app/styles/remediation-ux-v3.css','Warehouse history contextual drill-down'],
  ['app/(erp)/tracking/page.tsx','orderBasePath="/purchase/tracking"'],
  ['app/(erp)/tracking/page.tsx','parentLabel="Cảnh báo vận chuyển"'],
  ['components/finance-reference-panel.tsx','THAM CHIẾU · TRONG THU / CHI'],
  ['app/(erp)/finance/shipper-payments/page.tsx','parentLabel="Đối soát Shipper"'],
  ['app/styles/remediation-ux-v3.css','FINAL SLIDEBAR NORMALIZATION — Intake + Sales History'],
  ['app/styles/remediation-ux-v3.css','Finance panel vertical geometry: match the ledger row'],
]
for(const [file,needle] of contextualRequired){
  const src=fs.existsSync(file)?fs.readFileSync(file,'utf8'):''
  if(!src.includes(needle))issues.push(`${file}: contextual slidebar contract missing ${needle}`)
}

const contextualForbidden=[
  ['app/(erp)/sales/customers/page.tsx',"/sales/history?sale='+row.id"],
  ['app/(erp)/sales/debt/page.tsx',"/sales/history?sale='+row.id"],
  ['components/warehouse-inventory-workspace.tsx',"/warehouse/history?q="],
]
for(const [file,needle] of contextualForbidden){
  const src=fs.existsSync(file)?fs.readFileSync(file,'utf8'):''
  if(src.includes(needle))issues.push(`${file}: legacy cross-module drilldown remains: ${needle}`)
}

/* No migration may silently repopulate business demo/QA records on a fresh DB.
   Legacy migration 0035 stays as a comment-only no-op; history is immutable in the DB. */
const migrationsDir='supabase/migrations'
if(fs.existsSync(migrationsDir)){
  for(const entry of fs.readdirSync(migrationsDir)){
    if(!entry.endsWith('.sql'))continue
    const file=path.join(migrationsDir,entry)
    const raw=fs.readFileSync(file,'utf8')
    const executable=raw
      .replace(/\/\*[\s\S]*?\*\//g,'')
      .split('\n')
      .map(line=>line.replace(/--.*$/,''))
      .join('\n')
    if(entry==='0035_seed_finance_demo_data.sql'&&executable.trim()){
      issues.push(file+': retired finance demo seed must remain SQL-free')
    }
    if(/\binsert\s+into\b/i.test(executable)&&/\[DEMO\]|DEMO[-_]|QA_BROWSER_FIXTURE/i.test(executable)){
      issues.push(file+': executable business demo/QA seed detected')
    }
  }
}

/* Desktop-only release contract: Mobile App UX must not be bundled or mounted.
   Keep the main desktop shell and legacy shared tablet breakpoints untouched. */
const desktopLayout=fs.readFileSync('app/(erp)/layout.tsx','utf8')
const globalCSS=fs.readFileSync('app/globals.css','utf8')
if(fs.existsSync('components/mobile-app-nav.tsx'))issues.push('MobileAppNav component must be excluded from Desktop release')
if(fs.existsSync('app/styles/mobile-remediation.css'))issues.push('Legacy mobile remediation stylesheet must not ship')
if(fs.existsSync('scripts/mobile-full-qa.mjs'))issues.push('Mobile QA script must not ship in Desktop-only release')
if(/MobileAppNav|mobile-app-bar|mobile-bottom-nav/.test(desktopLayout))issues.push('Mobile app header/navigation still mounted in ERP layout')
if(/mobile-remediation\.css/.test(globalCSS))issues.push('Mobile CSS is still loaded by globals.css')
const brandCSS=fs.readFileSync('app/styles/brand-responsive-v1.css','utf8')
if(/@media\s*\(max-width:\s*(?:900|520|430|380)px\)/.test(brandCSS))issues.push('Dedicated Mobile media queries remain in new desktop brand stylesheet')

const result={
  scannedFiles:files.length,
  routeCount:routes.length,
  routes:routes.sort(),
  buttonCount,
  clientHandlerCount:handlerCount,
  formActionCount,
  linkCount,
  warnings,
  failures:issues,
}
console.log(JSON.stringify(result,null,2))
if(issues.length)process.exit(1)
