## 1. Infrastructure
- [ ] 1.1 Add `firebase.json` wiring firestore, storage, functions, and emulators
- [ ] 1.2 Add `.firebaserc` with default project `brandoit`
- [ ] 1.3 Add `firestore.indexes.json` (empty composite index set, ready for future indices)
- [ ] 1.4 Scaffold `functions/` as TypeScript (Node 20) with `package.json`, `tsconfig.json`, `src/index.ts`
- [ ] 1.5 Wire `functions/package.json` scripts: `build`, `serve` (emulator), `deploy`, `lint`

## 2. Security Rules
- [ ] 2.1 Create `firestore.rules` with `isOwner()`, `isAdmin()` helpers
- [ ] 2.2 Admin override on `users/{uid}` read + write
- [ ] 2.3 Admin override on `users/{uid}/history/{doc}` read + write
- [ ] 2.4 Admin override on `graphic_types`, `visual_styles`, `brand_colors`, `aspect_ratios`
- [ ] 2.5 Admin override on `teams/{tid}` and team member subcollections
- [ ] 2.6 Create `storage.rules` with owner-only access on `users/{uid}/*` + `isAdmin()` override

## 3. Cloud Functions
- [ ] 3.1 Implement `setAdminRole({ uid, admin })` callable in `functions/src/admin.ts`
- [ ] 3.2 Add bootstrap gate: allow call when caller's Firestore username is `planetoftheweb`
- [ ] 3.3 Call `admin.auth().setCustomUserClaims(uid, { admin })`
- [ ] 3.4 Implement `deleteUserAccount({ uid })` callable (admin-claim gated)
- [ ] 3.5 Deletion order: `recursiveDelete(users/{uid})` → Storage `users/{uid}/*` → `admin.auth().deleteUser(uid)`
- [ ] 3.6 Export both functions from `functions/src/index.ts`

## 4. Admin Service
- [ ] 4.1 Create `services/adminService.ts`
- [ ] 4.2 `isCurrentUserAdmin()` via `getIdTokenResult(true)`
- [ ] 4.3 `listUsers(pageCursor?)` paginated at 25/page, ordered by `createdAt desc`
- [ ] 4.4 `clearUserApiKeys(uid)` and `clearUserSystemPrompt(uid)` via `updateDoc`
- [ ] 4.5 `setUserDisabled(uid, disabled)` via `updateDoc`
- [ ] 4.6 `promoteToAdmin(uid)` / `demoteFromAdmin(uid)` calling `setAdminRole`
- [ ] 4.7 `deleteUserCompletely(uid)` calling `deleteUserAccount`

## 5. Types & Auth Integration
- [ ] 5.1 Add `User.isAdmin?: boolean` (non-persisted) to `types.ts`
- [ ] 5.2 Add `User.isDisabled?: boolean` (persisted) to `types.ts`
- [ ] 5.3 `authService.onAuthStateChange` reads `getIdTokenResult()` claims and attaches `isAdmin`
- [ ] 5.4 Sign-in writes `lastSignInAt: serverTimestamp()` to `users/{uid}`
- [ ] 5.5 `sanitizePreferences` and profile writes strip `isAdmin`

## 6. Admin Page UI
- [ ] 6.1 Create `components/AdminPage.tsx` matching `SettingsPage.tsx` styling
- [ ] 6.2 Header with total count + client-side search box
- [ ] 6.3 Bootstrap self-promote banner (visible only for `planetoftheweb` without claim)
- [ ] 6.4 User table with columns: email · name · username · createdAt · lastSignInAt · selected model · Gemini key · OpenAI key · admin · disabled · Actions
- [ ] 6.5 Row overflow menu: Clear keys · Wipe system prompt · Disable/Enable · Promote/Demote · Delete
- [ ] 6.6 Inline confirmation for destructive actions
- [ ] 6.7 "Load more" pagination using Firestore cursor
- [ ] 6.8 Inline toast-style feedback banner matching `SettingsPage.tsx` on every success/error

## 7. App Wiring
- [ ] 7.1 Add `adminMode` state to `App.tsx` alongside `settingsMode`/`catalogMode`
- [ ] 7.2 Avatar dropdown "Admin" entry, visible only when `user.isAdmin`
- [ ] 7.3 Render `<AdminPage />` inline when `adminMode === true`
- [ ] 7.4 Full-screen suspension block when `user.isDisabled === true`

## 8. Retire Hardcoded Gate
- [ ] 8.1 Replace `username === 'planetoftheweb'` check in `services/structureSeeder.ts` with `user.isAdmin || username === 'planetoftheweb'`
- [ ] 8.2 Same replacement in `services/batchGenerationService.ts`
- [ ] 8.3 Same replacement in `App.tsx`
- [ ] 8.4 Same replacement in `components/ControlPanel.tsx`

## 9. Verification
- [ ] 9.1 Smoke-test against Firebase emulators (`firebase emulators:start`)
- [ ] 9.2 Bootstrap self-promote flow as `planetoftheweb`
- [ ] 9.3 Promote a second user, verify claim propagation
- [ ] 9.4 Clear keys, wipe system prompt, suspend/unsuspend
- [ ] 9.5 Delete a user, verify Firestore `users/{uid}` + history cleared, Storage cleared, Auth record deleted
- [ ] 9.6 Rules + functions left deploy-ready (do NOT run `firebase deploy`)
