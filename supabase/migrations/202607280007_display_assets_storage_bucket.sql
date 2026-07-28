-- Public-read bucket for Live Display background images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('display-assets', 'display-assets', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Uploads/reads happen through the service-role client on the server, so no
-- anon/authenticated storage policies are required. Public read is served by
-- the bucket's public flag.
