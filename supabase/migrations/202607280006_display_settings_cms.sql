-- Live Display (top spender) CMS settings.
create table if not exists public.display_settings (
  id int primary key default 1 check (id = 1),
  event_title text not null default 'PRIMA Executive Gathering 2026',
  headline text not null default 'Top spender live',
  tagline text not null default 'The room''s leaders.',
  background_color text not null default '#101613',
  text_color text not null default '#f7f5ed',
  accent_color text not null default '#a66616',
  background_image_url text,
  leaderboard_limit int not null default 10 check (leaderboard_limit between 3 and 50),
  show_company boolean not null default true,
  show_booth_progress boolean not null default true,
  show_ticker boolean not null default true,
  ticker_text text,
  refresh_seconds int not null default 30 check (refresh_seconds between 5 and 300),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

insert into public.display_settings (id) values (1) on conflict (id) do nothing;

alter table public.display_settings enable row level security;
revoke all on table public.display_settings from anon, authenticated;
