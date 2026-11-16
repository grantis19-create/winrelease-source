# Security policy

## Reporting a vulnerability

Please report security problems in the WinRelease Helper or the WinRelease website **privately**, not in a public issue. Use this repository's
**Security tab > Report a vulnerability** (GitHub's private reporting): only the maintainers can see it. Include the Helper version (the exe file's
Properties > Details tab, or the site's Settings page), what you did, and what happened. Please give us a reasonable time to fix a problem before you
discuss it publicly.

For anything that is not a security problem (bugs, questions, ideas), use the public tracker: https://github.com/grantis19-create/winrelease-feedback

## What is in scope

- The Helper: the local program that listens only on `127.0.0.1:5601` and builds MSIs on your PC.
- The website, winrelease.geappsolutions.com (a static site: it holds no accounts and no project data).

## Supported versions

Only the newest Helper release is supported. Check the SHA-256 of what you downloaded against the value on the release page and on the website.

## Out of scope

Third-party software WinRelease uses (the WiX Toolset, .NET), and MSIs you build yourself: report those to their owners.

WinRelease is free and provided as is. This policy is a courtesy, not a warranty.
