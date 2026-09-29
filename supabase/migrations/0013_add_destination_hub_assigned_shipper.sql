alter table public.destination_hub_configs
  add column if not exists shipper_name text,
  add column if not exists shipper_phone text;

update public.destination_hub_configs
set shipper_name=case hub_code
      when 'HN-Hai Bà Trưng' then 'Shipper Demo HN'
      when 'HCM-Bình Thạnh' then 'Shipper Demo HCM'
      when 'DN-Hải Châu' then 'Shipper Demo ĐN'
      else shipper_name
    end,
    shipper_phone=case hub_code
      when 'HN-Hai Bà Trưng' then '0900000011'
      when 'HCM-Bình Thạnh' then '0900000022'
      when 'DN-Hải Châu' then '0900000033'
      else shipper_phone
    end,
    updated_at=now()
where hub_code in ('HN-Hai Bà Trưng','HCM-Bình Thạnh','DN-Hải Châu')
  and shipper_name is null;
