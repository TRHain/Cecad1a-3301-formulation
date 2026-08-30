#!/usr/bin/env python3
"""Build the image-authoritative v0.83 red-event provenance artifact.

This script extracts a binary red channel only. It does not score ciphertext,
read JPEG intensity as a number, or use solved plaintext.
"""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
IMAGE_ROOT = ROOT / "liber-primus" / "original-onion7"
CORPUS = ROOT / "liber-primus" / "runes-text.txt"
DEFAULT_OUTPUT = ROOT / "liber-primus" / "v0.83-red-events.json"
CORPUS_SHA256 = "5e0003aa7f7dde3b238d17c5f964790dbf6bf9db5edacc4a5ec0bad81c6f4bce"
IMAGE_ARCHIVE_SHA256 = "7da5bf70bf5770211a2858f2a00e8c109acd768b367c122a15e7f3f5aa335e13"
UPSTREAM_COMMIT = "1ccf9583b7064ffd6feb52a49442311048295b41"
ALPHABET = "ᚠᚢᚦᚩᚱᚳᚷᚹᚻᚾᛁᛄᛇᛈᛉᛋᛏᛒᛖᛗᛚᛝᛟᛞᚪᚫᚣᛡᛠ"
RUNE_SET = set(ALPHABET)
EXCLUDED_LINES = {453, 454, 455, 456}
SECTION_PAGES = {
    "0.5": (0, 2), "0.6": (3, 7), "0.7": (8, 14), "0.8": (15, 22),
    "0.9": (23, 26), "0.10": (27, 32), "0.11": (33, 39), "0.12": (40, 55),
}
RED_PAGES = {0, 2, 3, 6, 7, 8, 14, 15, 22, 23, 26, 27, 32, 33, 36,
             37, 38, 39, 40, 49, 53, 54, 55, 56, 57}

# Inclusive bboxes from the frozen binary red mask. Each detected band is
# assigned exactly once below, so unexplained red ink fails closed.
EXPECTED_BANDS = {
    0: [(601,667,1443,1164)],
    2: [(1626,2194,1664,2278)],
    3: [(601,670,1598,1164),(1356,1629,1394,1713),(601,2099,972,2591)],
    6: [(742,1252,781,1337),(601,1722,1370,2217)],
    7: [(723,2458,1672,2572)],
    8: [(602,667,1453,1164)],
    14: [(997,1817,1036,1901)],
    15: [(917,673,1478,786),(912,1016,1148,1094),(601,1732,1319,2227)],
    22: [(1631,1700,1668,1785)],
    23: [(601,1157,1571,1652)],
    26: [(1635,2759,1673,2843)],
    27: [(601,913,1721,1408)],
    32: [(930,1629,967,1713)],
    33: [(601,667,1306,1164),(1447,1440,1485,1525),(602,1909,1179,2405)],
    36: [(974,1452,1012,1512),(620,1693,644,1784)],
    37: [(605,694,664,787),(607,1538,662,1633),(601,2571,669,2664)],
    38: [(602,1316,664,1409),(601,2541,638,2600)],
    39: [(837,1629,876,1713),(601,1852,983,2349),(1540,2814,1578,2898)],
    40: [(601,667,1141,1164)],
    49: [(1691,1076,1729,1136)],
    53: [(1720,1651,1768,1763),(601,1874,1723,1987),
         (600,2062,1797,2176),(601,2250,861,2364)],
    54: [(601,914,1232,1408)],
    55: [(1034,1252,1073,1337)],
    56: [(601,670,1092,1165),(1558,2092,1596,2176)],
    57: [(601,915,1178,1518),(1643,1740,1712,1824)],
}


def rune_event(event_id, page, start, end, bboxes, kind="heading", relationship=""):
    return {"id": event_id, "page": page, "kind": kind, "raw_start": start,
            "raw_end": end, "bboxes": bboxes, "relationship": relationship}


