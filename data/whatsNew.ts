import type { WhatsNewEntry } from '../types';

/**
 * Curated What's New entries — the single source of truth for the bell
 * dropdown, the spotlight modal, the card grid on the discovery page, and
 * the per-release detail page.
 *
 * Authoring conventions:
 *   - `summary` is a single short sentence shown in the bell preview.
 *   - `blurb` is one paragraph shown on the spotlight modal and on the
 *     image-top grid cards. It should stand on its own without sections.
 *   - `sections` are optional rich, instructional content rendered on the
 *     detail page (`WhatsNewPage` selected-entry view). Each section has a
 *     heading + body + numbered steps with optional icon / kbd markers.
 *   - Entries stay sorted descending by `publishedAt`; the first is the
 *     "hero" on the discovery page.
 *   - One entry per release; mark the headline release with
 *     `featured: true` to trigger the one-time spotlight modal.
 *
 * Icons in steps reference Lucide-react icon names that the detail view
 * resolves via its `ICON_MAP` allowlist; unknown names fall back to a
 * neutral help glyph so a typo never crashes the page.
 */
export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: 'v0.16.0-whats-new',
    title: "Meet the What's New panel",
    summary: 'Every release highlight now lives behind a bell in the header.',
    blurb:
      "A bell in the header collects every release highlight, with a red dot when something is new. Big releases also get a one-time spotlight modal that dismisses for good once you've seen it — so the same announcement never bugs you twice.",
    publishedAt: Date.parse('2026-05-12T22:00:00Z'),
    version: '0.16.0',
    image: '/whats-new/whatsnew-panel.png',
    featured: true,
    sections: [
      {
        heading: 'Read the bell',
        body: 'Every recent update lives behind the bell. A red badge appears whenever a new entry has shipped since you last opened it.',
        steps: [
          { text: 'Open the bell in the top-right of the header.', icon: 'Bell' },
          { text: 'Scroll the dropdown to skim every update in reverse chronological order.' },
          { text: 'Click any row to jump straight to that release\u2019s full guide.', icon: 'ArrowRight' },
        ],
      },
      {
        heading: 'Browse the discovery page',
        body: 'For a more visual experience, the full-page view gives each release a hero illustration and breathing room.',
        steps: [
          { text: 'Open the bell.', icon: 'Bell' },
          { text: 'Click \u201cView all updates\u201d at the very bottom of the dropdown.', icon: 'ArrowRight' },
          { text: 'Click the hero card or any card in the grid to read its guide.' },
        ],
      },
      {
        heading: 'Handle the spotlight modal',
        body: 'When we ship something big, a single one-time modal pops up on app load. Dismissing it remembers your preference per account so it never re-fires.',
        steps: [
          { text: 'Click \u201cRead the guide\u201d for a step-by-step walkthrough of the new feature.', icon: 'BookOpen' },
          { text: 'Or click \u201cGot it\u201d to dismiss and move on.', icon: 'Check' },
          { text: 'Press Esc or click the backdrop \u2014 same result, dismisses and remembers.', kbd: 'Esc' },
        ],
      },
    ],
  },
  {
    id: 'v0.15.0-prompt-image-drop',
    title: 'Drop an image into the prompt box',
    summary: 'Drag a reference image onto the prompt to expand it or use it as style.',
    blurb:
      'Drag any reference image onto the prompt and pick a path: generate a content prompt that respects your toolbar menus, or use the image as a style reference for the next run. Multi-prompt JSON arrays now work too — paste an array of strings to fan out a batch.',
    publishedAt: Date.parse('2026-05-12T00:00:00Z'),
    version: '0.15.0',
    image: '/whats-new/whatsnew-prompt-drop.png',
    sections: [
      {
        heading: 'Drop an image onto the prompt',
        body: 'Drag any image file from your desktop directly onto the prompt textarea. A picker will ask how you want to use it.',
        steps: [
          { text: 'Drag an image file from Finder, the desktop, or another browser tab.', icon: 'Upload' },
          { text: 'Drop it anywhere on the prompt input.', icon: 'Image' },
          { text: 'Choose \u201cUse as content prompt\u201d to expand a prompt from it, or \u201cUse as style reference\u201d to attach it to the next run.', icon: 'Wand2' },
        ],
      },
      {
        heading: 'Paste multi-prompt arrays',
        body: 'Run a batch of variations in one shot by pasting a JSON array of prompts. Each string becomes its own generation tile.',
        steps: [
          { text: 'Compose your prompts as a JSON array, e.g. ["tile one", "tile two", "tile three"].' },
          { text: 'Paste the array into the prompt input.', icon: 'Clipboard' },
          { text: 'Submit \u2014 each entry runs as a separate tile in the gallery.', icon: 'Sparkles' },
        ],
      },
    ],
  },
  {
    id: 'v0.14.0-cmdk-search',
    title: 'Cmd+K to find any past generation',
    summary: 'Press Cmd+K to instantly search recent generations by prompt text.',
    blurb:
      'Hit Cmd+K (or Ctrl+K) anywhere in the app to search recent tiles by prompt. Arrow keys move, Enter opens, Escape closes — your gallery is now one keystroke away.',
    publishedAt: Date.parse('2026-05-08T00:00:00Z'),
    version: '0.14.0',
    image: '/whats-new/whatsnew-search.png',
    sections: [
      {
        heading: 'Search from anywhere',
        body: 'No more scrolling the history rail to find that one tile from yesterday. Just type.',
        steps: [
          { text: 'Press the search shortcut anywhere in the app.', kbd: 'Cmd+K' },
          { text: 'Type any words from a past prompt.', icon: 'Search' },
          { text: 'Use the arrow keys to move between matches.' },
          { text: 'Press Enter to open the selected tile.', kbd: 'Enter' },
          { text: 'Press Escape to close without selecting.', kbd: 'Esc' },
        ],
      },
    ],
  },
  {
    id: 'v0.13.0-byok-analysis-paths',
    title: 'Run analysis and Expand prompt now work with OpenAI keys',
    summary: 'GPT Image users with only an OpenAI key can now run brand analysis and prompt expansion.',
    blurb:
      "If you're a GPT Image user with only an OpenAI key configured, Run analysis and Expand prompt route through gpt-4o-mini automatically. The refine-prompt editor also got a full-screen modal that auto-opens when an analysis plan is ready.",
    publishedAt: Date.parse('2026-05-06T00:00:00Z'),
    version: '0.13.0',
    image: '/whats-new/whatsnew-byok.png',
    sections: [
      {
        heading: 'Brand analysis with an OpenAI key',
        body: 'Brand analysis used to require a Gemini key. It now routes automatically through `gpt-4o-mini` whenever only an OpenAI key is configured.',
        steps: [
          { text: 'Open Settings from the user menu.', icon: 'Settings' },
          { text: 'Paste your OpenAI key under API Keys and save.', icon: 'KeyRound' },
          { text: 'Open the brand panel and click \u201cRun analysis\u201d \u2014 no extra config required.', icon: 'Wand2' },
        ],
      },
      {
        heading: 'Expand prompt routing',
        body: 'The same routing applies to the Expand prompt button next to the prompt input.',
        steps: [
          { text: 'Click \u201cExpand prompt\u201d beside the prompt box.', icon: 'Sparkles' },
          { text: 'The refine-prompt modal opens automatically once the plan is ready.' },
          { text: 'Accept, tweak, or discard the suggestion.', icon: 'Check' },
        ],
      },
    ],
  },
  {
    id: 'v0.12.0-overwrite-presets',
    title: 'Overwrite saved toolbar presets',
    summary: 'Update a saved preset in place when the toolbar changes.',
    blurb:
      'Found a better combination for a preset you already saved? An Overwrite button now appears whenever the live toolbar differs from a preset, so you can update it in place without deleting and re-creating it.',
    publishedAt: Date.parse('2026-05-06T00:00:00Z'),
    version: '0.12.0',
    image: '/whats-new/whatsnew-presets.png',
    sections: [
      {
        heading: 'Overwrite a preset in place',
        body: 'When the live toolbar configuration drifts from the loaded preset, an Overwrite button appears next to the preset name so you can save the new combination over the existing one.',
        steps: [
          { text: 'Load a preset from the preset dropdown.', icon: 'Layers' },
          { text: 'Tweak any toolbar option \u2014 colors, styles, aspect ratio, etc.', icon: 'Pencil' },
          { text: 'Spot the Overwrite button next to the preset name.', icon: 'Save' },
          { text: 'Click it to commit the new combination over the preset.', icon: 'Check' },
        ],
      },
    ],
  },
];
