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
const form=read('components/erp-user-inline-form.tsx')
const feedbackCss=read('app/styles/user-history-spc-copy.css')
assert.match(form,/export function ERPUserActionToast/,'page-level toast survives form unmount')
assert.match(form,/setTimeout\(\(\)=>setFeedback\(null\),5000\)/,'success and error feedback clear after five seconds')
assert.match(form,/ERP_USER_ACTION_EVENT/,'success event includes selected user identifiers')
assert.match(form,/if\(state\.status!=='ok'\|\|!state\.href\)return/,'success navigation only after confirmed action result')
assert.match(form,/feedback\.status==='ok'\?'is-success'/,'success class is used in feedback')
assert.match(form,/router\.refresh\(\)/,'server rows refresh when URL is unchanged')
assert.doesNotMatch(form,/erp-user-inline-error/,'no error text that expands toolbar')
assert.match(feedbackCss,/\.erp-user-action-toast\{position:fixed/,'feedback stays outside table flow')
assert.match(feedbackCss,/\.erp-user-action-toast\{[^}]*right:max\(12px,env\(safe-area-inset-right\)\)/,'shared action toast is anchored top right')
assert.match(feedbackCss,/\.erp-user-action-toast\.is-success\{border-left-color:/,'success style is retained')
assert.match(feedbackCss,/\.erp-user-action-toast\.is-error\{border-left-color:/,'error style is retained')
assert.doesNotMatch(feedbackCss,/\.erp-user-action-toast\.is-error\{[^}]*left:/,'error toast no longer anchors left')

const page=read('app/(erp)/users/page.tsx')
const table=read('components/purchase-account-table.tsx')
assert.match(page,/className=\{'p1-account-clear-filters'/,'reset all filters icon exists')
assert.match(page,/const hasActiveTableFilters=/,'reset checks current filters')
assert.match(page,/sp\.range&&sp\.range!=='all'/,'reset treats all-time as default')
assert.match(page,/\|\|sp\.from\|\|sp\.to/,'reset includes custom date bounds')
assert.match(page,/Object\.values\(columnFilterEntries\)\.some\(Boolean\)/,'reset includes header filters')
assert.match(page,/clearedParams\.set\('archive','archived'\)/,'reset preserves archived view')
assert.match(page,/<ERPUserActionToast\/>/,'toast not nested in rows')
assert.match(table,/visibleRows\.map\(\(u,i\)=>/,'table renders only rows that still belong in current view')
assert.match(table,/detail\?\.status!=='ok'/,'never hide User on failure')
assert.match(table,/setHiddenAfterSuccess/,'rows disappear immediately after confirmed success')
assert.match(table,/p1-account-mobile-clear-filters/,'clear filter remains available when mobile bulk selection hides search form')
assert.match(feedbackCss,/\.p1-account-mobile-clear-filters/,'mobile selection reset icon is styled')
assert.match(core,/const rawDatabaseError=/,'technical DB errors not shown to User')
assert.match(core,/Vui lòng làm mới danh sách/,'friendly error text')
assert.match(feedbackCss,/\.p1-account-clear-filters/,'compact reset control is styled')
console.log('PASS USER_ARCHIVE_ATOMIC_STATIC_QA (no database migration or authenticated E2E performed)')