def nonrune_event(event_id, page, position, bboxes, kind, relationship, coordinate_subregions=None):
    return {"id": event_id, "page": page, "kind": kind, "raw_position": position,
            "bboxes": bboxes, "relationship": relationship,
            "coordinate_subregions": coordinate_subregions or []}


EVENTS = [
    rune_event("p00-heading",0,0,13,[EXPECTED_BANDS[0][0]],relationship="page and section start; ends at sentence punctuation"),
    nonrune_event("p02-punctuation",2,201,[EXPECTED_BANDS[2][0]],"punctuation","after sentence-final punctuation at page and section end"),
    rune_event("p03-heading-1",3,0,16,[EXPECTED_BANDS[3][0]],relationship="page and section start; ends at sentence punctuation"),
    nonrune_event("p03-punctuation",3,119,[EXPECTED_BANDS[3][1]],"punctuation","paragraph separator immediately before the second heading"),
    rune_event("p03-heading-2",3,119,122,[EXPECTED_BANDS[3][2]],relationship="paragraph start after red punctuation; ends at sentence punctuation"),
    nonrune_event("p06-punctuation",6,71,[EXPECTED_BANDS[6][0]],"punctuation","paragraph separator immediately before the heading"),
    rune_event("p06-heading",6,71,82,[EXPECTED_BANDS[6][1]],relationship="paragraph start after red punctuation; ends at sentence punctuation"),
    rune_event("p07-short-run",7,194,208,[EXPECTED_BANDS[7][0]],kind="short_run",relationship="standalone sentence; ends at page and section punctuation"),
    rune_event("p08-heading",8,0,12,[EXPECTED_BANDS[8][0]],relationship="page and section start; ends at sentence punctuation"),
    nonrune_event("p14-punctuation",14,137,[EXPECTED_BANDS[14][0]],"punctuation","after sentence-final punctuation at page and section end"),
    rune_event("p15-heading-1",15,0,9,[EXPECTED_BANDS[15][0]],relationship="page and section start; complete sentence"),
    nonrune_event("p15-number-3299",15,9,[EXPECTED_BANDS[15][1]],"numeric_object","red 3299 in a 4x4 decimal number array between text blocks"),
    rune_event("p15-heading-2",15,9,20,[EXPECTED_BANDS[15][2]],relationship="paragraph start below numeric object; ends at sentence punctuation"),
    nonrune_event("p22-punctuation",22,131,[EXPECTED_BANDS[22][0]],"punctuation","after sentence-final punctuation at page and section end"),
    rune_event("p23-heading",23,0,16,[EXPECTED_BANDS[23][0]],relationship="page and section start; ends at sentence punctuation"),
    nonrune_event("p26-punctuation",26,265,[EXPECTED_BANDS[26][0]],"punctuation","after sentence-final punctuation at page and section end"),
    rune_event("p27-heading",27,0,19,[EXPECTED_BANDS[27][0]],relationship="page and section start; ends at sentence punctuation"),
    nonrune_event("p32-punctuation",32,121,[EXPECTED_BANDS[32][0]],"punctuation","after sentence-final punctuation at page and section end"),
    rune_event("p33-heading-1",33,0,10,[EXPECTED_BANDS[33][0]],relationship="page and section start; ends at sentence punctuation"),
    nonrune_event("p33-punctuation",33,91,[EXPECTED_BANDS[33][1]],"punctuation","paragraph separator immediately before the second heading"),
    rune_event("p33-heading-2",33,91,99,[EXPECTED_BANDS[33][2]],relationship="paragraph start after red punctuation; ends at sentence punctuation"),
    nonrune_event("p36-punctuation",36,99,[EXPECTED_BANDS[36][0]],"punctuation","after the fifth contiguous 99-glyph block row and before numbered paragraph 1"),
    nonrune_event("p36-numeral-1",36,99,[EXPECTED_BANDS[36][1]],"paragraph_numeral","paragraph label before the following black runes"),
    nonrune_event("p37-numeral-2",37,0,[EXPECTED_BANDS[37][0]],"paragraph_numeral","page-start paragraph label"),
    nonrune_event("p37-numeral-3",37,91,[EXPECTED_BANDS[37][1]],"paragraph_numeral","paragraph label at a sentence boundary"),
    nonrune_event("p37-numeral-4",37,189,[EXPECTED_BANDS[37][2]],"paragraph_numeral","paragraph label at a sentence boundary"),
    nonrune_event("p38-numeral-5",38,57,[EXPECTED_BANDS[38][0]],"paragraph_numeral","paragraph label at a sentence boundary"),
    nonrune_event("p38-punctuation",38,186,[EXPECTED_BANDS[38][1]],"punctuation","paragraph separator between black rune blocks"),
    nonrune_event("p39-punctuation-1",39,119,[EXPECTED_BANDS[39][0]],"punctuation","paragraph separator immediately before the red heading that generated v0.72"),
    rune_event("p39-heading",39,119,122,[EXPECTED_BANDS[39][1]],relationship="paragraph start after red punctuation; v0.72 discovery event; ends at sentence punctuation"),
    nonrune_event("p39-punctuation-2",39,240,[EXPECTED_BANDS[39][2]],"punctuation","after sentence-final punctuation at page and section end"),
    rune_event("p40-heading",40,0,8,[EXPECTED_BANDS[40][0]],relationship="page and section start; ends at sentence punctuation"),
    nonrune_event("p49-base60-red",49,66,[EXPECTED_BANDS[49][0]],"numeric_object","red cells in the non-rune base-60 object below the page rune text"),
    rune_event("p53-long-passage",53,128,179,EXPECTED_BANDS[53],kind="long_passage",relationship="starts after sentence punctuation with a red isolated first rune; continues for 51 runes to page-end punctuation"),
    nonrune_event("p53-punctuation",53,179,[],"punctuation","page-end punctuation contiguous with the red long passage; its pixels are a subregion of the passage's final band",coordinate_subregions=[(822,2265,861,2349)]),
    rune_event("p54-heading",54,0,9,[EXPECTED_BANDS[54][0]],relationship="page start; separately bounded from page 53; ends at sentence punctuation"),
    nonrune_event("p55-punctuation",55,76,[EXPECTED_BANDS[55][0]],"punctuation","after sentence-final punctuation at page and section end"),
    rune_event("p56-heading",56,0,5,[EXPECTED_BANDS[56][0]],relationship="solved/control page heading at page start; ends at sentence punctuation"),
    nonrune_event("p56-punctuation",56,85,[EXPECTED_BANDS[56][1]],"punctuation","solved/control page-end punctuation"),
    rune_event("p57-heading",57,0,8,[EXPECTED_BANDS[57][0]],relationship="solved/control page heading at page start; ends at sentence punctuation"),
    nonrune_event("p57-punctuation",57,95,[EXPECTED_BANDS[57][1]],"punctuation","solved/control page-end punctuation"),
]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def section_for_page(page):
    for section, (lo, hi) in SECTION_PAGES.items():
        if lo <= page <= hi:
            return section
    return None


