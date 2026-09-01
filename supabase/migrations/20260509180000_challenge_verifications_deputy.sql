-- Deputy who performs the challenge (Trial by combat)
alter table public.challenge_verifications
  add column if not exists deputy_id text;

alter table public.challenge_verifications
  add column if not exists deputy_name text;
