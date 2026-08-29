#!/usr/bin/env python3
"""Build the frozen Page 36 91-rune geometry artifact without scoring it."""

import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "liber-primus" / "runes-text.txt"
IMAGE = ROOT / "liber-primus" / "original-onion7" / "36.jpg"
OUTPUT = ROOT / "liber-primus" / "page36-91-artifact.json"

ALPHABET = "ᚠᚢᚦᚩᚱᚳᚷᚹᚻᚾᛁᛄᛇᛈᛉᛋᛏᛒᛖᛗᛚᛝᛟᛞᚪᚫᚣᛡᛠ"
PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47,
          53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109]
EXPECTED_IMAGE_SHA256 = "3b54a31a9e796e2c01b4e80d46e1092dee2e1142a7c61873e282078e2c776cb9"
EXPECTED_SLICE_SHA256 = "ab1ed9c60b4ee13e85554fb31e69769f7d67270f0af1f1edc05e71ef7c108110"

ROW_Y = [(673, 786), (861, 974), (1050, 1163), (1238, 1351)]
ROW_X = [
    [(601,652),(659,691),(697,705),(713,764),(770,804),(808,857),(863,906),(914,922),(930,972),(978,1030),(1036,1069),(1074,1083),(1090,1124),(1128,1137),(1144,1153),(1160,1193),(1198,1230),(1237,1301),(1304,1312),(1320,1353),(1359,1393),(1397,1449),(1452,1460),(1468,1501),(1505,1591),(1594,1627),(1633,1666),(1673,1706),(1711,1719),(1728,1792)],
    [(601,634),(639,673),(679,722),(728,761),(767,800),(804,812),(821,853),(859,892),(898,906),(914,947),(952,1003),(1008,1094),(1097,1149),(1154,1187),(1194,1202),(1210,1261),(1264,1273),(1281,1321),(1326,1377),(1383,1417),(1422,1466),(1472,1480),(1488,1539),(1542,1585),(1592,1636),(1642,1675),(1680,1729),(1735,1787)],
    [(601,634),(638,690),(693,727),(731,780),(786,795),(802,854),(860,911),(919,962),(968,977),(985,1049),(1052,1085),(1091,1143),(1148,1197),(1202,1242),(1248,1299),(1307,1359),(1362,1395),(1401,1453),(1459,1467),(1475,1539),(1542,1575),(1581,1633),(1639,1672),(1677,1710),(1717,1768)],
    [(601,634),(639,672),(677,728),(737,788),(794,803),(811,875),(878,929),(937,945),(953,987),(992,1043),(1049,1098),(1102,1145),(1151,1203),(1208,1260),(1266,1300),(1305,1313),(1322,1373),(1379,1431),(1436,1470),(1475,1515),(1520,1528),(1535,1543),(1551,1595),(1601,1634),(1639,1691),(1694,1738)],
]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


image_bytes = IMAGE.read_bytes()
if sha256(image_bytes) != EXPECTED_IMAGE_SHA256:
    raise SystemExit("Page 36 image hash mismatch")
with Image.open(IMAGE) as image:
    if image.size != (2400, 3600):
        raise SystemExit(f"Page 36 image dimension mismatch: {image.size}")

corpus_bytes = CORPUS.read_bytes()
lines_with_endings = corpus_bytes.splitlines(keepends=True)
slice_bytes = b"".join(lines_with_endings[452:456])
if sha256(slice_bytes) != EXPECTED_SLICE_SHA256:
    raise SystemExit("Page 36 four-row slice hash mismatch")
rows_text = [line.decode("utf8").rstrip("\n") for line in lines_with_endings[452:456]]

