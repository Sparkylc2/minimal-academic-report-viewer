## About
This viewer is about as minimal as it gets. It has no title-bar, traffic light controls, menu-bar or toolbars. It is just a window for previewing PDFs (you can view traffic light controls by hovering over the top left of the window). I threw this together because I was annoyed that there seemed to be none available, and as my Kitty terminal is also borderless, I wanted something that would fit in with it. The viewer accepts vim controls (HJKL) and the standard zoom in, zoom out keybindings.

70% of this has been vibe coded so I make no performance promises ;)


## Config 

To use this pdf viewer, clone it wherever, cd in, and run `npm install` and then `npm link`. It will create a command called `pdfview` which you can then run from wherever.

If you want to configure it further, change colors etc. etc. you can either pass a few params in as args (namely `--pageGap`, `--pageRadius`, `--fit` and `--bg`). `--fit` takes either `width`, `height` or `auto`. The others take numbers (for `pageGap` and `pageRadius`) or a hex string (for `bg`).

Any other customization can be done just by editing the files.

## Neovim stuff
When using this with neovim, you can use the following set up. I havent tested this with literally any other setup so whether it works or not is unknown.

```lua
{
    "lervag/vimtex",
    ft = "tex",
    event = "VeryLazy",
    init = function()
        vim.g.vimtex_view_method = "general"
        vim.g.vimtex_view_general_viewer = "pdfview"

        vim.g.vimtex_view_general_options = "@pdf"
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
