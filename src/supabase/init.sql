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


CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;


CREATE OR REPLACE FUNCTION save_script(
  p_user_id UUID,
  p_script_name TEXT,
  p_characters TEXT[],
  p_lines JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_script_id UUID;
  v_character_id UUID;
  v_character_map JSONB := '{}';
  v_line JSONB;
  v_character TEXT;
BEGIN
  INSERT INTO scripts (user_id, name)
  VALUES (p_user_id, p_script_name)
  RETURNING id INTO v_script_id;

  FOREACH v_character IN ARRAY p_characters LOOP
    INSERT INTO characters (script_id, name)
    VALUES (v_script_id, v_character)
    RETURNING id INTO v_character_id;

    v_character_map := v_character_map || jsonb_build_object(v_character, v_character_id);
  END LOOP;

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

-- CREATE OR REPLACE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION handle_new_user();


--   CREATE OR REPLACE FUNCTION update_updated_at()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   NEW.updated_at = NOW();
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- CREATE OR REPLACE TRIGGER set_updated_at_scripts
--   BEFORE UPDATE ON scripts
--   FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- CREATE OR REPLACE TRIGGER set_updated_at_characters
--   BEFORE UPDATE ON characters
--   FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- CREATE OR REPLACE TRIGGER set_updated_at_script_lines
--   BEFORE UPDATE ON script_lines
--   FOR EACH ROW EXECUTE FUNCTION update_updated_at();