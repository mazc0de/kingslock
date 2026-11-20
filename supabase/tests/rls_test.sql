-- Security acceptance tests for the migrations (HANDOFF §8).
-- Run: see supabase/tests/run.sh
\set ON_ERROR_STOP on
\set QUIET on

create or replace function pg_temp.claims(p_sub uuid, p_aal text, p_totp_age int) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'aal', p_aal,
    'amr', case when p_totp_age is null then '[{"method":"password","timestamp":1}]'::jsonb
                else jsonb_build_array(jsonb_build_object('method','totp','timestamp', extract(epoch from now())::bigint - p_totp_age)) end
  )::text, false)
$$;

-- Expect a statement to fail with a message containing p_expected.
create or replace function pg_temp.expect_error(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: expected error % for: %', p_expected, p_sql;
exception when others then
  if sqlerrm like 'FAIL:%' or position(p_expected in sqlerrm) = 0 then
    raise exception 'FAIL: got "%" (wanted %) for: %', sqlerrm, p_expected, p_sql;
  end if;
end $$;

create or replace function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if not p_cond then raise exception 'FAIL: %', p_name; end if;
  raise notice 'ok - %', p_name;
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'owner@x.io'),
  ('00000000-0000-0000-0000-00000000000b', 'intruder@x.io');
insert into auth.mfa_factors (user_id, factor_type, status) values
  ('00000000-0000-0000-0000-00000000000a', 'totp', 'verified');

\set owner '''00000000-0000-0000-0000-00000000000a'''
\set intruder '''00000000-0000-0000-0000-00000000000b'''
\set wk '''AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'''

set role anon;
select pg_temp.ok(public.vault_initialized() = false, 'anon: vault_initialized() is false before setup');
select pg_temp.expect_error($$select public.create_platform(gen_random_uuid(), 'x')$$, 'permission denied');
select pg_temp.expect_error($$select * from public.platforms$$, 'permission denied');

set role authenticated;
-- Setup guards
select pg_temp.claims(:owner, 'aal1', null);
select pg_temp.expect_error($$select public.create_vault_profile('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')$$, 'MFA_REQUIRED');
select pg_temp.claims(:owner, 'aal2', 5);
select pg_temp.expect_error($$select public.create_vault_profile('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')$$, 'NEED_TWO_2FA_DEVICES');
reset role;
insert into auth.mfa_factors (user_id, factor_type, status) values (:owner, 'totp', 'verified');
set role authenticated;
select pg_temp.claims(:owner, 'aal2', 5);
select public.create_vault_profile(:wk);
select pg_temp.ok(public.vault_initialized(), 'owner: vault created with 2 verified 2FA devices');

-- Second user cannot create a second Vault
reset role;
insert into auth.mfa_factors (user_id, factor_type, status) values (:intruder, 'totp', 'verified'), (:intruder, 'totp', 'verified');
set role authenticated;
select pg_temp.claims(:intruder, 'aal2', 5);
select pg_temp.expect_error($$select public.create_vault_profile('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')$$, 'VAULT_EXISTS');
select pg_temp.expect_error($$select public.create_platform(gen_random_uuid(), 'x')$$, 'NO_VAULT');

-- Owner writes at aal2
select pg_temp.claims(:owner, 'aal2', 600);   -- logged in with 2FA 10 minutes ago
select public.create_platform('10000000-0000-0000-0000-000000000001', 'enc-platform');
select public.create_credential('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'enc-summary', 'enc-secret');
select pg_temp.ok((select count(*) from public.credentials) = 1, 'owner: create Credential at aal2 without step-up');

-- Direct table access is blocked
select pg_temp.expect_error($$select * from public.credential_secrets$$, 'permission denied');
select pg_temp.expect_error($$insert into public.platforms values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'x')$$, 'permission denied');
select pg_temp.expect_error($$update public.credentials set enc_summary = 'x'$$, 'permission denied');
select pg_temp.expect_error($$delete from public.credentials$$, 'permission denied');
select pg_temp.expect_error($$delete from public.activity_log$$, 'permission denied');
select pg_temp.expect_error($$update public.activity_log set event = 'x'$$, 'permission denied');
select pg_temp.expect_error($$insert into public.activity_log (owner_id, event) values ('00000000-0000-0000-0000-00000000000a', 'fake')$$, 'permission denied');

