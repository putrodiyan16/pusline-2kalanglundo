
-- Roles
create type public.app_role as enum ('student','teacher');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  class_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Auto-create profile + default student role
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, class_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.raw_user_meta_data->>'class_name');
  insert into public.user_roles (user_id, role) values (new.id, 'student');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Books
create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  isbn text,
  category text,
  description text,
  cover_url text,
  total_copies int not null default 1,
  available_copies int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.books enable row level security;

-- Loans
create type public.loan_status as enum ('pending','approved','borrowed','returned','rejected');

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.loan_status not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  due_date date,
  returned_at timestamptz,
  notes text
);
alter table public.loans enable row level security;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger books_touch before update on public.books
  for each row execute function public.touch_updated_at();

-- RLS: profiles
create policy "profiles read own or teacher" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(),'teacher'));
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid());
create policy "teacher update any profile" on public.profiles for update to authenticated
  using (public.has_role(auth.uid(),'teacher'));

-- RLS: user_roles
create policy "roles read own or teacher" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'teacher'));
create policy "teacher manage roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'teacher'))
  with check (public.has_role(auth.uid(),'teacher'));

-- RLS: books
create policy "books read all authenticated" on public.books for select to authenticated using (true);
create policy "teacher manage books" on public.books for all to authenticated
  using (public.has_role(auth.uid(),'teacher'))
  with check (public.has_role(auth.uid(),'teacher'));

-- RLS: loans
create policy "loans read own or teacher" on public.loans for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'teacher'));
create policy "student create own loan" on public.loans for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy "teacher manage loans" on public.loans for all to authenticated
  using (public.has_role(auth.uid(),'teacher'))
  with check (public.has_role(auth.uid(),'teacher'));

-- Seed sample books
insert into public.books (title, author, category, description, total_copies, available_copies) values
('Bumi Manusia','Pramoedya Ananta Toer','Sastra','Tetralogi Pulau Buru jilid pertama.',3,3),
('Laskar Pelangi','Andrea Hirata','Novel','Kisah anak-anak Belitung dan semangat pendidikan.',2,2),
('Sapiens','Yuval Noah Harari','Sejarah','Riwayat singkat umat manusia.',2,2),
('Filosofi Teras','Henry Manampiring','Filsafat','Pengantar filsafat Stoa untuk hidup modern.',4,4),
('Atomic Habits','James Clear','Pengembangan Diri','Membangun kebiasaan baik sedikit demi sedikit.',5,5),
('Negeri 5 Menara','Ahmad Fuadi','Novel','Inspirasi mantra man jadda wajada.',2,2);
