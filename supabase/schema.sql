-- BADMINGTONG V1 ONLINE schema
create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null,
  start_time time not null default '19:00',
  end_time time not null default '21:00',
  location text not null,
  capacity integer not null default 22 check (capacity > 0),
  price integer not null default 15000 check (price >= 0),
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED','ARCHIVED')),
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null unique default ('BD' || upper(substr(encode(gen_random_bytes(5),'hex'),1,8))),
  session_id uuid not null references public.sessions(id),
  name text not null,
  whatsapp text not null,
  amount integer not null,
  status text not null default 'HOLD' check (status in ('HOLD','MENUNGGU_VERIFIKASI','LUNAS','CANCELLED','EXPIRED')),
  hold_expires_at timestamptz not null,
  payment_method text check (payment_method in ('Transfer Bank','GoPay')),
  sender_name text,
  proof_path text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists bookings_session_status_idx on public.bookings(session_id,status);
create index if not exists bookings_expiry_idx on public.bookings(hold_expires_at) where status='HOLD';

create table if not exists public.settings (
  id boolean primary key default true check (id),
  bank_name text not null default 'BCA',
  bank_account text not null default 'ISI_NOMOR_REKENING',
  bank_holder text not null default 'BADMINGTONG',
  gopay_number text not null default 'ISI_NOMOR_GOPAY',
  whatsapp_number text not null default ''
);
insert into public.settings(id) values(true) on conflict do nothing;

create table if not exists public.owner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_owner boolean not null default false
);

alter table public.sessions enable row level security;
alter table public.bookings enable row level security;
alter table public.settings enable row level security;
alter table public.owner_profiles enable row level security;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.owner_profiles where user_id=auth.uid() and is_owner=true); $$;

create policy "public read open sessions" on public.sessions for select to anon, authenticated using (status='OPEN' or public.is_owner());
create policy "owner manages sessions" on public.sessions for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner reads all bookings" on public.bookings for select to authenticated using (public.is_owner());
create policy "owner updates bookings" on public.bookings for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner reads settings" on public.settings for select to authenticated using (public.is_owner());
create policy "public can read payment instructions" on public.settings for select to anon using (true);
create policy "owner updates settings" on public.settings for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner manages owner profiles" on public.owner_profiles for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Public-facing view exposes only confirmed participants, never phone numbers or proof paths.
create or replace view public.public_paid_bookings as
select id, booking_code, name, status, amount, paid_at, session_id
from public.bookings where status='LUNAS';
grant select on public.sessions, public.settings, public.public_paid_bookings to anon, authenticated;
grant select, update on public.bookings to authenticated;
grant select, insert, update, delete on public.owner_profiles to authenticated;

-- Create a booking hold under a row lock, preventing overbooking.
create or replace function public.create_booking_hold(p_name text,p_whatsapp text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare s public.sessions%rowtype; active_count integer; b public.bookings%rowtype;
begin
  if length(trim(coalesce(p_name,''))) not between 1 and 80 then raise exception 'Nama wajib diisi (maksimal 80 karakter).'; end if;
  if length(trim(coalesce(p_whatsapp,''))) not between 8 and 25 then raise exception 'Nomor WhatsApp tidak valid.'; end if;
  select * into s from public.sessions where status='OPEN' and session_date >= current_date order by session_date,start_time limit 1 for update;
  if not found then raise exception 'Belum ada sesi booking yang dibuka.'; end if;
  update public.bookings set status='EXPIRED' where session_id=s.id and status='HOLD' and hold_expires_at <= now();
  select count(*) into active_count from public.bookings where session_id=s.id and status in ('HOLD','MENUNGGU_VERIFIKASI','LUNAS');
  if active_count >= s.capacity then raise exception 'Maaf, slot sudah penuh.'; end if;
  insert into public.bookings(session_id,name,whatsapp,amount,hold_expires_at)
  values(s.id,trim(p_name),trim(p_whatsapp),s.price,now()+interval '10 minutes') returning * into b;
  return jsonb_build_object('id',b.id,'booking_code',b.booking_code,'amount',b.amount,'hold_expires_at',b.hold_expires_at,'session_id',b.session_id);
end $$;
grant execute on function public.create_booking_hold(text,text) to anon, authenticated;

create or replace function public.submit_payment_proof(p_booking_id uuid,p_method text,p_sender text,p_proof_path text)
returns void language plpgsql security definer set search_path=public
as $$
declare b public.bookings%rowtype;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if not found or b.status <> 'HOLD' or b.hold_expires_at <= now() then raise exception 'Hold sudah habis. Silakan booking ulang.'; end if;
 if p_method not in ('Transfer Bank','GoPay') then raise exception 'Metode pembayaran tidak valid.'; end if;
 if length(trim(coalesce(p_sender,'')))=0 then raise exception 'Nama pengirim wajib diisi.'; end if;
 if p_proof_path not like b.id::text || '/%' then raise exception 'Path bukti tidak valid.'; end if;
 update public.bookings set payment_method=p_method,sender_name=trim(p_sender),proof_path=p_proof_path,status='MENUNGGU_VERIFIKASI' where id=b.id;
end $$;
grant execute on function public.submit_payment_proof(uuid,text,text,text) to anon, authenticated;

create or replace function public.owner_verify_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
 if not public.is_owner() then raise exception 'Akses Owner diperlukan.'; end if;
 update public.bookings set status='LUNAS',paid_at=now()
 where id=p_booking_id and status='MENUNGGU_VERIFIKASI';
 if not found then raise exception 'Booking tidak ditemukan atau sudah diproses.'; end if;
end $$;
grant execute on function public.owner_verify_booking(uuid) to authenticated;

-- Private bucket: upload allowed only to a folder named with a valid booking UUID is NOT
-- sufficient authorization by itself. For production, restrict uploads via Edge Function
-- or add short-lived upload-token RPC. This starter creates a private bucket; do not
-- loosen it to public. See README for the secure upload follow-up before public launch.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-proofs','payment-proofs',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

-- Security-definer helper lets the Storage policy check a booking without
-- granting anonymous users direct SELECT access to private booking rows.
create or replace function public.can_upload_booking_proof(p_object_name text)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.bookings b
    where b.id::text = split_part(p_object_name,'/',1)
      and b.status = 'HOLD'
      and b.hold_expires_at > now()
  );
$$;
grant execute on function public.can_upload_booking_proof(text) to anon, authenticated;

-- Anonymous members may upload only into their own booking UUID folder while its
-- 10-minute hold is active. They cannot list or read uploaded proof files.
create policy "member uploads proof for active hold"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'payment-proofs'
  and public.can_upload_booking_proof(name)
);

-- Only Owner can read proof objects (for signed URL generation in the Owner UI).
create policy "owner reads payment proofs"
on storage.objects for select to authenticated
using (bucket_id = 'payment-proofs' and public.is_owner());

-- Seed one sample session (change date/location/price as needed).
insert into public.sessions(session_date,start_time,end_time,location,capacity,price,status)
select current_date + ((4-extract(dow from current_date)::int+7)%7), '19:00','21:00','GOR Jatinangor',22,15000,'OPEN'
where not exists(select 1 from public.sessions);
