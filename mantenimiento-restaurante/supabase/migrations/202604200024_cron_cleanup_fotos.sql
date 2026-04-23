select cron.schedule(
  'cleanup-fotos-resueltas',
  '0 15 10 * *',
  $$
    select net.http_post(
      url := 'https://vejitrxfbdhgqkqbtrrq.supabase.co/functions/v1/cleanup-fotos',
      headers := '{"Content-Type": "application/json", "x-cleanup-token": "mantto-cleanup-2024"}'::jsonb,
      body := '{}'::jsonb
    )
  $$
);
