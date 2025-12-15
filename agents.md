# Project Agents & Architecture

## Core Philosophy
BranDoIt is an AI-powered design studio helper that streamlines brand asset creation.
We prioritize:
- Clean, maintainable code
- Modern React patterns (Hooks, Functional Components)
- Type safety with TypeScript
- Efficient styling with Tailwind CSS

## Agents
This project is designed to be worked on by AI agents.
- **Frontend Agent:** Handles React components, UI/UX, and Tailwind styling.
- **Service Agent:** Manages API integrations (Gemini AI), data transformation, and state management logic.
- **DevOps Agent:** Handles build configuration (Vite), deployment (Render), and environment setup.

## Context
- **Framework:** React + Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS (configured via `tailwind.config.js`)
- **AI Integration:** Google Gemini API
- **Icons:** Lucide React

## Development Guidelines
1. **Components:** Keep components small and focused. Use composition.
2. **State:** Use local state for UI interactions, Context for global app state if needed.
3. **Styles:** Use utility classes. Extract complex patterns into components or `@apply` directives only if necessary.
4. **Types:** Define interfaces for all props and data structures in `types.ts`.

