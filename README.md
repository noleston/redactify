<p align="center">
  <img src="https://raw.githubusercontent.com/noleston/redactify/refs/heads/main/public/redactify-logo.png" alt="Redactify Logo" />
</p>

<h1 align="center">Redactify</h1>

<h3 align="center">A sleek, browser-based text redaction tool.</h3>

<p align="center">
Paste any text, select sensitive fragments, and instantly preview the redacted result — side by side, in real time.
</p>

<p align="center">
Built with React, Monaco Editor, and Vite.
</p>



## Why Redactify?

Redactify is a lightweight, browser-based text redaction tool designed for fast and precise removal of sensitive information.

Everything runs locally in your browser — no uploads, no servers, no data leaving your device.



## Features

- **Dual-pane editor** — original text on the left, live redacted preview on the right  
- **Multiple redaction styles** — blackout (`████`), `[REDACTED]`, or full removal  
- **Smart word snapping** — selections automatically expand to word boundaries  
- **Strict masking mode** — character-preserving redaction for consistent layout  
- **Keyboard shortcuts**
  - `Ctrl + B` — blackout selection  
  - `Ctrl + Backspace` — remove selection  
  - `Ctrl + Z` — undo redaction  
- **One-click copy** — instantly copy final output  
- **Find & Replace** — full Monaco-powered search in both panes  
- **Dark UI** — minimal VS Code–inspired interface with red accents  



## Preview

<p align="center">
  <img src="https://raw.githubusercontent.com/noleston/redactify/refs/heads/main/public/redactify-bg.png" width="100%" />
</p>



## Quick Start

```bash
npm install
npm run dev
npm run build
