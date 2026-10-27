# Third-party licenses

InventExplorer bundles icon artwork and emoji keyword data from the projects
below. Each is redistributed under its own licence, reproduced in full here
as those licences require. The icons remain the property of their authors —
the InventExplorer licence (`LICENSE`) covers the plugin, not the artwork.

**Lucide** is *not* bundled. Those icons come from Obsidian's own API
(`getIconIds()` / `setIcon()`), so nothing of Lucide is redistributed here.

**Remix Icon was removed** in favour of Boxicons. Remix Design relicensed
the library in January 2026 under the custom *Remix Icon License v1.0*,
whose §3.1 forbids distributing the icons where they are "the primary
advertised feature" — which describes this plugin. Every set bundled today
is MIT, with no restriction on the product's business model. Keep it that
way: check the upstream LICENSE file, not just package metadata, before
adding or upgrading a set.

| Set | Bundled version | Licence |
| --- | --- | --- |
| [Tabler Icons](https://tabler.io/icons) | 3.41.0 (via `@iconify-json/tabler@1.2.33`) | MIT |
| [Boxicons](https://boxicons.com) | 1.0.5 (via `@iconify-json/boxicons@1.2.0`) | MIT |
| [Phosphor Icons](https://phosphoricons.com) | 2.1.1 (via `@iconify-json/ph@1.2.2`) | MIT |
| [emojilib](https://github.com/muan/emojilib) | 4.0.3 | MIT |

## Modifications

The icon artwork is not used byte-for-byte. `scripts/build-icon-sets.mjs`
converts each icon from Iconify's optimised path-body format into a
standalone SVG document (adding `xmlns`, `viewBox` and the set's stroke or
fill attributes), and resolves aliases to their parent icon. No path data is
altered. Noted here because every bundled set is redistributed in a
transformed form, and MIT requires the notices to travel with the copies.

---

## Tabler Icons

- Version bundled: **3.41.0** (6092 icons upstream)
- Author: Paweł Kuna
- Home: https://tabler.io/icons
- Source: https://github.com/tabler/tabler-icons
- Licence: **MIT**
- Packaged via: `@iconify-json/tabler@1.2.33`

```
MIT License

Copyright (c) 2020-2024 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Boxicons

- Version bundled: **1.0.5** (3768 icons upstream)
- Author: Boxicons
- Home: https://boxicons.com
- Source: https://github.com/box-icons/boxicons-core
- Licence: **MIT**
- Packaged via: `@iconify-json/boxicons@1.2.0`

```
MIT License

Copyright (c) 2026 Boxicons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Phosphor Icons

- Version bundled: **2.1.1** (9072 icons upstream)
- Author: Phosphor Icons
- Home: https://phosphoricons.com
- Source: https://github.com/phosphor-icons/core
- Licence: **MIT**
- Packaged via: `@iconify-json/ph@1.2.2`

```
MIT License

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## emojilib

Emoji names and search keywords (`emoji-names.json`).

- Version bundled: **4.0.3**
- Source: https://github.com/muan/emojilib
- Licence: **MIT**

```
MIT License

Copyright (c) Muan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

Generated by `scripts/build-third-party-licenses.mjs`. Re-run it after any
icon-set dependency change; `npm run build:bin` verifies it is up to date.
