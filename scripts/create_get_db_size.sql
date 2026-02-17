-- Function to get the current database size in bytes
create or replace function get_db_size()
returns bigint
language sql
security definer
as $$
  select pg_database_size(current_database());
$$;