rows = []
rune_ids_by_row = []
all_runes = []
token_id = 0
rune_id = 0
for row_index, (text, (y0, y1), x_intervals) in enumerate(zip(rows_text, ROW_Y, ROW_X), start=1):
    if not text.endswith("/"):
        raise SystemExit(f"source row {row_index} lacks transcription line terminator")
    visible_tokens = list(text[:-1])
    if len(visible_tokens) != len(x_intervals):
        raise SystemExit(f"row {row_index} token/geometry mismatch")
    row_tokens = []
    row_rune_ids = []
    rune_col = 0
    for token_col, (char, (x0, x1)) in enumerate(zip(visible_tokens, x_intervals), start=1):
        token_id += 1
        token = {
            "token_id": token_id,
            "row": row_index,
            "token_col": token_col,
            "source_line": 452 + row_index,
            "bbox_inclusive_px": [x0, y0, x1, y1],
            "centroid_px": [(x0 + x1) / 2, (y0 + y1) / 2],
        }
        if char == "-":
            token.update({"type": "word_mark", "transcription": "-", "image_mark": "centered_dot"})
        elif char in ALPHABET:
            rune_id += 1
            rune_col += 1
            index = ALPHABET.index(char)
            token.update({
                "type": "rune", "rune_id": rune_id, "rune_col": rune_col,
                "rune": char, "rune_index_0": index, "gematria_prime": PRIMES[index]
            })
            row_rune_ids.append(rune_id)
            all_runes.append(token)
        else:
            raise SystemExit(f"unexpected visible token {char!r}")
        row_tokens.append(token)
    rune_ids_by_row.append(row_rune_ids)
    rows.append({
        "row": row_index, "source_line": 452 + row_index, "transcription": text,
        "rune_count": rune_col, "word_mark_count": text.count("-"),
        "row_bbox_inclusive_px": [x_intervals[0][0], y0, x_intervals[-1][1], y1],
        "tokens": row_tokens,
    })

if rune_id != 91 or [r["rune_count"] for r in rows] != [23, 24, 22, 22]:
    raise SystemExit("91-rune row-count invariant failed")

def flatten(row_lists):
    return [item for row in row_lists for item in row]

orders = {
    "rows_top_to_bottom_ltr": flatten(rune_ids_by_row),
    "rows_top_to_bottom_rtl": flatten([list(reversed(row)) for row in rune_ids_by_row]),
    "rows_bottom_to_top_ltr": flatten(list(reversed(rune_ids_by_row))),
    "rows_bottom_to_top_rtl": flatten([list(reversed(row)) for row in reversed(rune_ids_by_row)]),
    "boustrophedon_ltr_first": flatten([row if i % 2 == 0 else list(reversed(row)) for i, row in enumerate(rune_ids_by_row)]),
    "boustrophedon_rtl_first": flatten([list(reversed(row)) if i % 2 == 0 else row for i, row in enumerate(rune_ids_by_row)]),
}

artifact = {
    "artifact": "Page 36 transcription-derived four-row 91-rune subset",
    "status": "not_an_intrinsic_image_object",
    "provenance": {
        "upstream_commit": "1ccf9583b7064ffd6feb52a49442311048295b41",
        "original_lp2_path": "liber-primus/original-onion7/36.jpg",
        "full_book_alias": "liber-primus/pages/53.jpg",
        "image_sha256": EXPECTED_IMAGE_SHA256,
        "image_bytes": len(image_bytes), "image_dimensions_px": [2400, 3600],
        "transcription_path": "liber-primus/runes-text.txt",
        "slice_source_lines_inclusive": [453, 456],
        "slice_sha256": EXPECTED_SLICE_SHA256, "slice_bytes": len(slice_bytes),
    },
    "geometry_method": {
        "origin": "top-left", "bbox_coordinates": "inclusive",
        "primary_coordinates": "logical row and token/rune column",
        "pixel_rule": "connected-component x intervals from RGB channels <100 within frozen row y bands",
        "warning": "pixel boxes are threshold-dependent JPEG measurements; logical row/column coordinates are invariant"
    },
    "intrinsic_boundary_finding": {
        "is_91_intrinsic": False,
        "reason": "The image has five contiguous same-style rows before the red marker: 23+24+22+22+8=99. No visible boundary follows row four.",
        "natural_pre_marker_rune_count": 99,
        "following_row": {"source_line": 457, "transcription": lines_with_endings[456].decode("utf8").rstrip("\n"), "rune_count": 8, "bbox_inclusive_px": [601,1426,1012,1539]},
        "red_marker_bbox_inclusive_px": [974,1452,1012,1512],
        "red_numeral_1_bbox_inclusive_px": [620,1693,644,1784],
        "observation_only": "91 = 7×13; the image supplies neither seven rows nor thirteen columns"
    },
    "surrounding_linear_relationship": {
        "previous": {"source_line": 451, "page": 35, "rune": "ᛇ", "relation": "previous canonical rune across page boundary"},
        "first": {"source_line": 453, "page": 36, "rune": all_runes[0]["rune"]},
        "last": {"source_line": 456, "page": 36, "rune": all_runes[-1]["rune"]},
        "next": {"source_line": 457, "page": 36, "rune": "ᛞ", "relation": "next rune in the fifth contiguous image row"},
        "slash_note": "The trailing slash is a transcription-only line terminator and has no image bounding box."
    },
    "rows": rows,
    "reading_orders": orders,
}

OUTPUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
print(f"wrote {OUTPUT} ({rune_id} runes, {token_id - rune_id} marks)")
