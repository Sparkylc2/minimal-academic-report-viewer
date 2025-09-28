# Command Palette Module

A Spotlight-like command palette for the minimal PDF/web viewer.

## Features

- **Cmd+P** to open the palette
- **Escape** to close
- **Enter** to execute command

## Current Commands

The palette uses simple detection logic (easily expandable):

```
Input Type          | Action
--------------------|------------------------
http(s)://...      | Navigate directly to URL
domain.com         | Navigate to https://domain.com
anything else      | Google search
```

## Extending the Command System

adding command types: i need to modify `executeCommand()` in `palette.js`:

```javascript
executeCommand(query) {
  const q = query.trim();
  
  if (q.startsWith(':')) {
    // internal command
    const cmd = q.substring(1);
    this.handleInternalCommand(cmd);
  } else if (q.startsWith('>')) {
    // quick action
    const action = q.substring(1);
    this.handleQuickAction(action);
  } else if (q.startsWith('/')) {
    // in-page search
    this.handlePageSearch(q.substring(1));
  } else {
    // default web navigation/search
  }
}
```

## Future Ideas

- **Tab Management**: `:tabs` to list, `:tab <name>` to switch
- **Bookmarks**: `b <name>` to bookmark, `:bookmarks` to list
- **History**: `:history` to browse
- **PDF Mode**: `:pdf <path>` to open PDF
- **Settings**: `:set <option> <value>`
- **Themes**: `:theme dark|light|custom`
- **Fuzzy Finding**: Implement fuzzy search for commands
- **Live Preview**: Show suggestions as you type

## Styling

styled after mac spotlight. Modify `palette.html` to adjust:
- Colors in the CSS variables
- Animation timing
- Dimensions (currently 600x60px)

## Architecture Notes

- Runs as a separate BrowserWindow (child of main)
- Uses IPC for all communication
- Positioned relative to parent window
- Auto-hides on blur
- Minimal performance impact when hidden
