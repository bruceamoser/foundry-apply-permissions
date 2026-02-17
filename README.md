# Cascade Folder Permissions

[![Foundry VTT](https://img.shields.io/badge/Foundry_VTT-v11--v13-informational?style=flat-square)](https://foundryvtt.com)
[![Version](https://img.shields.io/badge/version-0.1.0-blue?style=flat-square)](https://github.com/bruceamoser/foundry-apply-permissions/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE.md)

A Foundry VTT module that adds an **"Apply to Sub-folders"** checkbox to the
**Configure Ownership** dialog when editing a folder's permissions.

Works with **any game system** — no system dependencies.

## The Problem

In Foundry VTT, when you set permissions on a folder (Items, Journal Entries,
Actors, etc.), only the **folder itself** is updated. Documents inside
sub-folders are left unchanged, forcing GMs to manually open every nested
folder and repeat the process.

## The Solution

This module injects a single checkbox into the existing Configure Ownership
dialog. When checked, the ownership settings you choose are **recursively
applied** to every document inside the folder and all of its sub-folders.

No new dialogs, no extra buttons — just one checkbox in the place you already
go to set permissions.

## Features

- **One-click cascade** — apply ownership to an entire folder tree
- **Recursive** — processes all sub-folders at any depth
- **Smart filtering** — only applies concrete permission levels (None, Limited, Observer, Owner); "inherit / no change" values are skipped
- **Batch updates** — uses `DocumentClass.updateDocuments()` for efficient server-side processing
- **V11–V13 compatible** — handles both V1 and V2 Application frameworks
- **Localized** — all UI strings use Foundry's i18n system (English included)

## Installation

### Manifest URL (Recommended)

Paste the following URL into Foundry's **Install Module** dialog
(**Add-on Modules** > **Install Module** > **Manifest URL**):

```
https://github.com/bruceamoser/foundry-apply-permissions/releases/latest/download/module.json
```

### Manual

1. Download the latest release zip from the
   [Releases](https://github.com/bruceamoser/foundry-apply-permissions/releases/latest) page.
2. Extract the `cascade-folder-permissions` folder into your Foundry VTT
   `Data/modules/` directory.
3. Restart Foundry VTT (or reload).
4. Enable **Cascade Folder Permissions** in your world's Module Management
   screen.

## Usage

1. Right-click any folder in the Items, Journal Entries, Actors, Scenes, or
   other sidebar tab.
2. Select **Configure Ownership**.
3. Set the desired permission levels for each player / default.
4. Check **"Apply these permissions to all documents in this folder and its
   sub-folders."**
5. Click **Save Changes**.

All documents nested at any depth under that folder will be updated. A
notification will confirm how many documents were changed and across how many
sub-folders.

## Compatibility

| Foundry VTT | Status   |
|-------------|----------|
| v11         | Minimum  |
| v12         | Compatible |
| v13         | Verified |

This module has **no system dependencies** — it works with any game system.

## How It Works

1. Hooks into `renderDocumentOwnershipConfig` to detect when the dialog is
   opened for a **Folder**.
2. Injects the cascade checkbox and a brief warning note into the dialog.
3. Attaches a `submit` event listener to the form (works across V1 and V2
   Application frameworks).
4. When the form is submitted with the checkbox checked, reads the ownership
   `<select>` values, waits briefly for Foundry's own save to complete, then:
   - Collects the folder and all sub-folders via `Folder#getSubfolders(true)`
     (with a manual traversal fallback).
   - Builds a batch update array for every document in every folder.
   - Calls `DocumentClass.updateDocuments()` to apply ownership in one request.
5. Displays a success or error notification via `ui.notifications`.

## File Structure

```
cascade-folder-permissions/
  module.json
  LICENSE.md
  scripts/
    cascade-permissions.js    # Core module logic
  styles/
    cascade-permissions.css   # Checkbox/note styling
  languages/
    en.json                   # English localization strings
```

## Building a Release

From the repository root:

```bash
npm run build:permissions-release
```

This produces `foundry-apply-permissions/dist/module.json` (stamped manifest)
and `foundry-apply-permissions/dist/cascade-folder-permissions-v*.zip` (release
zip) ready for upload to GitHub Releases.

## License

[MIT](LICENSE.md) — Copyright 2025–2026 Bruce A. Moser

## Acknowledgements

- [Foundry VTT](https://foundryvtt.com/) by Foundry Gaming, LLC
