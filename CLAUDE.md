# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server**: `npm run dev` (Vite, localhost:5173)
- **Build**: `npm run build` (runs `tsc -b && vite build`)
- **Lint**: `npm run lint` (ESLint flat config)
- **Preview build**: `npm run preview`
- **Deploy Firestore rules/indexes**: `firebase deploy --only firestore`
- **Deploy hosting**: `npm run build && firebase deploy`

## Architecture

React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Firebase (Auth + Firestore).

**Data flow**: Services (Firestore CRUD) → Hooks (loading/error/refetch state) → Pages/Components.

**Routing**: `App.tsx` uses `BrowserRouter` with auth-conditional rendering. Unauthenticated users see only `/login`. Authenticated users get `Layout` (Sidebar + Header) wrapping `/students`, `/enroll`, `/settings`. All page components are lazy-loaded via `React.lazy()`.

**Auth**: `AuthContext` wraps the app, provides `user`, `loading`, `login()`, `logout()` via `useAuth()`. Firebase email/password only. Session persists via `onAuthStateChanged`.

**Edit mode**: `/enroll` handles both add and edit. Edit is triggered via `/enroll?edit=<id>` using `useSearchParams`. Students page navigates with `navigate('/enroll?edit=${id}')`.

**Filtering strategy**: Students page fetches all students for current academic year once, then filters client-side (course/year/gender/search) via `useMemo`. Search input is debounced 300ms.

## Key Patterns

**Input uppercase dual-layer**: `Input.tsx` has an `uppercase` prop that applies both CSS `textTransform: 'uppercase'` (visual) AND JS `.toUpperCase()` in onChange (so Firestore receives uppercase values). Both layers are required.

**Auto-calculated marks**: In `EnrollStudent.tsx`, `handleFieldChange` recalculates `mathsScienceMaxTotal` and `mathsScienceObtainedTotal` whenever science/maths marks change. These fields render as `readOnly` inputs with `bg-gray-50`.

**Settings cache**: `settingsService.ts` uses a module-level cache with 5-minute TTL to avoid redundant Firestore reads when Header, Students, and EnrollStudent all call `useSettings()` on mount. Cache invalidates on save.

**Hook refetch pattern**: Hooks use a `tick` state counter as a useEffect dependency. `refetch()` increments tick to trigger re-fetch. Cleanup flag (`cancelled`) prevents setState on unmounted components.

**Service layer**: Pure async functions (not classes). Timestamps stored as ISO strings (`new Date().toISOString()`), not Firestore server timestamps. Document IDs cast via `{ id: snap.id, ...snap.data() } as Type`.

## TypeScript

- **Strict mode** with `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly` (no enums — use union types instead)
- **`verbatimModuleSyntax`**: Use `import type { X }` for type-only imports
- Types are union string literals (e.g., `type Course = 'CE' | 'ME' | ...`), not enums
- `StudentFormData = Omit<Student, 'id' | 'createdAt' | 'updatedAt'>` for form state

## Tailwind CSS 4

- `index.css` uses `@import "tailwindcss"` (NOT `@tailwind base/components/utilities`)
- `postcss.config.js` plugin key is `'@tailwindcss/postcss'` (NOT `'tailwindcss'`)
- No custom theme extensions; all styling via utility classes in JSX

## Firebase

- **Project**: `smp-admissions` (linked in `.firebaserc`)
- **Firestore**: Persistent local cache with `persistentMultipleTabManager()` for offline/multi-tab support
- **Composite index**: `(academicYear ASC, createdAt DESC)` on `students` collection
- **Security rules**: All operations require `request.auth != null`; student create requires `studentNameSSLC`, `course`, `academicYear` fields
- **Env vars**: `VITE_FIREBASE_*` prefix (Vite convention), real values in `.env` (gitignored), template in `.env.example`

## Validation

Mobile numbers: `/^[6-9]\d{9}$/`. Marks: non-negative, obtained ≤ max. All name/address fields, gender, religion, course, year, academicYear, admissionStatus are required.
