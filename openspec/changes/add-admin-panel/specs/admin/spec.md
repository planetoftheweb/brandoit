## ADDED Requirements

### Requirement: Claims-Based Admin Identity
The system SHALL identify admin users by the Firebase Auth custom claim `admin === true`, not by username string.

#### Scenario: Admin user is recognized
- **WHEN** a signed-in user's ID token contains `claims.admin === true`
- **THEN** the in-memory `User` object exposes `isAdmin === true`
- **AND** the avatar dropdown shows an "Admin" entry
- **AND** the user can navigate to the admin page

#### Scenario: Non-admin user is denied
- **WHEN** a signed-in user's ID token does not contain `claims.admin`
- **THEN** `isAdmin` is `false` on the in-memory `User`
- **AND** the avatar dropdown hides the "Admin" entry
- **AND** direct navigation to the admin page is blocked

#### Scenario: Claim is never persisted
- **WHEN** any service writes to `users/{uid}`
- **THEN** the write payload contains no `isAdmin` field
- **AND** `sanitizePreferences` strips `isAdmin` if provided

### Requirement: Bootstrap Admin via `planetoftheweb` Username
The system SHALL allow the username `planetoftheweb` to promote themselves or any user to admin even without the claim, as a one-time bootstrap path.

#### Scenario: Bootstrap self-promote
- **WHEN** a signed-in user with Firestore `users/{self}.username === 'planetoftheweb'` calls `setAdminRole({ uid: self, admin: true })`
- **THEN** the Cloud Function sets `admin: true` on the target user's custom claims
- **AND** succeeds even though the caller's current token lacks the `admin` claim

#### Scenario: Non-bootstrap caller cannot bootstrap
- **WHEN** a signed-in user whose Firestore `username` is NOT `planetoftheweb` and whose token lacks `admin === true` calls `setAdminRole`
- **THEN** the Cloud Function rejects the call with `permission-denied`

#### Scenario: Admin can promote after bootstrap
- **WHEN** a user already holding `admin === true` calls `setAdminRole` for any uid
- **THEN** the Cloud Function sets the requested claim

### Requirement: Admin User Management Page
The system SHALL provide an admin-only page at which admins can view, search, and act on every user.

#### Scenario: Page renders for admins
- **WHEN** `user.isAdmin === true`
- **THEN** the avatar dropdown exposes "Admin"
- **AND** opening it renders `<AdminPage />` with the user table loaded

#### Scenario: Non-admins cannot open the page
- **WHEN** `user.isAdmin === false`
- **THEN** the avatar dropdown does not expose "Admin"
- **AND** the admin view is not rendered

#### Scenario: Table columns
- **WHEN** the admin page loads
- **THEN** the user table displays: email, name, username, createdAt, lastSignInAt, selected model, Gemini key (yes/no), OpenAI key (yes/no), admin, disabled, Actions

#### Scenario: Search filters loaded rows
- **WHEN** an admin types into the search box
- **THEN** the table filters (case-insensitive) by email, name, or username
- **AND** the filter runs client-side against already-loaded pages

#### Scenario: Pagination loads more
- **WHEN** an admin clicks "Load more"
- **THEN** the next page of up to 25 users is appended to the table
- **AND** the Firestore cursor advances

### Requirement: Admin Row Actions
The system SHALL provide per-row admin actions: Clear keys, Wipe system prompt, Disable/Enable, Promote/Demote admin, Delete account.

#### Scenario: Clear keys
- **WHEN** an admin triggers "Clear keys" on a user
- **THEN** the user's `preferences.apiKeys` is cleared via `updateDoc`
- **AND** a success toast is shown

#### Scenario: Wipe system prompt
- **WHEN** an admin triggers "Wipe system prompt"
- **THEN** the user's `preferences.systemPrompt` is cleared via `updateDoc`
- **AND** a success toast is shown

#### Scenario: Disable a user
- **WHEN** an admin triggers "Disable" on a user
- **THEN** `users/{uid}.isDisabled` is set to `true` via `updateDoc`
- **AND** that user is hard-blocked from the app on their next load

#### Scenario: Enable a user
- **WHEN** an admin triggers "Enable" on a previously disabled user
- **THEN** `users/{uid}.isDisabled` is set to `false`
- **AND** the user regains normal access

#### Scenario: Promote to admin
- **WHEN** an admin triggers "Promote" on a user
- **THEN** the Cloud Function `setAdminRole` sets `admin: true` on the target's claims
- **AND** the admin UI reflects the updated status

#### Scenario: Demote from admin
- **WHEN** an admin triggers "Demote" on an admin user
- **THEN** the Cloud Function `setAdminRole` sets `admin: false` on the target's claims
- **AND** the admin UI reflects the updated status

#### Scenario: Destructive confirm
- **WHEN** an admin triggers any destructive action (Delete, Disable, Clear keys, Wipe prompt, Demote)
- **THEN** an inline confirmation is shown
- **AND** the action proceeds only after explicit confirm

### Requirement: Conservative User Deletion
The system SHALL delete only user-owned data when an admin deletes a user; shared data is preserved.

#### Scenario: What deletion removes
- **WHEN** an admin calls `deleteUserAccount({ uid })`
- **THEN** the Firestore document `users/{uid}` and every document under `users/{uid}/history` is removed
- **AND** every file under Storage path `users/{uid}/` is removed
- **AND** the Firebase Auth user record is removed

#### Scenario: What deletion preserves
- **WHEN** an admin deletes a user
- **THEN** membership records in `teams/*` remain
- **AND** catalog items authored by that user (`graphic_types`, `visual_styles`, `brand_colors`, `aspect_ratios`) remain

### Requirement: Suspended Account Hard Block
The system SHALL hard-block any signed-in user whose `users/{uid}.isDisabled === true` from accessing any feature of the app.

#### Scenario: Disabled user loads the app
- **WHEN** a user with `isDisabled === true` loads the app
- **THEN** a full-screen suspension notice is shown identifying their account
- **AND** no studio, history, settings, catalog, or admin UI is rendered
- **AND** only a sign-out action is available

#### Scenario: Re-enabled user regains access
- **WHEN** an admin sets `isDisabled` back to `false`
- **THEN** the user's next app load proceeds normally to the studio

### Requirement: Sign-In Tracking
The system SHALL record `lastSignInAt: serverTimestamp()` on the user document every time a user signs in.

#### Scenario: Sign-in updates timestamp
- **WHEN** a user signs in (email/password, Google, or token refresh that triggers auth state change)
- **THEN** `users/{uid}.lastSignInAt` is updated to the server timestamp
- **AND** the admin table "last active" column reflects the new value

### Requirement: Codified Security Rules
The system SHALL keep Firestore and Storage security rules under version control with admin override clauses.

#### Scenario: Admin read across users
- **WHEN** a caller with `request.auth.token.admin === true` reads `users/{anyUid}` or `users/{anyUid}/history/{any}`
- **THEN** the Firestore rule allows the read

#### Scenario: Admin write across users
- **WHEN** a caller with `request.auth.token.admin === true` writes `users/{anyUid}` or `users/{anyUid}/history/{any}`
- **THEN** the Firestore rule allows the write

#### Scenario: Admin access in Storage
- **WHEN** a caller with `request.auth.token.admin === true` reads or deletes Storage paths under `users/{anyUid}/`
- **THEN** the Storage rule allows the operation

#### Scenario: Non-admin access unchanged
- **WHEN** a caller without the admin claim accesses another user's data
- **THEN** existing owner-only rules apply and access is denied
