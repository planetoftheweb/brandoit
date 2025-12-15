# BranDoIt Studio

![BranDoIt Studio](./brandoit.png)

An AI-powered brand design studio that helps you generate cohesive visual assets using Google's Gemini API.

## Features

- **AI Graphic Generation:** Create logos, icons, social media posts, and banners.
- **Brand Consistency:** Enforce color palettes and visual styles across all generated assets.
- **Smart Refinement:** Iteratively refine images with natural language prompts.
- **Brand Analysis:** Upload brand guidelines to automatically extract colors and styles.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Styling:** Tailwind CSS
- **AI:** Google Gemini API (`gemini-2.5-flash-image`, `gemini-2.5-flash`)
- **Icons:** Lucide React
- **Font:** Mona Sans & Inter

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- A Google Gemini API Key

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/planetoftheweb/brandoit.git
    cd brandoit
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Set up environment variables:
    Create a `.env` file in the root directory and add your API key:
    ```env
    GEMINI_API_KEY=your_api_key_here
    ```

4.  Start the development server:
    ```bash
    npm run dev
    ```

## Building for Production

To create a production build:

```bash
npm run build
```

The output will be in the `dist` directory.

## Deployment

This project is configured for deployment on [Render](https://render.com).
Ensure you add the `GEMINI_API_KEY` environment variable in your Render service settings.

## License

MIT
