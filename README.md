<p align="center">
  <img src="https://raw.githubusercontent.com/noleston/redactify/refs/heads/main/public/redactify-logo.png" alt="Redactify Logo" width="80%" />
</p>

<div align="center">

### Private, browser-based sensitive data masking

</div>

<p align="center">
Sanitize logs, code, and documents without leaving your browser.<br />
No data egress, no telemetry, just pure client-side processing.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Client--side-D30000?style=flat-square&logo=data:image/svg%2bxml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz48IS0tIFVwbG9hZGVkIHRvOiBTVkcgUmVwbywgd3d3LnN2Z3JlcG8uY29tLCBHZW5lcmF0b3I6IFNWRyBSZXBvIE1peGVyIFRvb2xzIC0tPg0KPHN2ZyB3aWR0aD0iODAwcHgiIGhlaWdodD0iODAwcHgiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4NCjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNCA2VjRDNCAxLjc5MDg2IDUuNzkwODYgMCA4IDBDMTAuMjA5MSAwIDEyIDEuNzkwODYgMTIgNFY2SDE0VjE2SDJWNkg0Wk02IDRDNiAyLjg5NTQzIDYuODk1NDMgMiA4IDJDOS4xMDQ1NyAyIDEwIDIuODk1NDMgMTAgNFY2SDZWNFpNNyAxM1Y5SDlWMTNIN1oiIGZpbGw9IndoaXRlIi8+DQo8L3N2Zz4=" alt="Execution" />
  <img src="https://img.shields.io/badge/React-D30000?style=flat-square&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/Vite-D30000?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Monaco_Editor-D30000?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xNy4xIDIuM0w4LjIgMTAuNkwzLjcgNy4yTDIgOC4xVjE1LjlsMS43LjkgNC41LTMuNCA4LjkgOC4zIDQuOS0yVjQuM0wxNy4xIDIuM3pNMTYuOCA3LjR2OS4yTDEwLjkgMTJsNS45LTQuNnoiLz48L3N2Zz4=" alt="Monaco" />
  <img src="https://img.shields.io/badge/license-MIT-D30000?style=flat-square&logo=github&logoColor=white" alt="License" />
</p>


## Why Redactify?

**[Redactify](https://github.com/noleston/redactify)** is a utility designed for fast and secure removal of sensitive information from logs, code, or documents.

I built it to solve a specific problem: masking API keys and PII without ever sending data to a third-party server. Everything runs locally in your browser memory, no data leaves your device.


### Features

| Feature | Description |
| :--- | :--- |
| **Dual-pane editor** | Original input on the left, redacted output on the right |
| **Character-preserving masking** | Replace sensitive text with block characters while keeping structure readable |
| **Smart selection** | Snaps selections to word boundaries for cleaner redactions |
| **Monaco Editor** | Search, replace, navigation, and editor behavior powered by the VS Code editor engine |
| **Undo support** | Revert the last redaction quickly |
| **Clipboard export** | Copy the sanitized output in one click |
| **Zero network processing** | All masking happens in browser memory |

### Keyboard Shortcuts

| Action | Shortcut | Result |
| :--- | :--- | :--- |
| **Blackout** | `Ctrl + B` | Replace selection with `█` blocks |
| **Remove** | `Ctrl + Backspace` | Delete selection from the output |
| **Undo** | `Ctrl + Z` | Revert the last redaction |
| **Search** | `Ctrl + F` | Search inside the editor |


### Preview

<p align="center">
  <img src="https://raw.githubusercontent.com/noleston/redactify/refs/heads/main/public/redactify-bg.png" width="100%" />
</p>


### Quick Start

```bash
npm install
npm run dev
npm run build
