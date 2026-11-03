-- Run after schema.sql: public bucket for gym logos. Writes happen only through the upload-logo edge function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guild-logos', 'guild-logos', true, 307200, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
