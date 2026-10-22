-- ═════════════════════════════════════════════════════════════
-- migration_001 — proyectos + versión en inglés
-- NO borra datos. Se puede ejecutar más de una vez.
-- Ejecutar en el SQL Editor de Supabase (una sola vez, completo).
-- ═════════════════════════════════════════════════════════════

-- ── Proyectos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    name       TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Un usuario no puede tener dos proyectos con el mismo nombre
-- (sin distinguir mayúsculas).
CREATE UNIQUE INDEX IF NOT EXISTS projects_user_name_unique
  ON projects (user_id, lower(name));

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuario ve sus propios proyectos" ON projects;
CREATE POLICY "Usuario ve sus propios proyectos"
  ON projects FOR ALL USING (user_id = auth.uid());

-- Si se borra el proyecto, sus scripts NO se borran: quedan sin proyecto.
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS project_id UUID
  REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS scripts_project_id_idx ON scripts(project_id);

-- ── Versión en inglés ────────────────────────────────────────
-- La estructura (escenas, personajes, orden, tipos) es una sola.
-- Solo el texto tiene versión en inglés: nullable = "sin traducir".
ALTER TABLE scripts       ADD COLUMN IF NOT EXISTS name_en    TEXT;
ALTER TABLE script_lines  ADD COLUMN IF NOT EXISTS content_en TEXT;

DROP TRIGGER IF EXISTS set_updated_at_projects ON projects;
CREATE TRIGGER set_updated_at_projects
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── upsert_script (firma nueva: + título EN + proyecto) ──────
DROP FUNCTION IF EXISTS upsert_script(UUID, TEXT, TEXT[], JSONB);

CREATE OR REPLACE FUNCTION upsert_script(
  p_script_id      UUID,
  p_script_name    TEXT,
  p_script_name_en TEXT,
  p_project_id     UUID,
  p_characters     TEXT[],
  p_lines          JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_script_id      UUID;
  v_character_id   UUID;
  v_character_map  JSONB := '{}';
  v_line           JSONB;
  v_character      TEXT;
  v_user_id        UUID;
  v_line_type      TEXT;
  v_character_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- El proyecto tiene que ser del usuario (si no, se ignora).
  IF p_project_id IS NOT NULL THEN
    PERFORM 1 FROM projects WHERE id = p_project_id AND user_id = v_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Proyecto no encontrado';
    END IF;
  END IF;

  IF p_script_id IS NULL THEN
    INSERT INTO scripts (user_id, name, name_en, project_id)
    VALUES (v_user_id, p_script_name, NULLIF(p_script_name_en, ''), p_project_id)
    RETURNING id INTO v_script_id;
  ELSE
    SELECT id INTO v_script_id
    FROM scripts
    WHERE id = p_script_id AND user_id = v_user_id;

    IF v_script_id IS NULL THEN
      RAISE EXCEPTION 'Script no encontrado';
    END IF;

    UPDATE scripts
    SET name       = p_script_name,
        name_en    = NULLIF(p_script_name_en, ''),
        project_id = p_project_id,
        updated_at = NOW()
    WHERE id = v_script_id;

    DELETE FROM script_lines WHERE script_id = v_script_id;
    DELETE FROM characters   WHERE script_id = v_script_id;
  END IF;

  FOREACH v_character IN ARRAY p_characters LOOP
    INSERT INTO characters (script_id, name)
    VALUES (v_script_id, v_character)
    RETURNING id INTO v_character_id;
    v_character_map := v_character_map || jsonb_build_object(v_character, v_character_id);
  END LOOP;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_type      := v_line->>'line_type';
    v_character_name := v_line->>'character_name';

    INSERT INTO script_lines (
      script_id, character_id, line_number, line_type, content, content_en, scene_number
    ) VALUES (
      v_script_id,
      CASE WHEN v_character_name IS NOT NULL THEN (v_character_map ->> v_character_name)::UUID ELSE NULL END,
      (v_line->>'line_number')::INTEGER,
      v_line_type,
      v_line->>'content',
      NULLIF(v_line->>'content_en', ''),
      CASE WHEN v_line_type = 'scene' THEN (v_line->>'scene_number')::INTEGER ELSE NULL END
    );
  END LOOP;

  RETURN v_script_id;
END;
$$;

-- ── get_user_scripts (+ project_id, name_en, translated_count) ─
DROP FUNCTION IF EXISTS get_user_scripts();

CREATE OR REPLACE FUNCTION get_user_scripts()
RETURNS TABLE (
  id               UUID,
  name             TEXT,
  name_en          TEXT,
  project_id       UUID,
  character_count  BIGINT,
  line_count       BIGINT,
  translated_count BIGINT,
  created_at       TIMESTAMP,
  updated_at       TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.name_en,
    s.project_id,
    COUNT(DISTINCT c.id) AS character_count,
    COUNT(DISTINCT sl.id) FILTER (
      WHERE sl.line_type IN ('dialogue', 'thought', 'narration')
    ) AS line_count,
    COUNT(DISTINCT sl.id) FILTER (
      WHERE sl.line_type IN ('dialogue', 'thought', 'narration')
        AND sl.content_en IS NOT NULL
    ) AS translated_count,
    s.created_at,
    s.updated_at
  FROM scripts s
  LEFT JOIN characters   c  ON c.script_id  = s.id
  LEFT JOIN script_lines sl ON sl.script_id = s.id
  WHERE s.user_id = auth.uid()
  GROUP BY s.id, s.name, s.name_en, s.project_id, s.created_at, s.updated_at
  ORDER BY s.updated_at DESC;
END;
$$;

-- ── get_script_detail (+ name_en, project_id, content_en) ────
CREATE OR REPLACE FUNCTION get_script_detail(p_script_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id',         s.id,
    'name',       s.name,
    'name_en',    s.name_en,
    'project_id', s.project_id,
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
          'line_type',      sl.line_type,
          'character_name', c.name,
          'content',        sl.content,
          'content_en',     sl.content_en,
          'scene_number',   sl.scene_number
        )
        ORDER BY sl.line_number
      )
      FROM script_lines sl
      LEFT JOIN characters c ON c.id = sl.character_id
      WHERE sl.script_id = s.id
    )
  )
  INTO v_result
  FROM scripts s
  WHERE s.id = p_script_id AND s.user_id = auth.uid();

  RETURN v_result;
END;
$$;

-- ── Funciones de proyecto ────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_projects()
RETURNS TABLE (id UUID, name TEXT, script_count BIGINT, updated_at TIMESTAMP)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, COUNT(s.id) AS script_count, p.updated_at
  FROM projects p
  LEFT JOIN scripts s ON s.project_id = p.id
  WHERE p.user_id = auth.uid()
  GROUP BY p.id, p.name, p.updated_at
  ORDER BY lower(p.name);
END;
$$;

CREATE OR REPLACE FUNCTION create_project(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  INSERT INTO projects (user_id, name)
  VALUES (auth.uid(), btrim(p_name))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION rename_project(p_project_id UUID, p_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE projects SET name = btrim(p_name), updated_at = NOW()
  WHERE id = p_project_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proyecto no encontrado';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION delete_project(p_project_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Los scripts quedan con project_id = NULL (ON DELETE SET NULL).
  DELETE FROM projects WHERE id = p_project_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proyecto no encontrado';
  END IF;
END;
$$;
