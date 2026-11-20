-- =============================================================================
-- Kingslock — initial schema
--
-- Security model (see docs/adr):
--   * Zero-knowledge: every content column is ciphertext produced in the browser
--     (ADR-0001). The database never sees plaintext or keys.
--   * Clients may only SELECT from tables. Every write goes through a
--     SECURITY DEFINER function that checks ownership, aal2, and — for sensitive
--     actions — a fresh 2FA verification (Grace Window, ADR-0002).
--   * credential_secrets has no SELECT access at all; secrets are read only via
--     reveal_secret() / export_vault(), which always write the Activity Log
--     (ADR-0005).
--   * Exactly one Owner / Vault (singleton constraint).
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.vault_profile (
  owner_id           uuid primary key references auth.users (id) on delete cascade,
  singleton          boolean not null default true unique check (singleton),
  kdf_version        smallint not null default 1 check (kdf_version >= 1),
  wrapped_vault_key  text not null check (length(wrapped_vault_key) between 40 and 200),
  auto_lock_minutes  smallint not null default 5 check (auto_lock_minutes in (1, 5, 15)),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.vault_profile is 'One row: the single Owner. Holds the Vault Key wrapped by the Master Password-derived key.';

create table public.platforms (
  id          uuid primary key,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  enc_data    text not null check (length(enc_data) between 1 and 8000),   -- {name, url?}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.credentials (
  id           uuid primary key,
  owner_id     uuid not null references auth.users (id) on delete cascade,
  -- RESTRICT: a Platform that still has Credentials cannot be deleted.
  platform_id  uuid not null references public.platforms (id) on delete restrict,
  enc_summary  text not null check (length(enc_summary) between 1 and 8000),  -- {login}
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index credentials_platform_id_idx on public.credentials (platform_id);
create index credentials_owner_id_idx on public.credentials (owner_id);

create table public.credential_secrets (
  credential_id  uuid primary key references public.credentials (id) on delete cascade,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  enc_secret     text not null check (length(enc_secret) between 1 and 40000),  -- {password, notes?, previousPassword?}
  updated_at     timestamptz not null default now()
);

create table public.activity_log (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  event       text not null,
  target_id   uuid,          -- Credential / Platform id; never a name (names are encrypted)
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index activity_log_owner_created_idx on public.activity_log (owner_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Privileges: read-only tables, no access to secrets
-- -----------------------------------------------------------------------------

alter table public.vault_profile      enable row level security;
alter table public.platforms          enable row level security;
alter table public.credentials        enable row level security;
alter table public.credential_secrets enable row level security;
alter table public.activity_log       enable row level security;

revoke all on public.vault_profile, public.platforms, public.credentials,
              public.credential_secrets, public.activity_log
  from public, anon, authenticated;

grant select on public.vault_profile, public.platforms, public.credentials, public.activity_log
  to authenticated;
-- credential_secrets: intentionally NO grant (ADR-0005).

-- -----------------------------------------------------------------------------
-- Private helpers
-- -----------------------------------------------------------------------------

create or replace function private.is_aal2()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- True when the most recent TOTP verification in this session's JWT is at most
-- max_age_seconds old. Supabase Auth refreshes the 'totp' amr timestamp each
-- time mfa.verify succeeds, so this implements the Grace Window (ADR-0002).
create or replace function private.totp_fresh(max_age_seconds int default 120)
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(
    (select max((e ->> 'timestamp')::bigint)
       from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as e
      where e ->> 'method' = 'totp'),
    0
  ) >= extract(epoch from now())::bigint - max_age_seconds
$$;

create or replace function private.is_owner()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.vault_profile where owner_id = auth.uid())
$$;

create or replace function private.verified_totp_count(p_user_id uuid)
returns int
language sql stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from auth.mfa_factors
   where user_id = p_user_id
     and factor_type = 'totp'
     and status = 'verified'
$$;

-- Central guard for every RPC. Raises a stable error code the client can map.
create or replace function private.require_owner(p_require_fresh boolean)
returns uuid
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if not private.is_aal2() then
    raise exception 'MFA_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.vault_profile where owner_id = v_uid) then
    raise exception 'NO_VAULT' using errcode = 'P0001';
  end if;
  if p_require_fresh and not private.totp_fresh(120) then
    raise exception 'STEP_UP_REQUIRED' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

create or replace function private.user_agent()
returns text
language sql stable
set search_path = ''
as $$
  select left(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent', 300)
$$;

create or replace function private.log(p_owner uuid, p_event text, p_target uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (owner_id, event, target_id, user_agent)
  values (p_owner, p_event, p_target, private.user_agent())
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function private.is_aal2(), private.totp_fresh(int), private.is_owner()
  to authenticated;

-- -----------------------------------------------------------------------------
-- RLS (SELECT only)
-- -----------------------------------------------------------------------------

create policy "owner reads own profile" on public.vault_profile
  for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_aal2()));

create policy "owner reads own platforms" on public.platforms
  for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_aal2()) and (select private.is_owner()));

create policy "owner reads own credentials" on public.credentials
  for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_aal2()) and (select private.is_owner()));

