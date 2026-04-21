# Change: Add Admin Panel

## Why
BranDoIt has no way to see, audit, or clean up users today. User management happens through the Firebase Console by hand: there is no UI to tell which accounts have keys configured, which are stale, or which need to be removed. A hardcoded `username === 'planetoftheweb'` string scattered across four files is the only current gate for admin-only behaviour (seeding, elevated batch limits), which is brittle and impossible to extend to other admins.

Adding a first-class admin surface — backed by Firebase Auth custom claims instead of a username string — makes it possible to promote other admins, clear or revoke a user's API keys, suspend abusive accounts, and fully delete users with a single action, without touching the Firebase Console. It also forces the project's Firestore rules, Storage rules, and Cloud Functions into version control for the first time.

## What Changes
- New admin identity model: Firebase Auth custom claim `admin: true` instead of a username match. `planetoftheweb` is kept only as a bootstrap fallback so the first admin can self-promote.
- Two new Cloud Functions: `setAdminRole(uid, admin)` for promote/demote and `deleteUserAccount(uid)` for conservative full deletion (Firestore `users/{uid}` + subcollections, Storage `users/{uid}/*`, Auth user). Teams and catalog items are intentionally left alone.
- New Firestore field `users/{uid}.isDisabled: boolean`. The app hard-blocks sign-in with a suspension screen when set.
- New Firestore field `users/{uid}.lastSignInAt: Timestamp` written on every sign-in so the admin table has a meaningful "last active" column.
- New admin page at `components/AdminPage.tsx` listing all users with columns for email, name, username, createdAt, lastSignInAt, selected model, configured-key indicators, admin, disabled, and a row-action menu (Clear keys, Wipe system prompt, Disable/Enable, Promote/Demote, Delete).
- Avatar dropdown gets an "Admin" item, visible only when `user.isAdmin`.
- First-time experience: when signed in as `planetoftheweb` without the claim yet, the admin page shows a "Claim admin role" banner that calls `setAdminRole({ uid: self, admin: true })` and refreshes the ID token.
- Firebase tooling added to the repo for the first time: `firebase.json`, `firestore.rules`, `storage.rules`, and a TypeScript `functions/` project (Node 20).
- Hardcoded `planetoftheweb` checks replaced with `user.isAdmin` everywhere, with `username === 'planetoftheweb'` retained only as a transitional OR-clause so the bootstrap cannot be locked out between merge and first promotion.

## Impact
- Affected types: `types.ts` adds `User.isAdmin` (derived from claims, never persisted) and `User.isDisabled` (persisted).
- Affected services: `services/authService.ts` reads claims on auth state change, writes `lastSignInAt`, and strips `isAdmin` from every preference/profile write. New `services/adminService.ts`.
- Affected components: new `components/AdminPage.tsx`; `App.tsx` adds `adminMode` alongside `settingsMode`/`catalogMode`, an avatar-menu entry, and a full-page suspension block when `user.isDisabled`.
- Affected call sites: `services/structureSeeder.ts`, `services/batchGenerationService.ts`, `App.tsx`, `components/ControlPanel.tsx` — each swapped from `username === 'planetoftheweb'` to `user.isAdmin || username === 'planetoftheweb'` (fallback) and targeted for full retirement of the username check in a follow-up.
- New infra files: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `functions/` (package.json, tsconfig.json, src/index.ts, src/admin.ts).
- Deployment is explicitly out of scope: rules and functions are left deploy-ready. Nothing is pushed to Firebase by this change.
