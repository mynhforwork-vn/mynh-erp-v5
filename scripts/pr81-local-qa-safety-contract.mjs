import assert from 'node:assert/strict'
import fs from 'node:fs'
const get=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8')
const runner=get('qa/pr81-local-supabase.sh')
const fixture=get('qa/pr81-local-fixture.sql')
const jwt=get('qa/pr81-local-jwt-qa.mjs')
const doc=get('../docs/qa/pr81-local-supabase-readme.md')
let passed=0
function check(name,test){assert.ok(test,name);passed++;console.log('PASS '+name)}
check('Local isolated workdir and Supabase init/start',runner.includes('mktemp -d /tmp/mynh-pr81-local.')&&runner.includes('supabase init')&&runner.includes('supabase start'))
check('Auto stop and remove local temporary files',runner.includes('trap cleanup EXIT')&&runner.includes('supabase stop --no-backup')&&runner.includes('rm -rf "$work"'))
check('No remote Supabase link, push, pull or cloud branch creation',
 !/^\s*supabase\s+(?:link|login|db\s+(?:push|pull))\b/m.test(runner))
check('Production tokens erased in child process',runner.includes('unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID'))
check('Migrations 0070 and 0071 run only via local docker exec psql',
 runner.includes('docker exec -i "$container" psql')&&runner.includes('0070_persistent_failed_delivery_reminders.sql')&&runner.includes('0071_operational_system_notifications.sql'))
check('Postgres container name read from disposable project ID',runner.includes('supabase_db_$id')&&runner.includes('grep -Fxq "$container"'))
check('Refuse hosted Supabase API URL',jwt.includes('Refuse nonlocal Supabase URL')&&jwt.includes("['localhost','127.0.0.1','::1']"))
check('Auth local creates signed JWT for three RBAC roles',jwt.includes("['admin','operator','viewer']")&&jwt.includes('/auth/v1/token?grant_type=password'))
check('Local test contains delivery-failure 40-day fixture',fixture.includes("interval '40 days'")&&fixture.includes("'DELIVERY_FAILED'"))
check('Checks direct table write privilege and per-user read state',jwt.includes('/rest/v1/system_notification_reads')&&jwt.includes('Read state leaked across users'))
check('Checks unresolved incidents and recovery',jwt.includes('Active failure must not be resolvable')&&jwt.includes('Recovered sync/mapping errors still active'))
check('Scope and limitations explicit',doc.includes('chưa có kết quả chạy thực tế')&&doc.includes('không sao chép ERP Production'))
console.log('PR81_LOCAL_QA_SAFETY_CONTRACT_SUMMARY '+JSON.stringify({passed,failed:0,scope:'static safety; no Docker run'}))
