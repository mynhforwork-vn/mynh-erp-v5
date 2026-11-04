-- SQL 0073 (staged): audit manual device changes + secure on-demand SPC copy.
-- Requires separate Production approval. Never migrate during PR/Preview.
BEGIN;

CREATE OR REPLACE FUNCTION public.audit_manual_account_device_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_key text;
  v_action text;
  v_before text;
  v_after text;
BEGIN
  IF NEW.source IS DISTINCT FROM 'MANUAL' OR NEW.device_key NOT IN ('manual-mobile','manual-browser') THEN
    RETURN NEW;
  END IF;
  v_key := CASE WHEN NEW.device_key='manual-mobile' THEN 'device' ELSE 'browser' END;
  v_action := CASE WHEN NEW.device_key='manual-mobile' THEN 'UPDATE_DEVICE' ELSE 'UPDATE_BROWSER' END;
  IF TG_OP='UPDATE' THEN
    v_before := CASE WHEN OLD.is_active THEN NULLIF(btrim(coalesce(OLD.device_name,'')),'') ELSE NULL END;
  ELSE
    -- Existing legacy manual-primary is still active when first migrated to split fields.
    SELECT nullif(btrim(COALESCE(
      CASE WHEN NEW.device_key='manual-browser' THEN d.browser_name
           WHEN d.device_type<>'BROWSER_PROFILE' THEN d.device_name ELSE NULL END,'')), '')
    INTO v_before
    FROM public.purchase_account_devices d
    WHERE d.erp_user_id=NEW.erp_user_id AND d.device_key='manual-primary'
      AND d.is_active IS TRUE AND d.source='MANUAL'
    LIMIT 1;
  END IF;
  v_after := CASE WHEN NEW.is_active THEN NULLIF(btrim(coalesce(NEW.device_name,'')),'') ELSE NULL END;
  IF v_before IS DISTINCT FROM v_after THEN
    INSERT INTO public.audit_logs(actor_user_id,module,action,entity_type,entity_id,
      old_value,new_value,source)
    VALUES(auth.uid(),'USERS',v_action,'ERP_USER',NEW.erp_user_id::text,
      jsonb_build_object(v_key,v_before),jsonb_build_object(v_key,v_after),'USER');
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.audit_manual_account_device_change() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS trg_audit_manual_account_device_change ON public.purchase_account_devices;
CREATE TRIGGER trg_audit_manual_account_device_change
AFTER INSERT OR UPDATE ON public.purchase_account_devices
FOR EACH ROW EXECUTE FUNCTION public.audit_manual_account_device_change();

CREATE OR REPLACE FUNCTION public.get_erp_user_spc_for_copy(p_user_id uuid,p_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_secret_id uuid;
  v_secret text;
BEGIN
  IF auth.uid() IS NULL OR public.current_erp_role() NOT IN ('admin','operator') THEN
    RAISE EXCEPTION 'Không có quyền sao chép' USING ERRCODE='42501';
  END IF;
  IF p_kind NOT IN ('SPC_ST','SPC_F') THEN
    RAISE EXCEPTION 'Loại SPC không hợp lệ';
  END IF;

  SELECT CASE WHEN p_kind='SPC_ST' THEN u.spc_st_secret_id ELSE u.spc_f_secret_id END
  INTO v_secret_id
  FROM public.erp_users u
  WHERE u.id=p_user_id AND u.archived_at IS NULL;

  IF v_secret_id IS NULL THEN RAISE EXCEPTION 'Không có SPC cần sao chép'; END IF;
  SELECT v.decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets v WHERE v.id=v_secret_id;
  IF v_secret IS NULL THEN RAISE EXCEPTION 'Không thể truy xuất SPC'; END IF;

  -- Audit only the action metadata; do not put session values into logs.
  INSERT INTO public.audit_logs(actor_user_id,module,action,entity_type,entity_id,source)
  VALUES(auth.uid(),'USERS',CASE WHEN p_kind='SPC_ST' THEN 'COPY_SPC_ST' ELSE 'COPY_SPC_F' END,
    'ERP_USER',p_user_id::text,'USER');

  RETURN v_secret;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_erp_user_spc_for_copy(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_user_spc_for_copy(uuid,text) TO authenticated;

COMMIT;
