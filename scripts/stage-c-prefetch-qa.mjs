import assert from 'node:assert/strict'
import fs from 'node:fs'

const files=[
  'app/(erp)/sales/page.tsx',
  'app/(erp)/sales/history/page.tsx',
  'components/sales-pos-workspace.tsx',
]
let checked=0
for(const path of files){
  const source=fs.readFileSync(path,'utf8')
  const links=[...source.matchAll(/<Link\b[^>]*>/g)].map(m=>m[0])
  const heavy=links.filter(tag=>/href=(?:"\/sales\/(?:pos|history)"|\{'\/sales\/history\?sale=')/.test(tag))
  assert.ok(heavy.length>0,'Expected sales links missing: '+path)
  for(const tag of heavy){
    assert.ok(tag.includes('prefetch={false}'),'High-CPU sales link still automatically prefetches in '+path)
    checked++
  }
  console.log('STAGE_C_PREFETCH_SOURCE '+JSON.stringify({file:path,links_checked:heavy.length,pass:true}))
}
assert.ok(checked>=9,'Insufficient route coverage: '+checked)
console.log('STAGE_C_PREFETCH_SUMMARY '+JSON.stringify({files:files.length,links:checked,failures:0}))
