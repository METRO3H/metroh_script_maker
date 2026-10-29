


-- ═════════════════════════════════════════════════════════════
-- LIMPIEZA COMPLETA
-- Elimina las tablas de la aplicación y sus dependencias.
-- No elimina los usuarios de auth.users.
-- ═════════════════════════════════════════════════════════════

-- El trigger de autenticación está asociado a una tabla de Supabase
-- que no vamos a eliminar.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Primero se eliminan las tablas dependientes.
-- CASCADE elimina sus triggers, políticas y dependencias asociadas.
DROP TABLE IF EXISTS script_lines CASCADE;
DROP TABLE IF EXISTS characters CASCADE;
DROP TABLE IF EXISTS scripts CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS custom_words CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Eliminar las funciones existentes.
DROP FUNCTION IF EXISTS handle_new_user();
DROP FUNCTION IF EXISTS update_updated_at();

DROP FUNCTION IF EXISTS upsert_script(UUID, TEXT, TEXT[], JSONB);
DROP FUNCTION IF EXISTS upsert_script(UUID, TEXT, TEXT, UUID, TEXT[], JSONB);

DROP FUNCTION IF EXISTS get_user_scripts();
DROP FUNCTION IF EXISTS get_script_detail(UUID);
DROP FUNCTION IF EXISTS delete_character(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS delete_script(UUID);

DROP FUNCTION IF EXISTS get_user_projects();
DROP FUNCTION IF EXISTS create_project(TEXT);
DROP FUNCTION IF EXISTS rename_project(UUID, TEXT);
DROP FUNCTION IF EXISTS delete_project(UUID);

DROP FUNCTION IF EXISTS get_custom_words();
DROP FUNCTION IF EXISTS add_custom_words(TEXT, TEXT[]);
DROP FUNCTION IF EXISTS delete_custom_word(TEXT, TEXT);


-- ═════════════════════════════════════════════════════════════
-- TABLAS
-- ═════════════════════════════════════════════════════════════

CREATE TABLE profiles (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scripts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    name       TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE characters (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id  UUID REFERENCES scripts(id) ON DELETE CASCADE NOT NULL,
    name       TEXT NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,   -- orden en el guion (ver migration_003)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- line_type: 'dialogue' | 'thought' | 'narration' | 'context' | 'scene'
-- character_id: NULL para context y scene
-- content:      NULL para scene
-- scene_number: solo para line_type = 'scene'
-- visible_in:   solo para line_type = 'scene' (ver migration_005): perspectivas
--               en las que se ve la escena. {all} = solo en "ver todas las
--               perspectivas"; nombres de personaje = también en la de cada uno.

CREATE TABLE script_lines (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id    UUID REFERENCES scripts(id) ON DELETE CASCADE NOT NULL,
    character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
    line_number  INTEGER NOT NULL,
    line_type    TEXT NOT NULL DEFAULT 'dialogue'
                 CHECK (
                     line_type IN (
                         'dialogue',
                         'thought',
                         'narration',
                         'context',
                         'scene'
                     )
                 ),
    content      TEXT,
    scene_number INTEGER,
    visible_in   TEXT[],
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ═════════════════════════════════════════════════════════════
-- TRIGGER: CREAR PERFIL AL REGISTRAR USUARIO
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);

    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();


-- ═════════════════════════════════════════════════════════════
-- RLS: ROW LEVEL SECURITY
-- ═════════════════════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve su propio perfil"
    ON profiles
    FOR ALL
    USING (id = auth.uid());

CREATE POLICY "Usuario ve sus propios scripts"
    ON scripts
    FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Usuario ve personajes de sus scripts"
    ON characters
    FOR ALL
    USING (
        script_id IN (
            SELECT id
            FROM scripts
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Usuario ve líneas de sus scripts"
    ON script_lines
    FOR ALL
    USING (
        script_id IN (
            SELECT id
            FROM scripts
            WHERE user_id = auth.uid()
        )
    );


-- ═════════════════════════════════════════════════════════════
-- upsert_script
-- Guarda todas las líneas: dialogue, thought, narration,
-- context y scene.
-- Esta es la versión inicial; más abajo se reemplaza por
-- la versión que también admite proyectos y texto en inglés.
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION upsert_script(
    p_script_id   UUID,
    p_script_name TEXT,
    p_characters  TEXT[],
    p_lines       JSONB
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
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    IF p_script_id IS NULL THEN
        INSERT INTO scripts (user_id, name)
        VALUES (v_user_id, p_script_name)
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
            updated_at = NOW()
        WHERE id = v_script_id;

        DELETE FROM script_lines
        WHERE script_id = v_script_id;

        DELETE FROM characters
        WHERE script_id = v_script_id;
    END IF;

    FOREACH v_character IN ARRAY p_characters LOOP
        INSERT INTO characters (script_id, name)
        VALUES (v_script_id, v_character)
        RETURNING id INTO v_character_id;

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


-- ═════════════════════════════════════════════════════════════
-- get_user_scripts
-- ═════════════════════════════════════════════════════════════

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
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.name,
        COUNT(DISTINCT c.id) AS character_count,
        COUNT(DISTINCT sl.id) FILTER (
            WHERE sl.line_type IN (
                'dialogue',
                'thought',
                'narration'
            )
        ) AS line_count,
        s.created_at,
        s.updated_at
    FROM scripts s
    LEFT JOIN characters c
        ON c.script_id = s.id
    LEFT JOIN script_lines sl
        ON sl.script_id = s.id
    WHERE s.user_id = auth.uid()
    GROUP BY
        s.id,
        s.name,
        s.created_at,
        s.updated_at
    ORDER BY s.updated_at DESC;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- get_script_detail
-- Devuelve el script completo para restaurar el editor.
-- ═════════════════════════════════════════════════════════════

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
        'characters', (
            SELECT jsonb_agg(
                jsonb_build_object('name', c.name)
                ORDER BY c.created_at
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


-- ═════════════════════════════════════════════════════════════
-- delete_character
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION delete_character(
    p_character_id UUID,
    p_keep_lines   BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_script_id    UUID;
    v_unknown_id   UUID;
    v_unknown_n    INT;
    v_unknown_name TEXT;
BEGIN
    SELECT script_id
    INTO v_script_id
    FROM characters
    WHERE id = p_character_id
      AND script_id IN (
          SELECT id
          FROM scripts
          WHERE user_id = auth.uid()
      );

    IF v_script_id IS NULL THEN
        RAISE EXCEPTION 'Personaje no encontrado';
    END IF;

    IF p_keep_lines THEN
        SELECT COUNT(*) + 1
        INTO v_unknown_n
        FROM characters
        WHERE script_id = v_script_id
          AND name LIKE 'Desconocido %';

        v_unknown_name := 'Desconocido ' || v_unknown_n;

        INSERT INTO characters (script_id, name)
        VALUES (v_script_id, v_unknown_name)
        RETURNING id INTO v_unknown_id;

        UPDATE script_lines
        SET character_id = v_unknown_id
        WHERE character_id = p_character_id;
    END IF;

    DELETE FROM characters
    WHERE id = p_character_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- delete_script
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION delete_script(p_script_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM scripts
    WHERE id = p_script_id
      AND user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Script no encontrado';
    END IF;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- TRIGGERS: updated_at AUTOMÁTICO
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_scripts
    BEFORE UPDATE ON scripts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_characters
    BEFORE UPDATE ON characters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_script_lines
    BEFORE UPDATE ON script_lines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();


-- ═════════════════════════════════════════════════════════════
-- SINCRONIZAR USUARIOS EXISTENTES
-- ═════════════════════════════════════════════════════════════

INSERT INTO profiles (id, email)
SELECT id, email
FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════
-- PROYECTOS + VERSIÓN EN INGLÉS
-- ═════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- Tabla de proyectos
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    name       TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Un usuario no puede tener dos proyectos con el mismo nombre,
-- sin distinguir mayúsculas y minúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS projects_user_name_unique
    ON projects (user_id, LOWER(name));

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuario ve sus propios proyectos" ON projects;

CREATE POLICY "Usuario ve sus propios proyectos"
    ON projects
    FOR ALL
    USING (user_id = auth.uid());

-- Si se borra el proyecto, sus scripts quedan sin proyecto.
ALTER TABLE scripts
    ADD COLUMN IF NOT EXISTS project_id UUID
    REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS scripts_project_id_idx
    ON scripts (project_id);


-- ─────────────────────────────────────────────────────────────
-- Versión en inglés
-- ─────────────────────────────────────────────────────────────

-- La estructura (escenas, personajes, orden y tipos) es única.
-- Solo el texto tiene versión en inglés.
-- NULL significa que aún no está traducido.

ALTER TABLE scripts
    ADD COLUMN IF NOT EXISTS name_en TEXT;

ALTER TABLE script_lines
    ADD COLUMN IF NOT EXISTS content_en TEXT;


-- ─────────────────────────────────────────────────────────────
-- Trigger de updated_at para proyectos
-- ─────────────────────────────────────────────────────────────

CREATE TRIGGER set_updated_at_projects
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();


-- ═════════════════════════════════════════════════════════════
-- upsert_script
-- Firma nueva: título EN + proyecto.
-- ═════════════════════════════════════════════════════════════

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


-- ═════════════════════════════════════════════════════════════
-- get_user_scripts
-- Incluye proyecto, título EN y cantidad de líneas traducidas.
-- ═════════════════════════════════════════════════════════════

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


-- ═════════════════════════════════════════════════════════════
-- get_script_detail
-- Incluye título EN, proyecto y texto traducido.
-- ═════════════════════════════════════════════════════════════

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


-- ═════════════════════════════════════════════════════════════
-- FUNCIONES DE PROYECTOS
-- ═════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- get_user_projects
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_projects()
RETURNS TABLE (
    id           UUID,
    name         TEXT,
    script_count BIGINT,
    updated_at   TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.name,
        COUNT(s.id) AS script_count,
        p.updated_at
    FROM projects p
    LEFT JOIN scripts s
        ON s.project_id = p.id
    WHERE p.user_id = auth.uid()
    GROUP BY
        p.id,
        p.name,
        p.updated_at
    ORDER BY LOWER(p.name);
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- create_project
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_project(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    INSERT INTO projects (user_id, name)
    VALUES (auth.uid(), BTRIM(p_name))
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- rename_project
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rename_project(
    p_project_id UUID,
    p_name       TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE projects
    SET name = BTRIM(p_name),
        updated_at = NOW()
    WHERE id = p_project_id
      AND user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Proyecto no encontrado';
    END IF;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- delete_project
-- Los scripts quedan con project_id = NULL.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION delete_project(p_project_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM projects
    WHERE id = p_project_id
      AND user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Proyecto no encontrado';
    END IF;
END;
$$;

-- ═════════════════════════════════════════════════════════════
-- migration_002 — palabras personalizadas para las sugerencias
-- NO borra datos. Se puede ejecutar más de una vez.
-- Ejecutar en el SQL Editor de Supabase (una sola vez, completo).
--
-- Guarda, por usuario e idioma, las palabras que la persona usó en sus
-- guiones y que no existen en el diccionario (nombres, jerga, términos
-- inventados). El editor las carga al abrirse y las suma a las sugerencias.
-- ═════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS custom_words (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    lang       TEXT NOT NULL CHECK (lang IN ('es', 'en')),
    word       TEXT NOT NULL CHECK (char_length(word) BETWEEN 2 AND 40),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Una palabra no se repite por usuario e idioma.
CREATE UNIQUE INDEX IF NOT EXISTS custom_words_user_lang_word_unique
    ON custom_words (user_id, lang, word);

ALTER TABLE custom_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuario ve sus propias palabras" ON custom_words;
CREATE POLICY "Usuario ve sus propias palabras"
    ON custom_words
    FOR ALL
    USING (user_id = auth.uid());


-- ── get_custom_words ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_custom_words()
RETURNS TABLE (lang TEXT, word TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT cw.lang, cw.word
    FROM custom_words cw
    WHERE cw.user_id = auth.uid()
    ORDER BY cw.created_at, cw.word;
END;
$$;


-- ── add_custom_words ─────────────────────────────────────────
-- Agrega varias palabras de una vez (ignora las repetidas) y devuelve
-- cuántas eran nuevas. Tope: 5000 palabras por usuario e idioma.
CREATE OR REPLACE FUNCTION add_custom_words(p_lang TEXT, p_words TEXT[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room    INTEGER;
    v_added   INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    IF p_lang NOT IN ('es', 'en') THEN
        RAISE EXCEPTION 'Idioma inválido';
    END IF;

    SELECT 5000 - COUNT(*)
    INTO v_room
    FROM custom_words
    WHERE user_id = v_user_id
      AND lang = p_lang;

    IF v_room <= 0 THEN
        RETURN 0;
    END IF;

    WITH inserted AS (
        INSERT INTO custom_words (user_id, lang, word)
        SELECT v_user_id, p_lang, t.w
        FROM (
            SELECT DISTINCT BTRIM(x) AS w
            FROM unnest(p_words) AS x
        ) t
        WHERE char_length(t.w) BETWEEN 2 AND 40
        LIMIT v_room
        ON CONFLICT DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_added FROM inserted;

    RETURN v_added;
END;
$$;


-- ── delete_custom_word ───────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_custom_word(p_lang TEXT, p_word TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM custom_words
    WHERE user_id = auth.uid()
      AND lang = p_lang
      AND word = p_word;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- Índices de rendimiento (ver migration_004)
-- ─────────────────────────────────────────────────────────────
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

