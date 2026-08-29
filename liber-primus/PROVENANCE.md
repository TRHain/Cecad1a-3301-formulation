# Canonical Liber Primus corpus provenance

The byte-for-byte corpus used by the v0.81 experiment is
`liber-primus/runes-text.txt` from `krisyotam/cicada3301`.

- Upstream repository: `https://github.com/krisyotam/cicada3301.git`
- Upstream source commit: `1ccf9583b7064ffd6feb52a49442311048295b41`
- Upstream path: `liber-primus/runes-text.txt`
- SHA-256: `5e0003aa7f7dde3b238d17c5f964790dbf6bf9db5edacc4a5ec0bad81c6f4bce`
- Byte count: `43739`
- Newline count: `689`

The v0.80 freeze called this a 688-line corpus. The file contains 688
non-empty/displayed source lines followed by a final blank line, so no byte
was removed to make the descriptive count agree.

## Frozen LP2 extraction metadata

The experiment uses the pre-existing v0.80 section split:

| Section | Source pages | Rune count |
| --- | ---: | ---: |
| 0.5 | 0–2 | 729 |
| 0.6 | 3–7 | 1,145 |
| 0.7 | 8–14 | 1,729 |
| 0.8 | 15–22 | 1,903 |
| 0.9 | 23–26 | 1,021 |
| 0.10 | 27–32 | 1,433 |
| 0.11 | 33–39 | 1,589 |
| 0.12 | 40–55 | 3,316 |

The extraction retains only linear ciphertext rune glyphs. It excludes the
four non-linear object rows at canonical source lines 453–456 (91 glyphs),
matching the frozen v0.63/v0.67 section-0.11 count. Pages 49–51 contain a
base-60 object; its non-rune cells are never transliterated into runes. Page
50 has no rune glyphs, so the raw text's later page-delimiter indices are one
less than the printed page numbers. These are metadata rules, not choices made
from experimental scores.

Discovery sections are `0.5`, `0.6`, `0.7`, `0.9`, and `0.10`. Held-out
sections are `0.8`, `0.11`, and `0.12`.
