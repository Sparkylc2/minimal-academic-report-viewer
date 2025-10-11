
## About
This is a minimal PDF and Markdown viewer built for keyboard-driven workflows. There's no title bar, menu bar, or toolbars, just the content. I made this because I wanted something that matched my borderless terminal setup and didn't get in the way while writing reports.

The viewer has grown to include workspace management, a quick reference system for sources, and web browsing for research. It's designed to be lightweight and keep everything accessible via keyboard shortcuts.

### The viewer
<img width="504" height="327.33" alt="Screenshot 2025-10-01 at 13 54 46" src="https://github.com/user-attachments/assets/9bf064ce-430b-4e67-b7f7-de61a8034c6a" />

### The command palette/search bar
<img width="504" height="327.33" alt="Screenshot 2025-10-01 at 14 14 40" src="https://github.com/user-attachments/assets/48969206-f0b4-4bbe-87f9-8cd2a2d91b76" />

### Search Results
<img width="504" height="327.33" alt="Screenshot 2025-10-01 at 13 55 15" src="https://github.com/user-attachments/assets/5999e293-b344-4877-b143-a5990bf77da2" />

### The Quick List
<img width="640" height="360" alt="Screenshot 2025-10-11 at 12 38 56" src="https://github.com/user-attachments/assets/a84b3ab4-6d38-4350-b5f2-8a22c8196a13" />

### The Workspace List
<img width="640" height="360" alt="Screenshot 2025-10-11 at 12 39 17" src="https://github.com/user-attachments/assets/676c92e4-0ebe-4297-951f-bab3476d2dac" />



## Features

### Document Viewing
- **PDF and Markdown support**: Open and view both PDFs and Markdown files with automatic file watching. When you save changes to your LaTeX PDF or Markdown document, the viewer reloads automatically.
- **Vim-style navigation**: Use `hjkl` or arrow keys to pan, `g` to jump to top, `G` (Shift+g) to jump to bottom. Hold Shift while panning for faster movement.
- **Zoom controls**: `Cmd+=` to zoom in, `Cmd+-` to zoom out, `Cmd+0` to reset. Pinch-to-zoom and trackpad gestures are fully supported with smooth scaling.
- **Page navigation**: Press `Enter` to move forward one page, `Shift+Enter` to go back. 
- **Quick search**: Press `Cmd+p` to open the command palette from any window, it will automatically focus the viewer and open the palette (a global version of `Cmd+t`)

