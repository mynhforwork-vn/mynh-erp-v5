-- SQL 0074 — atomic User lifecycle + audit. Staged only; requires separate
-- Production migration approval. No automatic backfill of historical audit rows.
-- Public audit_logs intentionally has SELECT policy only: do NOT grant direct INSERT.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_erp_user_archived(
  p_user_ids uuid[],
  p_archive boolean,
  p_bulk boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text := public.current_erp_role();
  v_ids uuid[];
  v_user record;
  v_changed_at timestamptz := clock_timestamp();
  v_before jsonb;
  v_after jsonb;
  v_count integer := 0;
BEGIN
  IF v_actor IS NULL OR coalesce(v_role,'') NOT IN ('admin','operator') THEN
    RAISE EXCEPTION 'Không có quyền lưu trữ hoặc khôi phục User' USING ERRCODE='42501';
  END IF;

  IF p_archive IS NULL OR p_bulk IS NULL
    OR p_user_ids IS NULL OR cardinality(p_user_ids) = 0
    OR cardinality(p_user_ids) > 200
  THEN
    RAISE EXCEPTION 'Chỉ được chọn từ 1 đến 200 User';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(p_user_ids) AS ids(id) WHERE id IS NULL) THEN
    RAISE EXCEPTION 'Danh sách User chứa ID không hợp lệ';
  END IF;

  -- Lock rows in a stable order. A rejected row or audit failure rolls back
  -- ALL earlier changes in the same RPC transaction.
  SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids
  FROM unnest(p_user_ids) AS ids(id);

  FOR v_user IN
    SELECT id, username, status, archived_at
    FROM public.erp_users
    WHERE id = ANY(v_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF p_archive AND v_user.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Có User đã được lưu trữ. Hãy tải lại danh sách trước khi thao tác.';
    END IF;
    IF NOT p_archive AND v_user.archived_at IS NULL THEN
      RAISE EXCEPTION 'Có User chưa được lưu trữ. Hãy tải lại danh sách trước khi thao tác.';
    END IF;

    v_before := jsonb_build_object(
      'archived_at',v_user.archived_at,'username',v_user.username,'status',v_user.status
    );
    v_after := jsonb_build_object(
      'archived_at',CASE WHEN p_archive THEN v_changed_at ELSE NULL::timestamptz END,
      'username',v_user.username,'status',v_user.status
    );
    IF p_bulk THEN
      v_after := v_after || jsonb_build_object('bulk',true);
    END IF;

    UPDATE public.erp_users
    SET archived_at=CASE WHEN p_archive THEN v_changed_at ELSE NULL::timestamptz END,
        archived_by=CASE WHEN p_archive THEN v_actor ELSE NULL::uuid END
    WHERE id=v_user.id;

    INSERT INTO public.audit_logs(
      actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source
    ) VALUES (
      v_actor,'USERS',CASE WHEN p_archive THEN 'ARCHIVE_USER' ELSE 'RESTORE_USER' END,
      'ERP_USER',v_user.id::text,v_before,v_after,'USER'
    );
    v_count := v_count+1;
  END LOOP;

  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Có User không tồn tại hoặc không có quyền truy cập';
  END IF;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_erp_user_archived(uuid[],boolean,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_erp_user_archived(uuid[],boolean,boolean)
  TO authenticated;

COMMIT;
