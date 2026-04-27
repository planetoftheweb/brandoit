# BranDoIt Studio

![BranDoIt Studio](./screenshot.png)

An AI-powered brand design studio that helps you generate cohesive visual assets using Google's Gemini API.

## Features

*   **🎨 AI Graphic Generation:** Create logos, icons, social media posts, and banners.
*   **🧩 Brand Consistency:** Enforce color palettes and visual styles across all generated assets.
*   **👥 Teams & Collaboration:** Create teams and share styles/colors with your teammates.
*   **🛠️ Smart Resource Management:** 
    *   Organized dropdowns (Defaults, Private, Team, Public).
    *   Search and filter capabilities.
    *   Admin controls for System Defaults.
*   **📂 Normalized Database:** Uses a smart "spreadsheet-like" structure to manage resources with flexible scoping (`private`, `public`, `team`, `system`).
*   **🌍 Community Catalog:** Browse public items shared by other users.
*   **💾 Cloud History:** Automatically saves your generation history with metadata in Firestore and raster image bytes in Firebase Storage (`users/{uid}/history/{generationId}/{versionId}.{ext}`), so tiles never bump into the 1 MiB Firestore document limit and deletes clean up Storage automatically.
*   **🖼️ Smart Analysis:** Upload brand guidelines (PDF/Image) to extract colors and styles with an interactive review modal.
*   **✨ Prompt Expansion:** One-click prompt enhancement using AI to generate detailed visual descriptions from simple text.
*   **👤 User Profiles:** Sign up with Email or Username. Sync preferences across devices.
*   **⚙️ Full Settings Management:** dedicated page for managing API keys, profile settings, and application preferences.
*   **🔑 BYOK (Bring Your Own Key):** Multi-model keys for Google Gemini and OpenAI. A single OpenAI key drives three tiers — **GPT Image 2** (flagship, 2K/4K, 3:1 & 1:3 ratios), **GPT Image Mini** (budget), and **GPT Image 1.5** (legacy) — with a per-model **Quality** control (Auto / Low / Medium / High).
*   **🧠 Refinement Workspace:** Per-image refine model + target size controls, built-in correction analysis prompt generator, and style-reference fallback for difficult recompositions.
*   **🧬 Versioned Iteration:** Mark-based generation/refinement history with restore, per-refinement deletion, and per-version aspect-ratio tracking so follow-up edits keep the correct size.
*   **📝 Better Prompt Editing:** Compact refine textbox with optional full-screen prompt editor and keyboard submit shortcut (`Cmd/Ctrl + Enter`).
*   **📋 Clipboard-friendly UX:** Copy prompts, image URLs, or the actual images with centered toast feedback for every action (generate, download, delete, restore). Overlays show model, prompt, tags, and timestamps.
*   **⚡ Batch generation:** Numeric `QTY` plus brace expansion in prompts, pre-send size and duration estimates, and one history tile with Mark I / II / III grouping (with per-mark expanded prompts and thumbnails).
*   **🪟 Concurrent background runs:** Each Generate click runs as its own backgrounded job — the toolbar stays unblocked so you can keep typing or fire off another run, and a floating "Active Generations" monitor surfaces every job with elapsed/ETA, throughput-aware estimates, per-model progress chips, a "View latest result" jump, and per-job stop / dismiss controls.
*   **🆚 Comparison mode:** Generate across multiple models, then compare marks inline in the main viewport with a swipe slider (plus side-by-side export) and shift-click quick-pick from thumbnails/history.
*   **⬇️ Unified downloads:** Single download menu on the main preview and in history for PNG, WebP, SVG, or HTML; download-all zips every generation mark; export selected tiles as a ZIP from Recent Generations.
*   **🖼️ Thumbnail rail:** When a tile has multiple marks, browse and preview versions from a left rail without leaving the main viewport.
*   **📄 Site footer:** Copyright plus quick links to the changelog and GitHub releases.
*   **🛡️ Admin panel:** Claims-based admin role (Firebase Auth custom claims, not a hardcoded username) with a compact, information-dense user table — expandable rows for full profile details, icon-based status pills (model, keys, admin, suspension) with hover tooltips, relative "last seen" times, and a sticky action column for clear API keys, wipe system prompts, suspend / unsuspend accounts, promote or demote admins, and conservatively delete user data (Firestore + Storage + Auth). Suspended users are hard-blocked with a clear notice.
*   **📊 Admin usage stats:** Live dashboard with total images generated, refinements, active users, signups/day and images/day for the last 30 days, breakdowns by model / graphic type / visual style / aspect ratio, and a top-users leaderboard — aggregated directly from Firestore with one `collectionGroup('history')` query.

## Tech Stack

*   **Frontend:** React 19, TypeScript, Vite
*   **Styling:** Tailwind CSS v4 (CSS-first configuration)
*   **Backend / BaaS:** Firebase
    *   **Authentication:** Email/Password & Profile Management
    *   **Firestore:** Real-time NoSQL Database (Normalized Structure)
    *   **Storage:** Profile photos & Asset storage
*   **AI:** Google Gemini (`gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`, `gemini-2.5-flash`) and OpenAI (`gpt-image-2`, `gpt-image-1-mini`, `gpt-image-1.5`)
*   **Icons:** Lucide React
*   **Font:** Mona Sans & Inter

## Getting Started

### Prerequisites

*   Node.js (v18 or higher)
*   A Google Gemini API Key
*   A Firebase Project (Auth, Firestore, and Storage enabled)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/planetoftheweb/brandoit.git
    cd brandoit
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up Environment Variables:**
    Create a `.env` (or `.env.local`) file in the root directory. **Keys must start with `VITE_`**.

    ```env
    # Google Gemini AI
    VITE_GEMINI_API_KEY=your_gemini_key

    # Firebase Configuration
    VITE_FIREBASE_API_KEY=your_firebase_api_key
    VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=your_project_id
    VITE_FIREBASE_STORAGE_BUCKET=your_bucket.appspot.com
    VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_id
    VITE_FIREBASE_APP_ID=your_app_id
    ```
    *Note: The app includes a built-in "Configuration Error" screen that will alert you if any of these keys are missing.*

4.  **Configure Firebase Storage CORS:**
    To allow image uploads from localhost and your production domain, you must apply CORS rules to your Storage bucket.
    
    *   Ensure `cors.json` exists in your project root.
    *   Run this command (requires `gsutil` or Google Cloud CLI):
        ```bash
        gsutil cors set cors.json gs://<your-bucket-name>
        ```

5.  **Start the development server:**
    ```bash
    npm run dev
    ```

## Database Structure

The application uses a normalized Firestore structure with **Row-Level Security** based on scopes:

*   `/users/{userId}`: User profiles and private settings.
*   `/teams/{teamId}`: Team metadata and member lists.
*   `/visual_styles`, `/brand_colors`, `/graphic_types`, `/aspect_ratios`: 
    *   Unified collections storing **all** items.
    *   `scope`: Determines visibility (`system`, `private`, `public`, `team`).
    *   `ownerId`: The user who created the item.
    *   `teamId`: Required if scope is `team`.

## Building for Production

To create a production build:

```bash
npm run build
```

The output will be in the `dist` directory.

## Deployment

This project is configured for deployment on [Render](https://render.com) as a Static Site.
Ensure you add all the Environment Variables listed above in your Render service settings.

## License

MIT

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for a full, versioned history of changes.
