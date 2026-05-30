-- ─────────────────────────────────────────────
-- Tablas
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID REFERENCES scripts(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS script_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID REFERENCES scripts(id) ON DELETE CASCADE NOT NULL,
    character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
    line_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ─────────────────────────────────────────────
-- Trigger: crear profile al registrar usuario
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────

ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters   ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve su propio perfil"
  ON profiles FOR ALL USING (id = auth.uid());

CREATE POLICY "Usuario ve sus propios scripts"
  ON scripts FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Usuario ve personajes de sus scripts"
  ON characters FOR ALL
  USING (script_id IN (SELECT id FROM scripts WHERE user_id = auth.uid()));

CREATE POLICY "Usuario ve líneas de sus scripts"
  ON script_lines FOR ALL
  USING (script_id IN (SELECT id FROM scripts WHERE user_id = auth.uid()));


-- ─────────────────────────────────────────────
-- ✅ Capa 4 — upsert_script
--    Crea un script nuevo (p_script_id = NULL)
--    o actualiza uno existente del mismo usuario
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION upsert_script(
  p_script_id   UUID,     -- NULL para script nuevo
  p_script_name TEXT,
  p_characters  TEXT[],
  p_lines       JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_script_id     UUID;
  v_character_id  UUID;
  v_character_map JSONB := '{}';
  v_line          JSONB;
  v_character     TEXT;
  v_user_id       UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_script_id IS NULL THEN
    -- Nuevo script
    INSERT INTO scripts (user_id, name)
    VALUES (v_user_id, p_script_name)
    RETURNING id INTO v_script_id;
  ELSE
    -- Verificar que el script pertenece al usuario
    SELECT id INTO v_script_id
    FROM scripts
    WHERE id = p_script_id AND user_id = v_user_id;

    IF v_script_id IS NULL THEN
      RAISE EXCEPTION 'Script no encontrado';
    END IF;

    -- Actualizar nombre y timestamp
    UPDATE scripts SET name = p_script_name WHERE id = v_script_id;

    -- Borrar personajes anteriores (ON DELETE CASCADE borra las líneas también)
    DELETE FROM characters WHERE script_id = v_script_id;
  END IF;

  -- Insertar personajes
  FOREACH v_character IN ARRAY p_characters LOOP
    INSERT INTO characters (script_id, name)
    VALUES (v_script_id, v_character)
    RETURNING id INTO v_character_id;

    v_character_map := v_character_map || jsonb_build_object(v_character, v_character_id);
  END LOOP;

  -- Insertar líneas
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO script_lines (script_id, character_id, line_number, content)
    VALUES (
      v_script_id,
      (v_character_map ->> (v_line->>'character_name'))::UUID,
      (v_line->>'line_number')::INTEGER,
      v_line->>'content'
    );
  END LOOP;

  RETURN v_script_id;
END;
$$;


-- ─────────────────────────────────────────────
-- ✅ Capa 4 — get_user_scripts
--    Lista los scripts del usuario con conteos
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_scripts()
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  character_count BIGINT,
  line_count      BIGINT,
  created_at      TIMESTAMP,
  updated_at      TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    COUNT(DISTINCT c.id)  AS character_count,
    COUNT(DISTINCT sl.id) AS line_count,
    s.created_at,
    s.updated_at
  FROM scripts s
  LEFT JOIN characters   c  ON c.script_id  = s.id
  LEFT JOIN script_lines sl ON sl.script_id = s.id
  WHERE s.user_id = auth.uid()
  GROUP BY s.id, s.name, s.created_at, s.updated_at
  ORDER BY s.updated_at DESC;
END;
$$;


-- ─────────────────────────────────────────────
-- ✅ Capa 4 — get_script_detail
--    Devuelve un script completo como JSONB
--    para cargar en el editor
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_script_detail(p_script_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id',   s.id,
    'name', s.name,
    'characters', (
      SELECT jsonb_agg(
        jsonb_build_object('name', c.name)
        ORDER BY c.created_at
      )
      FROM characters c WHERE c.script_id = s.id
    ),
    'lines', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'character_name', c.name,
          'text', sl.content
        )
        ORDER BY sl.line_number
      )
      FROM script_lines sl
      JOIN characters c ON c.id = sl.character_id
      WHERE sl.script_id = s.id
    )
  )
  INTO v_result
  FROM scripts s
  WHERE s.id = p_script_id AND s.user_id = auth.uid();

  RETURN v_result;
END;
$$;


-- ─────────────────────────────────────────────
-- Triggers: updated_at automático
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_updated_at_scripts
  BEFORE UPDATE ON scripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_characters
  BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_script_lines
  BEFORE UPDATE ON script_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();



-- ─────────────────────────────────────────────
-- Parte B — delete_character
-- Elimina un personaje. Si keep_lines = true,
-- reasigna sus líneas a un personaje "Desconocido N".
-- Si keep_lines = false, borra sus líneas también.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_character(
  p_character_id UUID,
  p_keep_lines   BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_script_id    UUID;
  v_unknown_id   UUID;
  v_unknown_n    INT;
  v_unknown_name TEXT;
BEGIN
  -- Obtener el script_id y verificar que pertenece al usuario
  SELECT script_id INTO v_script_id
  FROM characters
  WHERE id = p_character_id
    AND script_id IN (SELECT id FROM scripts WHERE user_id = auth.uid());

  IF v_script_id IS NULL THEN
    RAISE EXCEPTION 'Personaje no encontrado';
  END IF;

  IF p_keep_lines THEN
    -- Calcular el siguiente número de Desconocido
    SELECT COUNT(*) + 1 INTO v_unknown_n
    FROM characters
    WHERE script_id = v_script_id
      AND name LIKE 'Desconocido %';

    v_unknown_name := 'Desconocido ' || v_unknown_n;

    -- Crear el personaje Desconocido
    INSERT INTO characters (script_id, name)
    VALUES (v_script_id, v_unknown_name)
    RETURNING id INTO v_unknown_id;

    -- Reasignar líneas
    UPDATE script_lines
    SET character_id = v_unknown_id
    WHERE character_id = p_character_id;
  END IF;

  -- Eliminar el personaje (ON DELETE SET NULL limpia las FKs restantes)
  DELETE FROM characters WHERE id = p_character_id;
END;
$$;