### Tab Management
- **Multiple tabs**: Switch between different web pages and your main document. The PDF/Markdown tab stays pinned on the left.
- **Tab shortcuts**: 
  - `Cmd+t` opens the command palette to create a new web tab
  - `Cmd+Shift+t` reopens the last closed tab
  - `Cmd+w` closes the current web tab (won't close PDF/Markdown tabs)
  - `Cmd+1-9` switches directly to that tab number
- **History navigation**: `Cmd+Left` to go back, `Cmd+Right` to go forward in web tab history

### Command Palette
Press `Cmd+p` to open the command palette. This is your main navigation tool. Just hit enter when you're done:
- **URL navigation**: Type a full URL or domain name to visit a website
- **Web search**: Type anything else to search Google
- **Quick actions**: 
  - Type `s` and press `Tab` to switch to the last web tab
  - Type `p` and press `Tab` to switch to the PDF/Markdown tab
  - Type `b` and press `Tab` to navigate back
  - Type `f` and press `Tab` to navigate forward


The palette appears centered at the top of the window and disappears automatically when you're done.

### Quick List
Press `Cmd+/` to open the Quick List. This is a bookmark system for sources and references:
- **Save sources**: While viewing a web page, press `Cmd+l` to add it to the Quick List
- **Context-aware**: Each PDF or Markdown document has its own separate Quick List
- **Navigation**: Use arrow keys or `Alt+j/k` to move through the list, `Enter` to open a link
- **Input Focus**: Pressing `Esc` while the search box is active will close the Quick List. If pressing `Esc` while a link is selected, it will instead just focus the text input for search.
- **Management**: 
  - Press `d` to delete the selected item
  - Press `r` to rename it
  - Type to filter by title or URL
  - Press `Backspace` with the cursor at the start to remove the last search term
- **Deletion confirmation**: When closing the Quick List after deleting items, you'll be asked to confirm

### Workspace Switcher
Press `Cmd+Shift+/` to open the Workspace Switcher. This manages different documents you're working on:
- **Workspace per document**: Each PDF or Markdown file gets its own workspace, which remembers all your open tabs and their state
- **Switch between documents**: Select a workspace to switch to that document and restore all its tabs
- **Navigation**: Use arrow keys or `Alt+j/k` to move through workspaces, `Enter` to switch
- **Management**:
  - Press `r` to rename a workspace
  - Press `d` to delete a workspace (except the last one)
  - Type to filter by name or file path
- **Persistence**: When you close and reopen a document, all your tabs and scroll positions are restored

### Session State
Your work is automatically saved:
- **View state**: Scroll position, zoom level, and current page are remembered for each document
- **Tab state**: All open tabs, their history, and which tab was active are preserved
- **Workspace state**: Each document's complete state is saved separately
- **Auto-restore**: When you switch workspaces or reopen the viewer, everything comes back exactly as you left it

## Configuration

Clone the repository, `cd` into it, run `npm install` and then `npm link`. This creates a global `arview` command you can run from anywhere.

To open a file: `arview path/to/file.pdf` or `arview path/to/file.md`

### Command-line Options

You can customize appearance via command-line flags:

```bash
arview --pageGap=16 --pageRadius=8 --bg=#181616 --fit=auto file.pdf
```

Available options:
- `pageGap`: Space between pages in pixels (default: 16)
- `pageRadius`: Corner radius for pages in pixels (default: 8)
- `fit`: Initial zoom mode - `width`, `height`, or `auto` (default: auto)
- `bg`: Background color as hex string (default: #181616)
- `marginTop`, `marginRight`, `marginBottom`, `marginLeft`: Window margins in pixels
- `widthPercent`: Width percentage for overlays like Quick List (default: 0.95)

### Keybinding Customization

To change keybindings, you'll need to edit the source files directly (this is temporary and a full configuration scheme will be added later). Here's where to find each type:

**PDF/Markdown navigation** (`modules/pdf_viewer/viewer-client.js` and `modules/markdown_viewer/viewer-client.js`):
- Search for `document.addEventListener("keydown"` to find the main keyboard handler
- Pan speed: Look for `const PAN_BASE_SPEED` around line 420
- Direction keys: Find `if (activePanKeys.has("h"))` to change hjkl bindings

**Tab shortcuts** (`modules/tab_manager.js`):
- Search for `view.webContents.on("before-input-event"` around line 150
- Find sections checking for `cmdOrCtrl && key === "t"` and similar to change tab bindings

**Global shortcuts** (`main.js`):
- Search for `function registerKeyboardShortcuts()` around line 500
- Find `globalShortcut.register` calls to change Command Palette, Quick List, and Workspace Switcher bindings

**Command Palette** (`modules/command_palette/palette.html`):
- Search for `input.addEventListener("keydown"` around line 60 to change internal palette shortcuts

## Neovim Integration

For LaTeX workflows with VimTeX:

```lua
{
    "lervag/vimtex",
    ft = "tex",
    event = "VeryLazy",
    init = function()
        vim.g.vimtex_view_method = "general"
        vim.g.vimtex_view_general_viewer = "arview"
        vim.g.vimtex_view_general_options = ("--ppid %d @pdf"):format(vim.fn.getpid())
        vim.g.vimtex_view_use_temp_files = 0
        vim.g.vimtex_view_automatic = 1

        vim.g.vimtex_compiler_latexmk = {
            backend = "biber",
            executable = "latexmk",
            continuous = 1,
            options = {
                "-interaction=nonstopmode",
                "-synctex=1",
                "-file-line-error",
                "-shell-escape",
                "-view=none",
            },
        }

        vim.g.vimtex_complete_enabled = 1
        vim.g.vimtex_complete_close_braces = 1
        vim.g.vimtex_compiler_method = "latexmk"
        vim.g.vimtex_compiler_latexmk_engines = { _ = "-xelatex" }
        vim.g.vimtex_bibliography_autoload = { filenames = { "**/bibliography/*.bib" } }
    end,
},
```

The `--ppid` flag keeps the viewer running only while Neovim is open. When you compile your LaTeX document, the PDF updates automatically.

## Notes

This project started as a simple borderless PDF viewer and expanded based on what I needed while writing reports. Some features are minimal implementations. If you want to contribute or add features, feel free to do so.

The goal is to keep it lightweight and keyboard-focused, not to build a full-featured PDF editor.
