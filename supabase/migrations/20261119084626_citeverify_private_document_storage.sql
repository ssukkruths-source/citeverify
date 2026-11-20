insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv-documents', 'CiteVerify private documents', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='CiteVerify owners read private documents') then
    create policy "CiteVerify owners read private documents" on storage.objects
      for select to authenticated
      using (bucket_id = 'cv-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='CiteVerify owners upload private documents') then
    create policy "CiteVerify owners upload private documents" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'cv-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='CiteVerify owners update private documents') then
    create policy "CiteVerify owners update private documents" on storage.objects
      for update to authenticated
      using (bucket_id = 'cv-documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'cv-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='CiteVerify owners delete private documents') then
    create policy "CiteVerify owners delete private documents" on storage.objects
      for delete to authenticated
      using (bucket_id = 'cv-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;
