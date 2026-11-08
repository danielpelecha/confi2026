-- Esquema de la base de datos CONFI2026 (Supabase / PostgreSQL)
-- Los códigos y la clave de vídeo se insertan aparte en public.config y NO se guardan en este repositorio:
--   insert into public.config values ('codigo_grupo', extensions.crypt('<CÓDIGO>', extensions.gen_salt('bf')));
--   insert into public.config values ('codigo_catequista', extensions.crypt('<CÓDIGO>', extensions.gen_salt('bf')));
--   insert into public.config values ('clave_video', '<clave AES de 32 bytes en base64>');
create extension if not exists pgcrypto with schema extensions;

create table public.config (clave text primary key, valor text not null);
create table public.sesiones (
  id serial primary key, numero int not null unique, titulo text not null, fecha date,
  contenido jsonb not null default '{}'::jsonb, video jsonb,
  formulario_abierto boolean not null default false, publicada boolean not null default true,
  creado timestamptz not null default now());
create table public.preguntas (
  id serial primary key, sesion_id int not null references public.sesiones(id) on delete cascade,
  orden int not null, tipo text not null check (tipo in ('texto','vf','opcion')), enunciado text not null,
  opciones jsonb, correcta text, explicacion text, opcional boolean not null default false);
create table public.respuestas (
  id bigserial primary key, envio uuid not null,
  sesion_id int not null references public.sesiones(id) on delete cascade,
  pregunta_id int not null references public.preguntas(id) on delete cascade,
  valor text not null check (char_length(valor) <= 2000), creado timestamptz not null default now());
create table public.sobres (
  id serial primary key, sesion_id int not null references public.sesiones(id) on delete cascade,
  nombre text not null, cualidad text not null);

alter table public.config enable row level security;
alter table public.sesiones enable row level security;
alter table public.preguntas enable row level security;
alter table public.respuestas enable row level security;
alter table public.sobres enable row level security;
-- Sin políticas: todo el acceso pasa por estas funciones.

create or replace function public._codigo_ok(p_codigo text, p_clave text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.config where clave = p_clave and valor = extensions.crypt(upper(trim(p_codigo)), valor));
$$;

create or replace function public.app_datos(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public._codigo_ok(p_codigo, 'codigo_grupo') then raise exception 'codigo_incorrecto' using errcode = '28000'; end if;
  return jsonb_build_object(
    'clave_video', (select valor from public.config where clave = 'clave_video'),
    'sesiones', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'numero', s.numero, 'titulo', s.titulo, 'fecha', s.fecha, 'contenido', s.contenido, 'video', s.video,
        'formulario_abierto', s.formulario_abierto,
        'preguntas', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'orden',p.orden,'tipo',p.tipo,'enunciado',p.enunciado,'opciones',p.opciones,'correcta',p.correcta,'explicacion',p.explicacion,'opcional',p.opcional) order by p.orden) from public.preguntas p where p.sesion_id = s.id), '[]'::jsonb),
        'sobres', coalesce((select jsonb_agg(jsonb_build_object('nombre',b.nombre,'cualidad',b.cualidad) order by b.nombre, b.id) from public.sobres b where b.sesion_id = s.id), '[]'::jsonb)
      ) order by s.numero) from public.sesiones s where s.publicada), '[]'::jsonb));
end; $$;

create or replace function public.enviar_respuestas(p_codigo text, p_sesion int, p_respuestas jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_envio uuid := gen_random_uuid(); r record; n int := 0;
begin
  if not public._codigo_ok(p_codigo, 'codigo_grupo') then raise exception 'codigo_incorrecto' using errcode = '28000'; end if;
  if not exists (select 1 from public.sesiones where id = p_sesion and formulario_abierto) then raise exception 'formulario_cerrado'; end if;
  if jsonb_typeof(p_respuestas) <> 'object' then raise exception 'formato'; end if;
  for r in select key, value from jsonb_each_text(p_respuestas) loop
    if exists (select 1 from public.preguntas where id = r.key::int and sesion_id = p_sesion) and length(trim(r.value)) > 0 then
      insert into public.respuestas(envio, sesion_id, pregunta_id, valor) values (v_envio, p_sesion, r.key::int, left(trim(r.value), 2000));
      n := n + 1;
    end if;
  end loop;
  if n = 0 then raise exception 'vacio'; end if;
  return jsonb_build_object('ok', true, 'guardadas', n);
end; $$;

create or replace function public.panel_respuestas(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public._codigo_ok(p_codigo, 'codigo_catequista') then raise exception 'codigo_incorrecto' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('sesion', s.numero, 'titulo', s.titulo,
      'envios', (select count(distinct envio) from public.respuestas x where x.sesion_id = s.id),
      'preguntas', coalesce((select jsonb_agg(jsonb_build_object('orden',p.orden,'enunciado',p.enunciado,'tipo',p.tipo,'correcta',p.correcta,
          'respuestas', coalesce((select jsonb_agg(jsonb_build_object('valor',x.valor,'envio',left(x.envio::text,4),'hora',x.creado) order by x.creado) from public.respuestas x where x.pregunta_id = p.id),'[]'::jsonb)) order by p.orden)
        from public.preguntas p where p.sesion_id = s.id),'[]'::jsonb)) order by s.numero) from public.sesiones s), '[]'::jsonb);
end; $$;

revoke all on function public._codigo_ok(text,text) from public, anon, authenticated;
revoke all on function public.app_datos(text) from public;
revoke all on function public.enviar_respuestas(text,int,jsonb) from public;
revoke all on function public.panel_respuestas(text) from public;
grant execute on function public.app_datos(text) to anon, authenticated;
grant execute on function public.enviar_respuestas(text,int,jsonb) to anon, authenticated;
grant execute on function public.panel_respuestas(text) to anon, authenticated;
