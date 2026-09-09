-- =============================================================================
-- Paso `tenant` (docs/observabilidad-opentelemetry.md §6, punto 1).
--
-- OPCIONAL / follow-up. El código del Worker ya escribe `tenant` en
-- chat_sessions.metadata (columna jsonb, sin migración). Este script añade
-- `tenant` como COLUMNA de primera clase en las dos tablas del chat para poder
-- filtrar/agrupar por marca en SQL sin desanidar el jsonb — útil cuando entre
-- Funeraria del Zulia (`fdz`).
--
-- Correr en el SQL editor de Supabase (proyecto naebpcyphdcopndqovie).
-- Es idempotente (IF NOT EXISTS) y no bloquea escrituras (default constante).
-- =============================================================================

alter table public.chat_sessions
  add column if not exists tenant text not null default 'lh';

alter table public.chat_turns
  add column if not exists tenant text not null default 'lh';

-- Índices para consultas por marca (dashboards de analítica de negocio).
create index if not exists chat_sessions_tenant_idx on public.chat_sessions (tenant);
create index if not exists chat_turns_tenant_idx    on public.chat_turns    (tenant);

-- Backfill explícito (redundante con el default, pero deja el intent claro).
update public.chat_sessions set tenant = 'lh' where tenant is null;
update public.chat_turns    set tenant = 'lh' where tenant is null;
