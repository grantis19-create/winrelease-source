# WinRelease: source for inspection

WinRelease builds simple Windows installer packages (MSIs) from a form in your browser. The website is a static page; the **Helper** is a small program that
runs on your own PC and does the actual build with the WiX Toolset. This repository holds the source of the Helper and the website so that anyone who wants
to know what runs on their PC can read it, build it and check it.

**Status: beta.** Free while in beta. Not affiliated with, endorsed by or sponsored by WiX, FireGiant or Microsoft.

## What is here

| Folder | What it is |
|---|---|
| `src/WinRelease.Helper` | The Helper: a tray program with a small local web server on `127.0.0.1:5601`. |
| `src/WinRelease.Core` | The manifest rules and the WiX generation the Helper uses. |
| `src/*.Tests` | Unit tests for both. |
| `web/packaging-console` | The website (React, TypeScript, Vite). It is what you see at winrelease.geappsolutions.com. |

## What the Helper does and does not do

- Listens **only on your own computer** (`127.0.0.1`), never on the network. It answers only the WinRelease website (a fixed list of allowed origins plus a custom request header).
- Builds your MSI by running the WiX tool that you installed yourself. Your project and files stay on your PC: the website does not upload them.
- Installs itself for **your Windows user only** (no administrator rights) under `%LOCALAPPDATA%\Programs\WinRelease Helper`; it can be removed from Settings > Apps or its tray menu.
- Makes no internet connections of its own. It has no accounts, no telemetry and no auto-update.
- Quits by itself a few minutes after the website is closed.

If you find something here that does not match those statements, please tell us: privately for a security problem (see `SECURITY.md`), otherwise on the public tracker, https://github.com/grantis19-create/winrelease-feedback.

## Check what you downloaded

Every release lists a SHA-256 for `WinRelease.Helper.exe` (release notes and the website's Settings page). See `VERIFY.md` for how to compare it, and `BUILDING.md`
to build the Helper yourself. A build from source is not byte-for-byte identical to the published file (the published one also embeds the build's commit and
is built by the author's machine), but it is the same code and it passes the same tests.

## Licence

Published for **inspection and security review**. Read, build and run it to verify the Helper. You may not redistribute it, sell it, or make a product from it.
See `LICENSE`. The Helper program itself is free to use, including at work: see the Disclaimer in the website's Build Help.

(c) GE App Solutions. All rights reserved.
