-- ═════════════════════════════════════════════════════════════
-- migration_004_performance.sql
--
-- Optimización de base de datos (no cambia datos ni la API):
--   1. Índices en las claves foráneas y en las columnas por las que se filtra.
--      Postgres NO indexa las FK automáticamente; sin esto cada consulta
--      y cada borrado en cascada recorre tablas enteras.
--   2. get_user_scripts: antes hacía LEFT JOIN a characters y a script_lines
--      a la vez (personajes × líneas filas por script) para luego contar con
--      COUNT(DISTINCT). Ahora cuenta cada cosa por separado.
--   3. upsert_script: antes insertaba personajes y líneas una por una en un
--      LOOP (una sentencia por línea). Ahora es una sola sentencia por tabla.
--
-- Ejecutar completa, una sola vez, DESPUÉS de migration_003.
-- Es idempotente. En tablas muy grandes, CREATE INDEX bloquea escrituras
-- unos segundos; con el volumen de un editor personal es instantáneo.
-- ═════════════════════════════════════════════════════════════

-- ── 1. Índices ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_scripts_user_updated
    ON scripts (user_id, updated_at DESC);

-- (scripts.project_id ya tiene índice: scripts_project_id_idx, de migration_001)

CREATE INDEX IF NOT EXISTS idx_characters_script_position
    ON characters (script_id, position);

CREATE INDEX IF NOT EXISTS idx_script_lines_script_line
    ON script_lines (script_id, line_number);

-- ON DELETE SET NULL de script_lines.character_id: al borrar un personaje,
-- Postgres busca sus líneas por esta columna.
CREATE INDEX IF NOT EXISTS idx_script_lines_character
    ON script_lines (character_id);


-- ── 2. get_user_scripts ──────────────────────────────────────
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
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.name,
        s.name_en,
        s.project_id,
        (SELECT COUNT(*) FROM characters c WHERE c.script_id = s.id),
        l.line_count,
        l.translated_count,
        s.created_at,
        s.updated_at
    FROM scripts s
    CROSS JOIN LATERAL (
        SELECT
            COUNT(*) FILTER (
                WHERE sl.line_type IN ('dialogue', 'thought', 'narration')
            ) AS line_count,
            COUNT(*) FILTER (
                WHERE sl.line_type IN ('dialogue', 'thought', 'narration')
                  AND sl.content_en IS NOT NULL
            ) AS translated_count
        FROM script_lines sl
        WHERE sl.script_id = s.id
    ) l
    WHERE s.user_id = auth.uid()
    ORDER BY s.updated_at DESC;
END;
$$;


-- ── 3. upsert_script ─────────────────────────────────────────
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
        scene_number
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
