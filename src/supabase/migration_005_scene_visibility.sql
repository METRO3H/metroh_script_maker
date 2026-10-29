-- ═════════════════════════════════════════════════════════════
-- migration_005_scene_visibility.sql
-- Perspectivas por escena (visible_in)
--
-- Cada escena dice en qué perspectivas se ve:
--   {all}         → solo al elegir "ver todas las perspectivas"
--   {Haruto}      → en la perspectiva de Haruto (y en la vista completa)
--   {Haruto,Ana}  → en la de cualquiera de los dos
-- Los nombres son los de characters.name del mismo script.
--
-- Ejecutar en el SQL Editor de Supabase. Es seguro volver a correrla.
-- ═════════════════════════════════════════════════════════════

-- 1. Columna. NULL para líneas que no son escena.
ALTER TABLE script_lines ADD COLUMN IF NOT EXISTS visible_in TEXT[];

-- 2. Las escenas que ya existían quedan en la vista completa ({all}).
UPDATE script_lines
SET visible_in = ARRAY['all']::TEXT[]
WHERE line_type = 'scene'
  AND visible_in IS NULL;


-- ── 3. upsert_script: guarda visible_in de cada escena ───────
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
SET search_path = public
AS $$
DECLARE
    v_script_id UUID;
    v_user_id   UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- El proyecto debe pertenecer al usuario autenticado.
    IF p_project_id IS NOT NULL THEN
        PERFORM 1
        FROM projects
        WHERE id = p_project_id
          AND user_id = v_user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Proyecto no encontrado';
        END IF;
    END IF;

    IF p_script_id IS NULL THEN
        INSERT INTO scripts (
            user_id,
            name,
            name_en,
            project_id
        )
        VALUES (
            v_user_id,
            p_script_name,
            NULLIF(p_script_name_en, ''),
            p_project_id
        )
        RETURNING id INTO v_script_id;
    ELSE
        SELECT id
        INTO v_script_id
        FROM scripts
        WHERE id = p_script_id
          AND user_id = v_user_id;

        IF v_script_id IS NULL THEN
            RAISE EXCEPTION 'Script no encontrado';
        END IF;

        UPDATE scripts
        SET name = p_script_name,
            name_en = NULLIF(p_script_name_en, ''),
            project_id = p_project_id,
            updated_at = NOW()
        WHERE id = v_script_id;

        DELETE FROM script_lines
        WHERE script_id = v_script_id;

        DELETE FROM characters
        WHERE script_id = v_script_id;
    END IF;

    -- Personajes: una sola sentencia; `position` sale del orden del arreglo.
    INSERT INTO characters (script_id, name, position)
    SELECT v_script_id, t.name, (t.ord - 1)::INTEGER
    FROM unnest(p_characters) WITH ORDINALITY AS t(name, ord);

    -- Líneas: una sola sentencia. Cada línea se enlaza a su personaje por
    -- nombre. Si hubiera nombres repetidos, gana el último (igual que antes).
    INSERT INTO script_lines (
        script_id,
        character_id,
        line_number,
        line_type,
        content,
        content_en,
        scene_number,
        visible_in
    )
    SELECT
        v_script_id,
        ch.id,
        (l.value->>'line_number')::INTEGER,
        l.value->>'line_type',
        l.value->>'content',
        NULLIF(l.value->>'content_en', ''),
        CASE
            WHEN l.value->>'line_type' = 'scene'
            THEN (l.value->>'scene_number')::INTEGER
            ELSE NULL
        END,
        -- Solo escenas. Si falta o viene vacío, la escena queda en {all}.
        CASE
            WHEN l.value->>'line_type' = 'scene'
            THEN COALESCE(
                NULLIF(
                    CASE
                        WHEN jsonb_typeof(l.value->'visible_in') = 'array'
                        THEN ARRAY(SELECT jsonb_array_elements_text(l.value->'visible_in'))
                    END,
                    '{}'::TEXT[]
                ),
                ARRAY['all']::TEXT[]
            )
            ELSE NULL
        END
    FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS l(value, ord)
    LEFT JOIN (
        SELECT DISTINCT ON (c.name) c.name, c.id
        FROM characters c
        WHERE c.script_id = v_script_id
        ORDER BY c.name, c.position DESC
    ) ch ON ch.name = l.value->>'character_name'
    ORDER BY l.ord;

    RETURN v_script_id;
END;
$$;


-- ── 4. get_script_detail: devuelve visible_in de cada línea ──
CREATE OR REPLACE FUNCTION get_script_detail(p_script_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'name_en', s.name_en,
        'project_id', s.project_id,
        'characters', (
            SELECT jsonb_agg(
                jsonb_build_object('name', c.name)
                ORDER BY c.position, c.id
            )
            FROM characters c
            WHERE c.script_id = s.id
        ),
        'lines', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'line_type', sl.line_type,
                    'character_name', c.name,
                    'content', sl.content,
                    'content_en', sl.content_en,
                    'scene_number', sl.scene_number,
                    'visible_in', sl.visible_in
                )
                ORDER BY sl.line_number
            )
            FROM script_lines sl
            LEFT JOIN characters c
                ON c.id = sl.character_id
            WHERE sl.script_id = s.id
        )
    )
    INTO v_result
    FROM scripts s
    WHERE s.id = p_script_id
      AND s.user_id = auth.uid();

    RETURN v_result;
END;
$$;
