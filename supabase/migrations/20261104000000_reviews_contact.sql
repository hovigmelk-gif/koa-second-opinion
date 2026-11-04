-- Reviews (public read + create) and contact messages (public create only; read in the dashboard).
create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  role       text check (char_length(role) <= 100),
  rating     int  not null check (rating between 1 and 5),
  comment    text not null check (char_length(btrim(comment)) between 1 and 1000)
);
create index reviews_created_at_idx on public.reviews (created_at desc);

create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  email      text not null check (char_length(email) <= 254 and email ~ '^\S+@\S+\.\S+$'),
  message    text not null check (char_length(btrim(message)) between 1 and 2000)
);

alter table public.reviews          enable row level security;
alter table public.contact_messages enable row level security;

-- Table privileges: anon gets exactly these, nothing else (Supabase grants all by default).
revoke all on public.reviews, public.contact_messages from anon, authenticated;
grant select, insert on public.reviews to anon;
grant insert on public.contact_messages to anon;

create policy "anon read reviews"   on public.reviews          for select to anon using (true);
create policy "anon create reviews" on public.reviews          for insert to anon with check (true);
create policy "anon send message"   on public.contact_messages for insert to anon with check (true);
-- No select/update/delete policies: with RLS on, those are denied for anon. The dashboard (service role) bypasses RLS.
