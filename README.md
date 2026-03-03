# SMP Admissions

Student Enrollment Web Application for SMP Polytechnic — built with React 19, TypeScript, Vite 6, Tailwind CSS 4, and Firebase.

## Features

- Firebase Authentication (email/password)
- Firestore with offline persistence (IndexedDB)
- Enroll and manage student records
- Auto-calculated Maths+Science totals
- Client-side filtering by course, year, gender, and search (debounced)
- Edit mode via `/enroll?edit=<id>`
- Academic year setting with 5-minute cache

## Setup

1. Copy `.env.example` to `.env` and fill in your Firebase credentials.
2. Deploy Firestore rules and indexes:
   ```
   firebase deploy --only firestore
   ```
3. Create a Firebase Authentication user in the Firebase Console.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy to Firebase Hosting

```bash
npm run build
firebase deploy
```

## Project Structure

```
src/
  config/firebase.ts       Firebase app + Firestore + Auth
  contexts/AuthContext.tsx  Auth state, login/logout
  components/
    common/                Button, Input, Select, Modal
    layout/                Layout, Header, Sidebar
  hooks/
    useSettings.ts         App settings with cache
    useStudents.ts         Students by academic year
  pages/
    Login.tsx              Email/password login
    Students.tsx           Filtered student list
    EnrollStudent.tsx      Add/edit form
    Settings.tsx           Academic year setting
  services/
    settingsService.ts     Firestore settings CRUD
    studentService.ts      Firestore students CRUD
  types/index.ts           All TypeScript types
  utils/validation.ts      Form validation
```
