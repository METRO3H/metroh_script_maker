-- ═════════════════════════════════════════════════════════════
-- migration_003_character_order.sql
--
-- Corrige el orden NO determinista de los personajes.
--
-- Problema: get_script_detail ordenaba por characters.created_at, pero todos
-- los personajes de un guardado se insertan en la misma transacción, así que
-- CURRENT_TIMESTAMP es idéntico para todos y el orden podía cambiar entre
-- cargas (y con él los colores, que dependen del índice).
--
-- Solución: columna `position` explícita, escrita por upsert_script y usada
-- por get_script_detail.
--
-- Ejecutar completa, una sola vez, DESPUÉS de migration_001 y 002.
-- Es idempotente. NO volver a ejecutar migration_001 después de esta
-- (restauraría las versiones antiguas de las funciones).
-- ═════════════════════════════════════════════════════════════

ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

-- Backfill de scripts ya guardados (solo los que aún no tienen orden: más de
-- un personaje y todos con position = 0). Como el created_at estaba empatado,
-- el orden "real" nunca estuvo definido; lo más cercano a lo que ves hoy en la
-- app es el orden físico en que Postgres ya devuelve esas filas (ctid). Se
-- congela tal cual para que a partir de ahora no cambie.
WITH needs AS (
    SELECT script_id
    FROM characters
    GROUP BY script_id
    HAVING COUNT(*) > 1 AND MAX(position) = 0
),
ranked AS (
    SELECT c.id,
           ROW_NUMBER() OVER (PARTITION BY c.script_id ORDER BY c.ctid) - 1 AS pos
    FROM characters c
    WHERE c.script_id IN (SELECT script_id FROM needs)
)
UPDATE characters c
SET position = r.pos
FROM ranked r
WHERE c.id = r.id;


-- ─────────────────────────────────────────────────────────────
-- upsert_script: ahora guarda la posición de cada personaje
-- ─────────────────────────────────────────────────────────────
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
    v_script_id      UUID;
    v_character_id   UUID;
    v_character_map  JSONB := '{}';
    v_line           JSONB;
    v_character      TEXT;
    v_user_id        UUID;
    v_line_type      TEXT;
    v_character_name TEXT;
    v_position       INTEGER := 0;
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

    FOREACH v_character IN ARRAY p_characters LOOP
        INSERT INTO characters (script_id, name, position)
        VALUES (v_script_id, v_character, v_position)
        RETURNING id INTO v_character_id;

        v_position := v_position + 1;

        v_character_map :=
            v_character_map ||
            jsonb_build_object(v_character, v_character_id);
    END LOOP;

    FOR v_line IN
        SELECT *
        FROM jsonb_array_elements(p_lines)
    LOOP
        v_line_type := v_line->>'line_type';
        v_character_name := v_line->>'character_name';

        INSERT INTO script_lines (
            script_id,
            character_id,
            line_number,
            line_type,
            content,
            content_en,
            scene_number
        )
        VALUES (
            v_script_id,
            CASE
                WHEN v_character_name IS NOT NULL
                THEN (v_character_map ->> v_character_name)::UUID
                ELSE NULL
            END,
            (v_line->>'line_number')::INTEGER,
            v_line_type,
            v_line->>'content',
            NULLIF(v_line->>'content_en', ''),
            CASE
                WHEN v_line_type = 'scene'
                THEN (v_line->>'scene_number')::INTEGER
                ELSE NULL
            END
        );
    END LOOP;

    RETURN v_script_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- get_script_detail: personajes ordenados por position
-- ─────────────────────────────────────────────────────────────
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
                    'scene_number', sl.scene_number
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
