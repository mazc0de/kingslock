-- =============================================================================
-- Server-side guard: once the Vault exists, the Owner must always keep at
-- least two verified 2FA devices (ADR-0003). Blocks mfa.unenroll() of a
-- verified TOTP factor that would leave fewer than two.
--
-- This attaches a trigger to auth.mfa_factors (a Supabase-managed table). If
-- your project does not allow triggers on the auth schema, skip this file: the
-- client still enforces the rule, but it is then UI-only.
-- =============================================================================

create or replace function private.prevent_removing_required_2fa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.factor_type::text = 'totp'
     and old.status::text = 'verified'
     -- Skip when the whole user is being deleted (cascade): the parent row is already gone.
     and exists (select 1 from auth.users where id = old.user_id)
     and exists (select 1 from public.vault_profile where owner_id = old.user_id)
     and (select count(*)
            from auth.mfa_factors
           where user_id = old.user_id
             and factor_type::text = 'totp'
             and status::text = 'verified'
             and id <> old.id) < 2
  then
    raise exception 'MIN_TWO_2FA_DEVICES' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke all on function private.prevent_removing_required_2fa() from public, anon, authenticated;

drop trigger if exists prevent_removing_required_2fa on auth.mfa_factors;
create trigger prevent_removing_required_2fa
  before delete on auth.mfa_factors
  for each row execute function private.prevent_removing_required_2fa();
