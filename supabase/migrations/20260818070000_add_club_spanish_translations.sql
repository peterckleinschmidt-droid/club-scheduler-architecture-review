alter table public.club_offerings
  add column if not exists club_title_es text,
  add column if not exists section_label_es text,
  add column if not exists description_es text,
  add column if not exists spanish_translation_ready boolean not null default false,
  add column if not exists spanish_translation_source_hash text,
  add column if not exists spanish_translation_source text,
  add column if not exists spanish_translation_updated_at timestamptz;

comment on column public.club_offerings.spanish_translation_ready is
  'True when staff reviewed the Spanish text for the current English student-facing text.';
