#!/usr/bin/env bash
# MYNH ERP V5 PR #81: disposable, local-only Supabase Auth/Postgres QA.
# No cloud project, no Supabase link, no remote db commands, no actual ERP data.
set -euo pipefail
for cmd in supabase docker node; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "FAIL: cần cài $cmd trên máy kiểm thử." >&2; exit 2
  fi
done
if ! docker info >/dev/null 2>&1; then
  echo "FAIL: Docker chưa khởi động hoặc chưa cấp quyền." >&2; exit 2
fi
root="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d /tmp/mynh-pr81-local.XXXXXX)"
started=0
cleanup(){
  if [ "$started" = 1 ]; then
    (cd "$work" && supabase stop --no-backup >/dev/null 2>&1) || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT
# Clear any remote auth/config from this process to prevent accidental linkage.
unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID
cd "$work"
supabase init
# Local containers (Auth, REST, Postgres). Never invoke link/db push.
supabase start
started=1
id="$(sed -n 's/^project_id[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' supabase/config.toml | head -1)"
if [ -z "$id" ]; then echo "FAIL: không tìm thấy local project id" >&2; exit 3; fi
container="supabase_db_$id"
if ! docker ps --format '{{.Names}}' | grep -Fxq "$container"; then
  echo "FAIL: không tìm thấy đúng container Postgres local $container" >&2; exit 3
fi
echo "Áp dụng schema giả lập cục bộ (không phải schema ERP Production)..."
docker exec -i "$container" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < "$root/scripts/qa/pr81-local-fixture.sql"
echo "Thử chạy đúng SQL 0070 và 0071 trên PostgreSQL local..."
docker exec -i "$container" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < "$root/supabase/migrations/0070_persistent_failed_delivery_reminders.sql"
docker exec -i "$container" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < "$root/supabase/migrations/0071_operational_system_notifications.sql"
# Supabase CLI reports only loopback URLs/keys for these disposable containers.
# Do not print credentials or copy them into the repository.
set -a
eval "$(supabase status -o env)"
set +a
export PR81_QA_CONTAINER="$container"
export PR81_QA_LOCAL_ONLY=1
node "$root/scripts/qa/pr81-local-jwt-qa.mjs"
echo "KẾT QUẢ: kiểm thử Auth JWT + SQL 0070/0071 cục bộ kết thúc."
echo "Chưa kiểm thử tích hợp ERP nhận hàng/chuyển ship, vì fixture không chứa toàn bộ schema Production."