def red_mask(rgb, threshold):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    if threshold == "broad":
        return (r > 100) & (r.astype(int)-g > 25) & (r.astype(int)-b > 25)
    if threshold == "frozen":
        return (r > 120) & (r.astype(int)-g > 45) & (r.astype(int)-b > 45)
    return (r > 140) & (g < 130) & (b < 130)


def bands(mask):
    active = np.where(mask.sum(axis=1) > 2)[0]
    if not len(active):
        return []
    spans = []
    start = last = int(active[0])
    for value in active[1:]:
        y = int(value)
        if y > last + 8:
            spans.append((start, last))
            start = y
        last = y
    spans.append((start, last))
    result = []
    for y0, y1 in spans:
        local = mask[y0:y1+1]
        _, xs = np.where(local)
        result.append((int(xs.min()), y0, int(xs.max()), y1))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    corpus_bytes = CORPUS.read_bytes()
    if sha256(corpus_bytes) != CORPUS_SHA256:
        raise SystemExit("canonical corpus drift")

    archive = hashlib.sha256()
    image_hashes = {}
    detected_by_threshold = {name: set() for name in ("broad", "frozen", "strict")}
    detected_bands = {}
    for page in range(58):
        path = IMAGE_ROOT / f"{page}.jpg"
        data = path.read_bytes()
        archive.update(f"{page}.jpg\0".encode())
        archive.update(data)
        image_hashes[str(page)] = sha256(data)
        with Image.open(path) as image:
            if image.size != (2400, 3600):
                raise SystemExit(f"image dimension drift on page {page}")
            rgb = np.asarray(image.convert("RGB"))
        for name in detected_by_threshold:
            mask = red_mask(rgb, name)
            if int(mask.sum()) > 25:
                detected_by_threshold[name].add(page)
            if name == "frozen" and page in RED_PAGES:
                detected_bands[page] = bands(mask)
    if archive.hexdigest() != IMAGE_ARCHIVE_SHA256:
        raise SystemExit("original image archive drift")
    if sha256((IMAGE_ROOT / "index.html").read_bytes()) != "9d515f2c170c44ab0f5acbdc7ba2de2be62cc07b132ab7f9609532b3b5622e80":
        raise SystemExit("original onion index drift")
    if sha256((IMAGE_ROOT / "message.txt.asc").read_bytes()) != "d5473236dee152c7744f561e5ace95908876ec01d43467c28af1b0c1aa14cc54":
        raise SystemExit("original signed message drift")
    for name, found in detected_by_threshold.items():
        if found != RED_PAGES:
            raise SystemExit(f"red-page disagreement at {name} threshold: {sorted(found)}")
    if detected_bands != EXPECTED_BANDS:
        raise SystemExit("red-band geometry disagreement")

    lines = corpus_bytes.decode("utf8").splitlines()
    page_records = {page: [] for page in range(58)}
    raw_page = 0
    raw_global = 0
    for source_line, line in enumerate(lines, 1):
        if line == "%":
            raw_page += 1
            continue
        page = raw_page if raw_page <= 49 else raw_page + 1
        if page > 57:
            continue
        for source_col, char in enumerate(line, 1):
            if char not in RUNE_SET:
                continue
            page_records[page].append({
                "rune": char, "value": ALPHABET.index(char), "source_line": source_line,
                "source_col": source_col, "raw_global_position_0": raw_global,
                "admitted_linear_stream": source_line not in EXCLUDED_LINES,
            })
            raw_global += 1

    section_offsets = {}
    analysis_global_offsets = {}
    running = 0
    for page in range(58):
        analysis_global_offsets[page] = running
        running += sum(r["admitted_linear_stream"] for r in page_records[page])
    for section, (lo, hi) in SECTION_PAGES.items():
        offset = 0
        for page in range(lo, hi + 1):
            section_offsets[(section, page)] = offset
            offset += sum(r["admitted_linear_stream"] for r in page_records[page])

    used_bands = []
    output_events = []
    for event in EVENTS:
        page = event["page"]
        used_bands.extend((page, tuple(box)) for box in event["bboxes"])
        section = section_for_page(page)
        records = page_records[page]
        out = {
            "id": event["id"], "page": page, "section": section,
            "solved_control": page in (56, 57), "kind": event["kind"],
            "image_bboxes_inclusive_px": event["bboxes"],
            "image_coordinate_subregions_inclusive_px": event.get("coordinate_subregions", []),
            "punctuation_word_boundary_relationship": event["relationship"],
        }
        if "raw_start" in event:
            start, end = event["raw_start"], event["raw_end"]
            if not (0 <= start < end <= len(records)):
                raise SystemExit(f"rune range drift for {event['id']}")
            selected = records[start:end]
            if not all(r["admitted_linear_stream"] for r in selected):
                raise SystemExit(f"red rune run intersects excluded linear stream: {event['id']}")
            before_start = sum(r["admitted_linear_stream"] for r in records[:start])
            before_end = sum(r["admitted_linear_stream"] for r in records[:end])
            out.update({
                "rune_stream_role": "rune_run", "page_raw_rune_range_0_half_open": [start, end],
                "run_length": end-start, "runes": "".join(r["rune"] for r in selected),
                "rune_values": [r["value"] for r in selected],
                "source_lines_inclusive": [selected[0]["source_line"], selected[-1]["source_line"]],
                "raw_global_rune_range_0_half_open": [selected[0]["raw_global_position_0"], selected[-1]["raw_global_position_0"]+1],
                "analysis_global_rune_range_0_half_open": [analysis_global_offsets[page]+before_start, analysis_global_offsets[page]+before_end],
            })
            if section:
                offset = section_offsets[(section, page)]
                out["section_rune_range_0_half_open"] = [offset+before_start, offset+before_end]
                out["boundary_positions_section_0"] = [offset+before_start, offset+before_end]
        else:
            position = event["raw_position"]
            if not (0 <= position <= len(records)):
                raise SystemExit(f"non-rune position drift for {event['id']}")
            admitted_before = sum(r["admitted_linear_stream"] for r in records[:position])
            out.update({
                "rune_stream_role": "non_rune_event", "page_raw_rune_position_0": position,
                "run_length": 0, "analysis_global_rune_position_0": analysis_global_offsets[page]+admitted_before,
            })
            if section:
                section_position = section_offsets[(section, page)] + admitted_before
                out["section_rune_position_0"] = section_position
                out["boundary_positions_section_0"] = [section_position]
        output_events.append(out)

    expected_used = sorted((page, tuple(box)) for page, values in EXPECTED_BANDS.items() for box in values)
    if sorted(used_bands) != expected_used:
        raise SystemExit("not every detected red band is assigned exactly once")

    artifact = {
        "artifact": "v0.83 image-authoritative Liber Primus red-event provenance",
        "source": {
            "upstream_repository": "https://github.com/krisyotam/cicada3301.git",
            "upstream_commit": UPSTREAM_COMMIT,
            "image_path": "liber-primus/original-onion7/{0..57}.jpg",
            "image_count": 58, "image_dimensions_px": [2400, 3600],
            "image_archive_sha256": IMAGE_ARCHIVE_SHA256,
            "image_sha256": image_hashes,
            "onion_index_sha256": "9d515f2c170c44ab0f5acbdc7ba2de2be62cc07b132ab7f9609532b3b5622e80",
            "signed_message_sha256": "d5473236dee152c7744f561e5ace95908876ec01d43467c28af1b0c1aa14cc54",
            "corpus_path": "liber-primus/runes-text.txt", "corpus_sha256": CORPUS_SHA256,
        },
        "binary_red_extraction": {
            "frozen_mask": "R>120 and R-G>45 and R-B>45",
            "robustness_masks": ["R>100 and R-G>25 and R-B>25", "R>140 and G<130 and B<130"],
            "threshold_agreement": "all three masks identify exactly the same 25 red-bearing pages",
            "red_pages": sorted(RED_PAGES),
            "policy": "binary glyph-level channel only; JPEG red intensity is not interpreted numerically",
        },
        "page_index_rule": "Images are printed pages 0..57. Transcription page 50 is absent; after raw delimiter 49, printed page = raw page + 1.",
        "page36_geometry_guard": "The original five-row object has 99 runes. The frozen 91-rune transcription exclusion is not intrinsic geometry.",
        "event_count": len(output_events), "events": output_events,
    }
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2)+"\n", encoding="utf8")
    print(json.dumps({"output": str(args.output), "events": len(output_events),
                      "red_pages": len(RED_PAGES), "archive_sha256": IMAGE_ARCHIVE_SHA256}, indent=2))


if __name__ == "__main__":
    main()
