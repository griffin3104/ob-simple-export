# Simple Export

An [Obsidian](https://obsidian.md) plugin that exports notes, or whole folders, as plain Markdown:

- The YAML frontmatter (tags, aliases and every other property) is removed.
- Embedded images and files are copied next to the export, and the links are rewritten so the result works anywhere.
- Obsidian-only syntax is cleaned up, so the files render well in other Markdown tools (for example when converting to PDF).

Desktop only.

## 日本語の説明

ノートやフォルダを、YAMLフロントマター（タグなど）を除いた素のMarkdownとして、好きなフォルダに書き出すプラグインです。埋め込み画像は一緒にコピーされ、リンクは相対パスに書き換わります。

## Usage

First set the output folder in **Settings → Simple Export**.

| Action | How |
| --- | --- |
| Export the current note | Command palette → **Export current note without frontmatter**, or right-click the note in the file explorer |
| Export a folder | Command palette → **Export folder without frontmatter**, or right-click the folder in the file explorer |

Output layout:

```
<output folder>/
├── My note.md                  ← single note export
└── <folder name>/              ← folder export (sub folders are kept)
    ├── Note A.md
    ├── sub/Note B.md
    └── attachments/
        └── image.png
```

Single note exports put the note in the output folder and its images in `<output folder>/attachments/`.

## What gets converted

| In Obsidian | In the export |
| --- | --- |
| YAML frontmatter | removed |
| `![[image.png]]`, `![[image.png\|300]]` | `![](attachments/image.png)` |
| `![alt](../img/a.png)` (relative image link) | `![alt](attachments/a.png)` |
| `![[file.pdf]]` | `[file.pdf](attachments/file.pdf)` |
| `![[Another note]]` (note embed) | the content of that note, inlined (its frontmatter is removed too) |
| `![[Another note#Heading]]`, `![[Another note#^block-id]]` | only that section or block |
| `[[Note]]`, `[[Note\|alias]]` | `Note`, `alias` (can be turned off in settings) |

Embedded notes are expanded recursively (up to 5 levels). A circular embed, or a heading or block that cannot be found, falls back to the note title. Code blocks and inline code are left untouched. Files with the same name from different folders are renamed (`image-1.png`) instead of overwritten. Embedded files that cannot be found are left as they were and listed in the developer console.

## Settings

- **Output folder**: absolute path, `~/` is expanded. It must be outside the vault.
- **Attachments folder name**: default `attachments`.
- **Convert wikilinks to plain text**: default on.

## Notes

- This plugin writes files **outside the vault** using Node's file system API, which is why it is desktop only. It makes no network requests and collects no data.
- Existing files in the output folder with the same name are overwritten.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type check + production build
npm run lint
```

To try it, copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/ob-simple-export/`, then enable **Simple Export** under **Settings → Community plugins**.

## License

0-BSD
