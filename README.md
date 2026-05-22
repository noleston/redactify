<a href="https://redactify-two.vercel.app">
    <img width="1024" alt="Redactify Preview" src="https://github.com/noleston/redactify/blob/main/public/redactify-bg.png" />
</a>

<div align="center">

### Private, browser-based sensitive data masking & PII detection

</div>

<p align="center">
Sanitize logs, code, and documents without leaving your browser.<br />
No data egress, no telemetry, just pure client-side processing.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Client--side-D30000?style=flat-square&logo=data:image/svg%2bxml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz48IS0tIFVwbG9hZGVkIHRvOiBTVkcgUmVwbywgd3d3LnN2Z3JlcG8uY29tLCBHZW5lcmF0b3I6IFNWRyBSZXBvIE1peGVyIFRvb2xzIC0tPg0KPHN2ZyB3aWR0aD0iODAwcHgiIGhlaWdodD0iODAwcHgiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4NCjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNCA2VjRDNCAxLjc5MDg2IDUuNzkwODYgMCA4IDBDMTAuMjA5MSAwIDEyIDEuNzkwODYgMTIgNFY2SDE0VjE2SDJWNkg0Wk02IDRDNiAyLjg5NTQzIDYuODk1NDMgMiA4IDJDOS4xMDQ1NyAyIDEwIDIuODk1NDMgMTAgNFY2SDZWNFpNNyAxM1Y5SDlWMTNIN1oiIGZpbGw9IndoaXRlIi8+DQo8L3N2Zz4=" alt="Execution" />
  <img src="https://img.shields.io/badge/React-D30000?style=flat-square&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/Vite-D30000?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Monaco_Editor-D30000?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xNy4xIDIuM0w4LjIgMTAuNkwzLjcgNy4yTDIgOC4xVjE1LjlsMS43LjkgNC41LTMuNCA4LjkgOC4zIDQuOS0yVjQuM0wxNy4xIDIuM3pNMTYuOSA3LjR2OS4yTDEwLjkgMTJsNS45LTQuNnoiLz48L3N2Zz4=" alt="Monaco" />
  <img src="https://img.shields.io/badge/license-MIT-D30000?style=flat-square&logo=github&logoColor=white" alt="License" />
</p>


## Why Redactify?

**[Redactify](https://github.com/noleston/redactify)** is a utility designed for fast and secure removal of sensitive information from logs, code, or documents. 

Everything runs locally in your browser memory via Web Workers, ensuring no data ever leaves your device. No analytics, no telemetry, no cloud API calls.


## Core Features

- **Dual-Pane Monaco Editor**: Live synchronized scrolling, editing, and cursor selections between input and masked output panes.
- **Smart Selection snapping**: Automatically snaps selection boundaries to whole words for clean manual redactions.
- **Background PII Scan Pipeline**: Offloads heavy regex matching to a dedicated Web Worker, preventing UI freezes during large document analysis.
- **Advanced Context-Aware Scoring**: High-accuracy detection engine that validates context surrounding matched patterns using Levenshtein distance (fuzzy matching) and positive/negative keywords to reduce false positives.
- **Strict Verification Engines**: Incorporates checksum validations like the **Luhn Algorithm** (Credit Cards) and Russian **INN / SNILS** validation.
- **Flexible Masking Strategies**:
  - **Blackout**: Replaces characters with block symbols `████`.
  - **Mask**: Obfuscates alphanumeric values while preserving length (`Jo***h`).
  - **Tag / Pseudonymize**: Generates persistent identifiers per unique entity (e.g. `[EMAIL-1]`, `[JWT_TOKEN-1]`).
- **Undo / History Support**: Full `Ctrl + Z` history support for both editor text updates and custom manual redactions.


## Supported PII Categories & Rules

| Category | Detected Entities | Validations & Context Details |
| :--- | :--- | :--- |
| 🔑 **Credentials** | JWT Tokens, AWS Secret Access Keys, Database Passwords (in URLs), Proxy Usernames & Passwords, Generic Passwords, UUID / Client IDs, WireGuard Private Keys, Reality Public Keys & Short IDs, Config/YAML Docker Secrets, SSH Private Key Blocks. | Validation checks (looksLikeSecret logic), specific proxy/VPN context filtering. |
| 👤 **Identity** | Person Names (Russian ФИО patterns), Passport (RU) numbers, INN (RU), SNILS (RU), Date of Birth. | INN/SNILS checksum verification, Russian grammar context detection. |
| 💳 **Financial** | Credit Cards (Visa, Mastercard, Amex, etc.), Bank Accounts (20-digit), Routing Numbers (9-digit), Financial Last 4. | Luhn algorithm verification for credit cards. |
| 📞 **Contact** | Emails, Phone Numbers (RU & US formats), Russian Residential Addresses. | Address trigger phrase anchoring, mail transport protocol headers detection. |
| 🌐 **Network** | IPv4 Addresses, Proxy Server IPs, VPN Config Links (`vless://`, `vmess://`, `ss://`, `trojan://`, `clash://`, `amnezia://`). | VPN link structure mapping. |


## Keyboard Shortcuts

| Action | Shortcut | Result |
| :--- | :--- | :--- |
| **Blackout** | `Ctrl + B` | Replace manual selection with `█` blocks |
| **Remove** | `Ctrl + Backspace` | Delete manual selection from the output |
| **Undo** | `Ctrl + Z` | Revert the last manual redaction or edit |
| **Search** | `Ctrl + F` | Search and replace inside the editor |
| **Close Search** | `Escape` | Close the search widget |


## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```

### 3. Build Production Bundle
```bash
npm run build
```