create policy "owner reads own activity" on public.activity_log
  for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_aal2()) and (select private.is_owner()));

-- No policy on credential_secrets: nobody can SELECT it through the API.

-- -----------------------------------------------------------------------------
-- RPC: setup
-- -----------------------------------------------------------------------------

-- Public: lets the login page decide whether to show first-time setup.
create or replace function public.vault_initialized()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.vault_profile)
$$;

create or replace function public.create_vault_profile(p_wrapped_vault_key text, p_kdf_version smallint default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if not private.is_aal2() then
    raise exception 'MFA_REQUIRED' using errcode = 'P0001';
  end if;
  if private.verified_totp_count(v_uid) < 2 then
    raise exception 'NEED_TWO_2FA_DEVICES' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.vault_profile) then
    raise exception 'VAULT_EXISTS' using errcode = 'P0001';
  end if;

  insert into public.vault_profile (owner_id, kdf_version, wrapped_vault_key)
  values (v_uid, p_kdf_version, p_wrapped_vault_key);

  perform private.log(v_uid, 'vault.create');
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: settings
-- -----------------------------------------------------------------------------

create or replace function public.update_vault_settings(p_auto_lock_minutes smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_owner(true);
begin
  update public.vault_profile
     set auto_lock_minutes = p_auto_lock_minutes, updated_at = now()
   where owner_id = v_uid;
  perform private.log(v_uid, 'settings.update');
end;
$$;

-- Called by the Master Password change flow after the Supabase Auth password
-- (authKey) has been updated. Only the wrapping changes; the Vault Key and all
-- ciphertext stay the same.
create or replace function public.change_wrapped_vault_key(p_wrapped_vault_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_owner(true);
begin
  update public.vault_profile
     set wrapped_vault_key = p_wrapped_vault_key, updated_at = now()
   where owner_id = v_uid;
  perform private.log(v_uid, 'master_password.change');
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: platforms
-- -----------------------------------------------------------------------------

create or replace function public.create_platform(p_id uuid, p_enc_data text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_owner(false);
begin
  insert into public.platforms (id, owner_id, enc_data) values (p_id, v_uid, p_enc_data);
  perform private.log(v_uid, 'platform.create', p_id);
end;
$$;

create or replace function public.delete_platform(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_owner(true);
begin
  if not exists (select 1 from public.platforms where id = p_id and owner_id = v_uid) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.credentials where platform_id = p_id) then
    raise exception 'PLATFORM_NOT_EMPTY' using errcode = 'P0001';
  end if;
  delete from public.platforms where id = p_id and owner_id = v_uid;
  perform private.log(v_uid, 'platform.delete', p_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: credentials
-- -----------------------------------------------------------------------------

create or replace function public.create_credential(
  p_id uuid, p_platform_id uuid, p_enc_summary text, p_enc_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_owner(false);
begin
  if not exists (select 1 from public.platforms where id = p_platform_id and owner_id = v_uid) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.credentials (id, owner_id, platform_id, enc_summary)
  values (p_id, v_uid, p_platform_id, p_enc_summary);
  insert into public.credential_secrets (credential_id, owner_id, enc_secret)
  values (p_id, v_uid, p_enc_secret);
  perform private.log(v_uid, 'credential.create', p_id);
end;
$$;

create or replace function public.update_credential(
  p_id uuid, p_platform_id uuid, p_enc_summary text, p_enc_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_owner(true);
begin
  if not exists (select 1 from public.credentials where id = p_id and owner_id = v_uid) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.platforms where id = p_platform_id and owner_id = v_uid) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.credentials
     set platform_id = p_platform_id, enc_summary = p_enc_summary, updated_at = now()
   where id = p_id and owner_id = v_uid;
  update public.credential_secrets
     set enc_secret = p_enc_secret, updated_at = now()
   where credential_id = p_id and owner_id = v_uid;
  perform private.log(v_uid, 'credential.update', p_id);
end;
$$;

create or replace function public.delete_credential(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_owner(true);
begin
  delete from public.credentials where id = p_id and owner_id = v_uid;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform private.log(v_uid, 'credential.delete', p_id);
end;
$$;

-- The ONLY way to read a single secret. Always logged.
create or replace function public.reveal_secret(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_owner(true);
  v_secret text;
begin
  select enc_secret into v_secret
    from public.credential_secrets
   where credential_id = p_id and owner_id = v_uid;
  if v_secret is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform private.log(v_uid, 'credential.reveal', p_id);
  return v_secret;
end;
$$;

-- Full encrypted export (Export Vault). Always logged.
create or replace function public.export_vault()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_owner(true);
  v_result jsonb;
begin
  select jsonb_build_object(
    'kdf_version', p.kdf_version,
    'wrapped_vault_key', p.wrapped_vault_key,
    'platforms', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'enc_data', enc_data, 'created_at', created_at) order by created_at)
        from public.platforms where owner_id = v_uid), '[]'::jsonb),
    'credentials', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'platform_id', c.platform_id, 'enc_summary', c.enc_summary,
               'enc_secret', s.enc_secret, 'created_at', c.created_at) order by c.created_at)
        from public.credentials c
        join public.credential_secrets s on s.credential_id = c.id
       where c.owner_id = v_uid), '[]'::jsonb)
  )
  into v_result
  from public.vault_profile p
  where p.owner_id = v_uid;

  perform private.log(v_uid, 'vault.export');
  return v_result;
