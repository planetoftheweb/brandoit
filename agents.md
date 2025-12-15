# Project Agents & Architecture

## Core Philosophy
BranDoIt is an AI-powered design studio helper that streamlines brand asset creation.
We prioritize:
- **Clean, Maintainable Code:** Modular services and components.
- **Modern React Patterns:** Hooks, Functional Components, Composition.
- **Type Safety:** Strict TypeScript interfaces for all data structures.
- **Efficient Styling:** Tailwind CSS v4 with CSS-first configuration.
- **Robust Data Management:** Normalized Firestore database and Firebase services.

## Agents & Roles
This project is designed to be worked on by specialized AI agents.

### 1. Frontend Agent
**Focus:** UI/UX, React Components, Styling.
- Manages `App.tsx` layout and routing.
- Maintains UI components in `/components` (`ControlPanel`, `ImageDisplay`, `CatalogPage`, `SettingsModal`).
- Ensures responsive design and dark mode compatibility via Tailwind CSS.
- Handles user interactions and visual feedback (loading states, toasts, modals).

### 2. Service Agent
**Focus:** Business Logic, API Integrations, Data Management.
- **Authentication:** `authService.ts` (Firebase Auth & User Profile management).
- **AI Integration:** `geminiService.ts` (Google Gemini API interactions).
- **Data Persistence:** 
    - `resourceService.ts` (Fetches unified System + Custom resources).
    - `historyService.ts` (Manages Generation History with Local/Remote sync).
    - `catalogService.ts` (Community Catalog operations).
- **File Management:** `imageService.ts` (Firebase Storage uploads).
- **Database Structure:** `structureSeeder.ts` (Ensures DB schema integrity).

### 3. DevOps Agent
**Focus:** Build, Deployment, Configuration.
- Manages `vite.config.ts` and `package.json`.
- Handles Environment Variables configuration (`.env`).
- Configures Firebase Security Rules (Firestore & Storage).
- Manages deployment pipelines (Render Static Sites).

## Context & Tech Stack
- **Framework:** React 19 + Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 + PostCSS
- **Backend / BaaS:** Firebase (Auth, Firestore, Storage)
- **AI Model:** Google Gemini 2.0 Flash
- **Icons:** Lucide React
- **Fonts:** Mona Sans & Inter (Locally hosted)

## Data Architecture
The project uses a **Normalized Database Structure** in Firestore to allow efficient sharing and scalability.

### Collections
1.  **`users`**: User profiles, preferences, and private generation history.
2.  **`public_catalog`**: Shared community items (Styles, Colors) with voting.
3.  **Resource Collections** (The "Spreadsheet" Tables):
    *   `graphic_types`
    *   `visual_styles`
    *   `brand_colors`
    *   `aspect_ratios`
    *   *Note:* These collections store both System Defaults (`isSystem: true`) and User Custom Items (`authorId: "..."`).

## Development Guidelines
1.  **Service-Oriented:** Keep business logic out of UI components. Use services.
2.  **Sanitization:** Always sanitize data before sending to Firestore (remove symbols/functions).
3.  **Security:** Respect Firestore Security Rules. User operations must be scoped to their `auth.uid`.
4.  **Types:** Update `types.ts` immediately when data structures change.
