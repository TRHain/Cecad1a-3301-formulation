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

The extraction retains only the runes admitted by the frozen linear-stream
rule. It excludes canonical source lines 453–456 (91 glyphs), matching the
frozen v0.63/v0.67 section-0.11 count. Pages 49–51 contain a
base-60 object; its non-rune cells are never transliterated into runes. Page
50 has no rune glyphs, so the raw text's later page-delimiter indices are one
less than the printed page numbers. These are metadata rules, not choices made
from experimental scores.

### v0.82 Page 36 geometry audit

The earlier description of lines 453–456 as four "non-linear object rows" was
a transcription-derived label, not an image-intrinsic boundary. Inspection of
the authoritative original image shows five contiguous ordinary horizontal
rune rows below two sigil rows. Their counts are 23, 24, 22, 22, and 8, for 99
runes total; the red dotted mark follows the fifth row. Thus the frozen
91-rune exclusion is the first four transcription rows, while canonical line
457 is the visually contiguous fifth row. The v0.81 extraction and all frozen
section counts remain unchanged.

- Original image: `liber-primus/original-onion7/36.jpg`
- Image SHA-256: `3b54a31a9e796e2c01b4e80d46e1092dee2e1142a7c61873e282078e2c776cb9`
- 91-rune artifact: `liber-primus/page36-91-artifact.json`
- Artifact SHA-256: `3e49e670ddb2c3ef34fef2c4e276620b23bad05636545bd20654f7c13dcb32ec`

The artifact preserves exact rows, rune values, visible marks, image
coordinates, six predeclared reading orders, and surrounding-text relations.
It does not classify the 91 runes as ciphertext. The identity `91 = 7×13` is
recorded only as arithmetic observation; the image supplies no 7×13 geometry.

Discovery sections are `0.5`, `0.6`, `0.7`, `0.9`, and `0.10`. Held-out
sections are `0.8`, `0.11`, and `0.12`.

## v0.83 original-image red channel

The complete 58-image `original-onion7` archive was ingested byte-for-byte
from upstream commit `1ccf9583b7064ffd6feb52a49442311048295b41` before the
v0.83 red-transition replication was scored.

- Ordered image-archive SHA-256: `7da5bf70bf5770211a2858f2a00e8c109acd768b367c122a15e7f3f5aa335e13`
- Original onion `index.html` SHA-256: `9d515f2c170c44ab0f5acbdc7ba2de2be62cc07b132ab7f9609532b3b5622e80`
- Signed message SHA-256: `d5473236dee152c7744f561e5ace95908876ec01d43467c28af1b0c1aa14cc54`
- Red-event artifact: `liber-primus/v0.83-red-events.json`
- Red-event artifact SHA-256: `1177e9e9e8aadfbcb29abc7f71138de90fc75c4cb66f309090cae979befc7c36`

The artifact preserves all 41 image-authoritative events, including page,
section, raw and frozen-analysis rune positions, run length, rune values,
event class, boundary relationship, and recoverable pixel coordinates. A
frozen binary red mask and two independent robustness masks identify the same
25 red-bearing pages. Red intensity is not interpreted numerically. Pages 53
and 54 remain separate events at their shared page boundary.
