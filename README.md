## About


<img width="1512" height="982" alt="Screenshot 2025-10-01 at 13 54 46" src="https://github.com/user-attachments/assets/9bf064ce-430b-4e67-b7f7-de61a8034c6a" />
<img width="1512" height="982" alt="Screenshot 2025-10-01 at 14 14 40" src="https://github.com/user-attachments/assets/48969206-f0b4-4bbe-87f9-8cd2a2d91b76" />
<img width="1512" height="982" alt="Screenshot 2025-10-01 at 13 55 15" src="https://github.com/user-attachments/assets/5999e293-b344-4877-b143-a5990bf77da2" />



This viewer is about as minimal as it gets. It has no title-bar, traffic light controls, menu-bar or toolbars. It is just a window for previewing PDFs (you can view traffic light controls by hovering over the top left of the window). I threw this together initially because I was annoyed that there seemed to be none available, and as my Kitty terminal is also borderless, I wanted something that would fit in with it. The viewer has grown since then into something larger.

The viewer accepts vim controls (`hjkl/HJKL`, `g` and `G`) and the standard zoom in, zoom out keybindings (`Cmd + equals` and `Cmd + minus`). You can also pan with the arrow keys. To move forward or backward an entire page, just use `Enter` or `Shift+Enter` (to go back). A new tab system means you can search for multiple things at once, and switch between them with `Cmd + 1-9`. You can open a new tab with `Cmd + t` (/open a previously closed one with `Cmd+T`) and close the current tab with `Cmd + w`.


The purpose of this project was for me to have a personalized tool to use while writing reports. As such some parts of this project are not fully developed,
or are maybe rough around the edges (eg. not having more of a gui nor having detailed instructions on its use). If you want to contribute, please do so.

The whole idea is to create a lightweight, somewhat all in one tool to use while report writing, with a heavy keyboard only focus.

As an addendum, I was lazy and haven't fully integrated the `bg` option, but altering that is as simple as changing the background colour in the respective HTML file.


## Features 
- Minimalist design throughout
- Globally bound search palette to quickly look up queries right in the viewer or in any other application while the viewer is open (`Cmd + P`)
- Tab system with keybindings to switch, open and close tabs (`Cmd + t`, `Cmd + T`, `Cmd + w`, `Cmd + 1-9`)

## Config 

To use this viewer, clone it wherever, `cd` in, and run `npm install` and then `npm link`. It will create a command called `arview` which you can then run from wherever.

If you want to configure it further, change colors etc. etc. you can either pass a few params in as args (namely `pageGap`, `pageRadius`, `fit`, `bg`, `marginTop`, `marginLeft`, `marginRight`, and `marginBottom`). `fit` takes either `width`, `height` or `auto`. The others take numbers, or a hex string (for `bg`).

Any other customization can be done just by editing the files.
If you want to rebind hjkl to something else, you can do that here in `index.html` (and you can increase the pan speed as well):
```js
if (activePanKeys.has("h")) targetVx -= PAN_SPEED;
        if (activePanKeys.has("l")) targetVx += PAN_SPEED;
        if (activePanKeys.has("k")) targetVy -= PAN_SPEED;
        if (activePanKeys.has("j")) targetVy += PAN_SPEED;

```


## Neovim stuff
When using this with neovim, you can use the following set up. I havent tested this with literally any other setup so whether it works or not is unknown.

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
