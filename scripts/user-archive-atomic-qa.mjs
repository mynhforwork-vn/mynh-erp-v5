import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')
const sql=read('supabase/migrations/0074_atomic_user_archive_audit.sql')
const core=read('lib/actions/core.ts')
const lifecycle=core.slice(core.indexOf('async function applyERPUserArchiveChange('),core.indexOf('function numberOrNull('))
assert.ok(lifecycle.length>0,'lifecycle section found')
assert.equal((lifecycle.match(/\.rpc\('set_erp_user_archived'/g)||[]).length,1,'a single shared RPC helper')
assert.doesNotMatch(lifecycle,/\.from\('audit_logs'\)\.insert/,'no direct audit INSERT from User session')
assert.doesNotMatch(lifecycle,/\.from\('erp_users'\)\.update/,'no non-atomic User mutations')
for(const name of ['archiveERPUser','restoreERPUser','archiveERPUsersBulk','restoreERPUsersBulk']){
  assert.match(lifecycle,new RegExp('export async function '+name+'\\('),'single/bulk action: '+name)
}
for(const spec of [
  ['single archive',/applyERPUserArchiveChange\(supabase,\[userId\],true,false\)/],
  ['single restore',/applyERPUserArchiveChange\(supabase,\[userId\],false,false\)/],
  ['bulk archive',/applyERPUserArchiveChange\(supabase,userIds,true,true\)/],
  ['bulk restore',/applyERPUserArchiveChange\(supabase,userIds,false,true\)/],
]){
  assert.match(lifecycle,spec[1],spec[0])
}
assert.match(lifecycle,/PGRST202/,'missing SQL migration fails closed without changing User')
assert.match(sql,/SECURITY DEFINER\s+SET search_path TO ''/,'explicit protected search_path')
assert.match(sql,/v_actor uuid := auth\.uid\(\)/,'actor from authenticated JWT')
assert.match(sql,/public\.current_erp_role\(\)/,'server-side role verification')
assert.match(sql,/NOT IN \('admin','operator'\)/,'role allowlist')
assert.match(sql,/cardinality\(p_user_ids\) > 200/,'batch limit')
assert.match(sql,/FOR UPDATE/,'deterministic row locking')
assert.match(sql,/INSERT INTO public\.audit_logs/,'audit stored inside same transaction')
assert.match(sql,/RAISE EXCEPTION 'Có User không tồn tại/,'missing User rejects entire transaction')
assert.match(sql,/REVOKE ALL ON FUNCTION public\.set_erp_user_archived[\s\S]*FROM PUBLIC,anon,authenticated/,'no public/anon execution')
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.set_erp_user_archived[\s\S]*TO authenticated/,'caller requires authenticated RPC role')
assert.doesNotMatch(sql,/CREATE POLICY|ALTER POLICY|DROP TABLE|DELETE FROM|UPDATE public\.audit_logs/i,'no broad RLS relaxation or history mutation')
console.log('PASS USER_ARCHIVE_ATOMIC_STATIC_QA (no database migration or authenticated E2E performed)')