-- Grace Window: sensitive actions need a TOTP verification <= 120s old
select pg_temp.expect_error($$select public.reveal_secret('20000000-0000-0000-0000-000000000001')$$, 'STEP_UP_REQUIRED');
select pg_temp.expect_error($$select public.update_credential('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a', 'b')$$, 'STEP_UP_REQUIRED');
select pg_temp.expect_error($$select public.delete_credential('20000000-0000-0000-0000-000000000001')$$, 'STEP_UP_REQUIRED');
select pg_temp.expect_error($$select public.export_vault()$$, 'STEP_UP_REQUIRED');
select pg_temp.expect_error($$select public.change_wrapped_vault_key('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')$$, 'STEP_UP_REQUIRED');
select pg_temp.claims(:owner, 'aal1', 5);
select pg_temp.expect_error($$select public.reveal_secret('20000000-0000-0000-0000-000000000001')$$, 'MFA_REQUIRED');
select pg_temp.ok((select count(*) from public.credentials) = 0, 'aal1 session sees no Credentials');

select pg_temp.claims(:owner, 'aal2', 30);    -- verified 30s ago
select pg_temp.ok(public.reveal_secret('20000000-0000-0000-0000-000000000001') = 'enc-secret', 'owner: reveal_secret works inside Grace Window');
select pg_temp.ok((select count(*) from public.activity_log where event = 'credential.reveal') = 1, 'reveal is written to Activity Log');
select pg_temp.ok(public.export_vault() -> 'credentials' -> 0 ->> 'enc_secret' = 'enc-secret', 'export_vault returns ciphertext');
select pg_temp.ok((select count(*) from public.activity_log where event = 'vault.export') = 1, 'export is written to Activity Log');

-- Platform with Credentials cannot be deleted
select pg_temp.expect_error($$select public.delete_platform('10000000-0000-0000-0000-000000000001')$$, 'PLATFORM_NOT_EMPTY');

-- Intruder (other user) cannot touch Owner data even at aal2 + fresh
select pg_temp.claims(:intruder, 'aal2', 5);
select pg_temp.expect_error($$select public.reveal_secret('20000000-0000-0000-0000-000000000001')$$, 'NO_VAULT');
select pg_temp.ok((select count(*) from public.credentials) = 0, 'intruder sees no Credentials');
select pg_temp.ok((select count(*) from public.vault_profile) = 0, 'intruder sees no vault_profile');

-- Owner edits, moves, deletes
select pg_temp.claims(:owner, 'aal2', 30);
select public.create_platform('10000000-0000-0000-0000-000000000002', 'enc-platform-2');
select public.update_credential('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'enc-summary-2', 'enc-secret-2');
select pg_temp.ok((select platform_id from public.credentials) = '10000000-0000-0000-0000-000000000002', 'owner: Credential moved to another Platform');
select public.delete_platform('10000000-0000-0000-0000-000000000001');
select public.delete_credential('20000000-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) from public.credentials) = 0, 'owner: Credential deleted');
reset role;
select pg_temp.ok((select count(*) from public.credential_secrets) = 0, 'secret cascaded on delete');
set role authenticated;
select pg_temp.claims(:owner, 'aal2', 30);
select pg_temp.expect_error($$select public.log_client_event('credential.reveal')$$, 'INVALID_EVENT');
select public.log_client_event('auth.login');

-- Minimum two 2FA devices once the Vault exists
reset role;
select pg_temp.expect_error($$delete from auth.mfa_factors where id = (select id from auth.mfa_factors where user_id = '00000000-0000-0000-0000-00000000000a' limit 1)$$, 'MIN_TWO_2FA_DEVICES');
insert into auth.mfa_factors (user_id, factor_type, status) values (:owner, 'totp', 'verified');
delete from auth.mfa_factors where id = (select id from auth.mfa_factors where user_id = :owner limit 1);
select pg_temp.ok((select count(*) from auth.mfa_factors where user_id = :owner) = 2, 'third device can be removed, leaving two');
delete from auth.users where id = :owner;
select pg_temp.ok((select count(*) from public.vault_profile) = 0, 'deleting the Owner cascades without trigger blocking');

\echo ALL TESTS PASSED
