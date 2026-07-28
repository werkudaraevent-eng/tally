# Supabase setup

1. Create project in Supabase Dashboard.
2. Open SQL Editor.
3. Run `migrations/202607270001_initial_schema.sql`.
4. Run `seed.sql` for local demo participants.
5. Confirm with:

```sql
select id, code from booths order by id;
select qr_code, name from participants order by qr_code;
```

Expected: 6 booths and 4 participants.

The project uses Supabase Postgres. Supabase Auth/session and custom event `users` role mapping are implemented next. Do not create users with plaintext PINs.
