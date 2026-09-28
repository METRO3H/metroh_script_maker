# Metroh Script Maker

![Astro](https://img.shields.io/badge/Astro-6-BC52EE?logo=astro&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)
![WebLLM](https://img.shields.io/badge/WebLLM-1A1A1A?logo=openai&logoColor=white)
![WebGPU](https://img.shields.io/badge/WebGPU-005A9C?logo=webgpu&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white)
![Status](https://img.shields.io/badge/status-active-brightgreen)

A web-based script editor designed for writing and organizing visual-novel style scripts.

Metroh Script Maker combines a focused script-writing interface with account-based storage, scene management, multiple line types, file export, and an optional local AI autocomplete powered by WebLLM and WebGPU.

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

### Local AI autocomplete
- Optional ghost-text autocomplete directly inside the script input.
- Powered by **Qwen3-0.6B** through **WebLLM**.
- Runs in a **Web Worker** so model inference does not block the main UI thread.
- Uses streaming generation to display suggestions progressively.
- Cancels obsolete generations when the user keeps typing.
- Uses conservative response cleanup to avoid duplicated text, formatting artifacts, and multi-line output.
- Requires **WebGPU**.
- The current implementation disables the feature on **iOS**.

The configured model is:

```text
Qwen3-0.6B-q4f16_1-MLC
```

The project uses a 4-bit quantized model and expects roughly **350–400 MB** for the model data.

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
| Local AI | WebLLM |
| AI model | Qwen3-0.6B (`q4f16_1`) |
| GPU acceleration | WebGPU |
| AI isolation | Web Worker |
| Deployment adapter | Vercel |

The project is configured as a server-rendered Astro application using the Vercel adapter.

---

## Requirements

For the regular application:

- Node.js
- npm
- A Supabase project

For the local AI predictor:

- A browser with WebGPU support
- A device capable of running the configured WebLLM model
- Sufficient storage/memory for the model

The predictor checks for WebGPU support in the browser before enabling itself. iOS devices are intentionally excluded by the current implementation.

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
| `Tab` | Accept the AI autocomplete suggestion |
| `Escape` while a suggestion is visible | Dismiss the AI suggestion |

`Ctrl + S` becomes `Cmd + S` on macOS.

---

## AI Autocomplete Architecture

The predictor is intentionally separated from the script editor so the editor does not depend directly on WebLLM.

```text
ScriptInputZone
      │
      ▼
  ghost_input
      │
      ▼
predictor_store
      │
      ▼
 predictor.client
      │
      ▼
   Web Worker
      │
      ▼
     WebLLM
      │
      ▼
 Qwen3-0.6B
```

### Why this structure?

The predictor uses a small internal contract:

```ts
interface Predictor {
  readonly status: PredictorStatus;
  load(config: PredictorConfig): Promise<void>;
  predict(req: PredictorRequest): AsyncGenerator<PredictorChunk>;
  unload(): void;
}
```

This keeps the rest of the application independent from the concrete inference engine. Replacing WebLLM with another browser inference API would therefore be localized to the predictor implementation.

### Suggestion flow

1. The user types in the script input.
2. The input waits for a short debounce period.
3. The editor builds a domain-specific prompt from the most recent script lines.
4. The predictor starts a streaming generation.
5. The suggestion is rendered as ghost text over the input.
6. `Tab` accepts the suggestion.
7. Typing again cancels the previous generation and starts a new one.

The implementation also handles repeated model output, `<think>` blocks, formatting artifacts, cursor movement, and aborted requests.

---

## Data Model

The database separates scripts, characters, and individual lines.

```text
profiles
   │
   └── scripts
          │
          ├── characters
          │
          └── script_lines
```

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
│   │   ├── ScriptInputZone.svelte
│   │   ├── ScriptLines.svelte
│   │   └── ScriptOnboarding.svelte
│   ├── ScriptList/
│   │   └── ScriptList.svelte
│   ├── ui/
│   │   └── Icon.svelte
│   └── PredictorToggle.svelte
│
├── lib/
│   ├── predictor/
│   │   ├── ghost_input.svelte.ts
│   │   ├── predictor.client.ts
│   │   ├── predictor.debug.ts
│   │   ├── predictor.store.svelte.ts
│   │   ├── predictor.support.ts
│   │   ├── predictor.types.ts
│   │   └── predictor.worker.ts
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
- `ghost_input.svelte.ts` implements reusable ghost-text behavior.
- `predictor.types.ts` defines the engine-independent predictor contract.
- `predictor.client.ts` contains the concrete WebLLM implementation.
- `predictor.worker.ts` isolates the inference engine from the main thread.
- `predictor.store.svelte.ts` owns predictor lifecycle and state.

This separation makes the AI feature optional and keeps the core editor usable without it.

---

## Current Limitations

- The AI predictor requires WebGPU.
- iOS is currently excluded from AI autocomplete support.
- The configured model is intentionally small; suggestion quality depends on the capabilities of the local model.
- The current editor has one active AI-powered input, so the predictor store does not implement a generation queue for multiple simultaneous inputs.

---

## License

No license has been specified yet.

If this repository is intended for public distribution, add a license file such as `LICENSE` and update this section accordingly.
