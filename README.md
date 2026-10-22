# Metroh Script Maker

![Astro](https://img.shields.io/badge/Astro-6-BC52EE?logo=astro&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white)
![Status](https://img.shields.io/badge/status-active-brightgreen)

A web-based script editor designed for writing and organizing visual-novel style scripts.

Metroh Script Maker combines a focused script-writing interface with account-based storage, scene management, multiple line types, file export, a local word-suggestion bar, projects, and a Spanish / English version of every script.

## Features

### Script editor
- Create scripts through a guided two-step onboarding flow.
- Organize scripts into numbered scenes.
- Add, rename, and remove characters.
- Write different types of lines:
  - Dialogue
  - Thought
  - Narration
  - Context
- Automatically capitalize the first character of newly entered or edited lines.
- Edit existing lines directly.
- Delete individual lines or select multiple lines with mouse drag / long press.
- Automatically scroll to the newest content.
- Navigate between scenes without manually searching through the script.

### Word suggestions (no AI)
- A suggestion bar above the script input, like a phone keyboard: up to three chips that complete the word being typed or fix a likely typo.
- Fully local and deterministic: no model download, no network requests, no WebGPU. Works on every device, including iOS.
- Conservative by design: it never edits the text on its own. A chip is applied only when tapped (or with `Tab` for the first one).
- Learns from the script itself: words from existing lines and character names rank above the built-in Spanish word list (`src/lib/suggest/spanish_words.ts`, easy to extend).
- Handles accent restoration (`estacion` → `estación`) and one/two-letter typos (`habalr` → `hablar`).

### Projects
- Group related scripts under a project. Create, rename and delete projects from the script list; pick the project of a script from the editor header.
- Deleting a project never deletes its scripts: they move to "Sin proyecto".
- "+ Script" inside a project opens the editor with that project preselected.

### Spanish / English tabs
- Every script has an **Español | English** tab pair. The structure (scenes, characters, order, line types) is shared and edited in Spanish; the English tab only holds the translation of each line and of the title.
- The project does not translate anything: the English text is pasted or typed by hand (for example, from an external translator).
- The English tab shows the Spanish line as a reference above each translation input, highlights untranslated lines, shows a `translated / total` counter, and `Enter` jumps to the next line.
- Export: `.txt` follows the active tab (untranslated lines appear as `{{Spanish text}}` in English); `.json` contains both languages (`content` and `content_en`).

### Authentication and persistence
- Email/password registration and login.
- Secure HTTP-only session cookies.
- Automatic session refresh through a shared authentication helper.
- Per-user script storage in Supabase.
- Row Level Security (RLS) policies protect profiles, scripts, characters, and script lines.
- Server-side request validation with Zod.

### Import / export
Scripts can be exported from the editor as:
- `.txt`
- `.json`

The JSON export preserves the script structure, characters, scenes, line types, and script ID.

### Themes
- Light and dark themes are supported.
- Character labels receive dynamically generated colors to make speakers easier to distinguish.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Astro 6 |
| UI | Svelte 5 |
| Styling | Tailwind CSS 4 + custom CSS |
| Language | TypeScript |
| Authentication | Supabase Auth |
| Database | Supabase / PostgreSQL |
| Validation | Zod |
| Deployment adapter | Vercel |

The project is configured as a server-rendered Astro application using the Vercel adapter.

---

## Requirements

For the regular application:

- Node.js
- npm
- A Supabase project

---

## Getting Started

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd metroh_script_maker
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the environment file

Create a `.env` file in the project root:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
```

Do not commit `.env` to the repository.

### 4. Configure the database

The project includes the complete database setup in:

```text
src/supabase/init.sql
```

Run that SQL against your Supabase/PostgreSQL database.

If you already have data, do **not** run `init.sql` (it drops everything). Run `src/supabase/migration_001_projects_and_english.sql` instead: it is non-destructive and safe to run more than once.

The schema creates:

- `profiles`
- `scripts`
- `characters`
- `script_lines`

It also configures:

- automatic profile creation for new auth users
- Row Level Security policies
- script CRUD helper functions
- automatic `updated_at` timestamps

### 5. Start the development server

```bash
npm run dev
```

Astro will print the local development URL in the terminal.

---

## Available Scripts

```bash
npm run dev       # Start the development server
npm run build     # Create a production build
npm run preview   # Preview the production build locally
npm run astro     # Run the Astro CLI
```

---

## Keyboard Shortcuts

The editor includes several productivity shortcuts.

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + S` | Save the current script |
| `Shift + Space` | Focus the main script input |
| `Shift + Numpad +` | Add a new character |
| `Shift + Enter` | Insert a new scene at the end |
| `Shift + Arrow Up` | Go to the previous scene |
| `Shift + Arrow Down` | Go to the next scene |
| `Shift + Arrow Left` | Select the previous character |
| `Shift + Arrow Right` | Select the next character |
| `Shift + Z` | Cycle through dialogue → thought → narration → context |
| `Escape` | Close menus / dialogs or exit selection mode |
| `Tab` | Accept the first word suggestion (only while the suggestion bar has one) |

`Ctrl + S` becomes `Cmd + S` on macOS.

In the English tab only `Ctrl + S`, `Escape` and the scene navigation shortcuts apply; shortcuts that change the structure of the script are ignored.

---

## Word Suggestions Architecture

```text
ScriptInputZone ── SuggestionBar (chips)
      │
      ▼
script.store.svelte.ts  (vocab version + `suggestions` derived)
      │
      ▼
suggest.engine.ts  (pure TypeScript, no DOM, no Svelte)
      │
      ▼
spanish_words.ts  (base vocabulary)
```

- `suggest.engine.ts` is pure and testable with plain Node. It only looks at the last word of the input and only when the cursor is attached to it (nothing is suggested after a space or punctuation).
- Ranking: character names > words already used in the script > base vocabulary; shorter completions win ties.
- Typo corrections (Damerau-Levenshtein distance ≤ 1, or ≤ 2 for words of 8+ letters) are only offered when the typed text does not complete any known word.

---

## Data Model

The database separates projects, scripts, characters, and individual lines.

```text
profiles
   │
   ├── projects
   │      │
   │      └── (scripts.project_id, optional)
   │
   └── scripts
          │
          ├── characters
          │
          └── script_lines
```

- `scripts.project_id` is nullable and uses `ON DELETE SET NULL`, so deleting a project keeps its scripts.
- Project names are unique per user (case-insensitive).
- `scripts.name_en` and `script_lines.content_en` hold the English version. They are nullable: `NULL` means "not translated yet". Characters, scenes, order and line types are shared by both languages.

`script_lines.line_type` can contain:

```text
dialogue
thought
narration
context
scene
```

Scenes and context lines do not require a character.

Saving a script uses a PostgreSQL function (`upsert_script`) so the complete script structure can be written consistently in one operation.

---

## API Routes

The application exposes its own Astro API routes.

### Authentication

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
```

### Scripts

```text
GET  /api/script/list
POST /api/script/save
POST /api/script/delete
```

### Projects

```text
POST /api/project/create
POST /api/project/rename
POST /api/project/delete
```

Projects are listed server-side (`get_user_projects`) when the script list and the editor render. Deleting a project does not delete its scripts.

The save endpoint validates the request body with Zod before calling the database RPC function.

Authentication-sensitive API routes first validate the session using the shared `require_auth()` helper.

---

## Project Structure

```text
src/
├── components/
│   ├── ScriptEditor/
│   │   ├── CharacterMenu.svelte
│   │   ├── ScriptEditor.svelte
│   │   ├── ScriptHeader.svelte
│   │   ├── ProjectPicker.svelte
│   │   ├── ScriptInputZone.svelte
│   │   ├── ScriptLines.svelte
│   │   ├── ScriptOnboarding.svelte
│   │   └── SuggestionBar.svelte
│   ├── ScriptList/
│   │   └── ScriptList.svelte
│   └── ui/
│       └── Icon.svelte
│
├── lib/
│   ├── suggest/
│   │   ├── spanish_words.ts
│   │   └── suggest.engine.ts
│   ├── script.store.svelte.ts
│   └── script.utils.ts
│
├── pages/
│   ├── api/
│   │   ├── auth/
│   │   └── script/
│   ├── auth/
│   ├── scripts/
│   └── index.astro
│
├── supabase/
│   ├── init.sql
│   └── supabase.ts
│
├── types/
│   └── script.ts
│
└── utils/
    └── auth.ts
```

---

## Security

The application includes several layers of protection around authenticated data:

- Authentication state is stored in HTTP-only cookies.
- Authenticated routes use a centralized session validator.
- Database tables have Row Level Security enabled.
- RLS policies restrict data access to the authenticated user's records.
- Script mutations validate the request body with Zod.
- Database functions verify `auth.uid()` before operating on a script.

The Supabase client is created per request instead of being reused as a global singleton, preventing session state from being shared accidentally between concurrent requests.

---

## Design Notes

The editor intentionally keeps the domain logic separate from the UI components:

- `script.store.svelte.ts` manages editor state and operations.
- `script.utils.ts` contains pure script/export utilities.
- `suggest.engine.ts` implements word completion and typo correction.
- `spanish_words.ts` holds the built-in Spanish vocabulary.

---

## Current Limitations

- Suggestions are Spanish-only and word-level (no next-word prediction); the English tab has no suggestion bar.
- Editing a Spanish line after translating it does not mark its English text as outdated.
- Character names are shared between languages (there is no per-language name).

## Author

[METRO3H](https://github.com/METRO3H)
