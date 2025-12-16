# BranDoIt Studio

![BranDoIt Studio](./brandoit.png)

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
*   **💾 Cloud History:** Automatically saves your generation history to the cloud (Firestore).
*   **🖼️ Smart Analysis:** Upload brand guidelines (PDF/Image) to extract colors and styles with an interactive review modal.
*   **👤 User Profiles:** Sign up with Email or Username. Sync preferences across devices.
*   **🔑 BYOK (Bring Your Own Key):** Option to use your own Gemini API Key for higher rate limits.

## Tech Stack

*   **Frontend:** React 19, TypeScript, Vite
*   **Styling:** Tailwind CSS v4 (CSS-first configuration)
*   **Backend / BaaS:** Firebase
    *   **Authentication:** Email/Password & Profile Management
    *   **Firestore:** Real-time NoSQL Database (Normalized Structure)
    *   **Storage:** Profile photos & Asset storage
*   **AI:** Google Gemini API (`gemini-2.0-flash`)
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
