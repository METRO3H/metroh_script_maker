
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
