# Redactify

A sleek, browser-based text redaction tool. Paste any text, select sensitive fragments, and instantly preview the redacted result — side by side, in real time.

Built with React, Monaco Editor, and Vite.

![Preview](https://img.shields.io/badge/status-live-brightgreen)

## Features

- **Dual-pane editor** — original on the left, redacted preview on the right with synchronized scrolling and cursor mapping
- **Multiple redaction styles** — blackout (`████`), `[REDACTED]` tag, or full removal
- **Smart word snap** — selections automatically expand to word boundaries
- **Strict masking** — character-level masking for fixed-length output
- **Keyboard shortcuts** — `Ctrl+B` blackout, `Ctrl+Backspace` remove, `Ctrl+Z` undo redaction
- **One-click copy** — grab the redacted output instantly
- **Find & Replace** — full Monaco search inside both panes
- **Dark theme** — minimal, VS Code-inspired UI with red accent

## Quick Start

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

## Tech Stack

- **React 19** + **TypeScript**
- **Monaco Editor** — code editor component
- **Zustand** — lightweight state management
- **Motion** — animations
- **Tailwind CSS v4** — styling
- **Vite** — build tooling
- **Lucide** — icons

## License

MIT