end;
$$;

-- Events that only the client can observe (successful login, import, 2FA
-- device changes). Restricted to a fixed list.
create or replace function public.log_client_event(p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_owner(false);
begin
  if p_event not in ('auth.login', 'vault.import', '2fa.add', '2fa.remove') then
    raise exception 'INVALID_EVENT' using errcode = 'P0001';
  end if;
  perform private.log(v_uid, p_event);
end;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges: authenticated only (vault_initialized also for anon)
-- -----------------------------------------------------------------------------

revoke all on function
  public.vault_initialized(),
  public.create_vault_profile(text, smallint),
  public.update_vault_settings(smallint),
  public.change_wrapped_vault_key(text),
  public.create_platform(uuid, text),
  public.delete_platform(uuid),
  public.create_credential(uuid, uuid, text, text),
  public.update_credential(uuid, uuid, text, text),
  public.delete_credential(uuid),
  public.reveal_secret(uuid),
  public.export_vault(),
  public.log_client_event(text)
from public, anon;

grant execute on function
  public.create_vault_profile(text, smallint),
  public.update_vault_settings(smallint),
  public.change_wrapped_vault_key(text),
  public.create_platform(uuid, text),
  public.delete_platform(uuid),
  public.create_credential(uuid, uuid, text, text),
  public.update_credential(uuid, uuid, text, text),
  public.delete_credential(uuid),
  public.reveal_secret(uuid),
  public.export_vault(),
  public.log_client_event(text)
to authenticated;

grant execute on function public.vault_initialized() to anon, authenticated;
