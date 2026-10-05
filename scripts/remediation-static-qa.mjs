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
