# BranDoIt Studio

![BranDoIt Studio](./brandoit.png)

An AI-powered brand design studio that helps you generate cohesive visual assets using Google's Gemini API.

## Features

*   **🎨 AI Graphic Generation:** Create logos, icons, social media posts, and banners.
*   **🧩 Brand Consistency:** Enforce color palettes and visual styles across all generated assets.
*   **🛠️ Custom Resource Management:** Add your own custom styles, colors, and sizes.
*   **📂 Normalized Database:** Uses a smart "spreadsheet-like" structure to manage System Defaults vs. User Custom items seamlessly.
*   **🌍 Community Catalog:** Share your best styles and colors with the community, and vote on favorites.
*   **💾 Cloud History:** Automatically saves your generation history to the cloud (Firestore).
*   **🖼️ Image Analysis:** Upload an image to automatically extract its visual style or color palette.
*   **👤 User Profiles:** Sign up/Login to sync preferences, history, and custom items across devices.
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
    Create a `.env.local` file in the root directory and add your keys:

    ```env
    # Google Gemini AI
    GEMINI_API_KEY=your_gemini_key

    # Firebase Configuration
    VITE_FIREBASE_API_KEY=your_firebase_api_key
    VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=your_project_id
    VITE_FIREBASE_STORAGE_BUCKET=your_bucket.appspot.com
    VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_id
    VITE_FIREBASE_APP_ID=your_app_id
    ```

4.  **Start the development server:**
    ```bash
    npm run dev
    ```

## Database Structure

The application uses a normalized Firestore structure:

*   `/users/{userId}`: User profiles and private settings.
*   `/users/{userId}/history`: Private generation history.
*   `/public_catalog`: Shared community items.
*   `/visual_styles`: System default styles + User custom styles.
*   `/brand_colors`: System default palettes + User custom palettes.
*   `/graphic_types`: System graphic types + User custom types.
*   `/aspect_ratios`: System ratios + User custom ratios.

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
