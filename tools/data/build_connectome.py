"""
Builds src/data/connectome.json from the published tables (DESIGN.md section 3.5).

Run once when a source changes; the simulation only ever reads the JSON.

    python3 tools/data/build_connectome.py

Needs Python 3.10+ and openpyxl. Inputs are downloaded at pinned versions into
tools/data/.cache/ and checked against their SHA-256 before use:

- Cook et al. 2019, Nature 571:63, Supplementary Information 5 (adjacency
  matrices, corrected July 2020), as redistributed by OpenWorm's
  ConnectomeToolbox (MIT licence).
- Varshney et al. 2011, PLoS Comput Biol 7:e1001066 (NeuronConnect), same source.
  Used only for the cross-check report.
- Fenyves et al. 2020, PLoS Comput Biol 16:e1007974, S3 Data (neurotransmitter
  and receptor expression used to predict synapse polarity), as shipped in the
  wormneuroatlas package (Randi et al. 2023).
- Soma positions from OpenWorm's CElegansNeuroML (the VirtualWorm 3D model),
  for drawing only.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "tools" / "data" / ".cache"
OUT = ROOT / "src" / "data" / "connectome.json"
REPORT = ROOT / "tools" / "data" / "REPORT.md"

CECT = "ffe570268b7cffb9329cd009a1bb37d60db2d465"
NEUROML = "b36380a36d2a6dda0f03c946c433524b25ea2268"

SOURCES = {
    "cook2019": {
        "url": f"https://raw.githubusercontent.com/openworm/ConnectomeToolbox/{CECT}/cect/data/SI%205%20Connectome%20adjacency%20matrices%2C%20corrected%20July%202020.xlsx",
        "sha256": "1f4fdbf84746b69b49a8da0816f52787860ce349b638dce37924ba80f90c70c9",
        "cite": "Cook et al. 2019, Nature 571:63-71, SI 5 (corrected July 2020)",
    },
    "varshney2011": {
        "url": f"https://raw.githubusercontent.com/openworm/ConnectomeToolbox/{CECT}/cect/data/NeuronConnectFormatted.xlsx",
        "sha256": "33e073727baf85286ce8f278a1a418bff8779ed0dac1a3ea38174ed89ed16af7",
        "cite": "Varshney et al. 2011, PLoS Comput Biol 7:e1001066",
    },
    "fenyves2020": {
        "url": "https://files.pythonhosted.org/packages/py3/w/wormneuroatlas/wormneuroatlas-0.0.7.3-py3-none-any.whl",
        "sha256": "166289031784c9565f6b9205e30dc718bafbc092db3b46f1aef73d93dc4d1325",
        "member": "wormneuroatlas/data/journal.pcbi.1007974.s003.xlsx",
        "cite": "Fenyves et al. 2020, PLoS Comput Biol 16:e1007974, S3 Data",
    },
}


def fetch(key: str) -> bytes:
    src = SOURCES[key]
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / (key + Path(src["url"]).suffix)
    if not path.exists():
        print(f"downloading {key}", file=sys.stderr)
        path.write_bytes(urllib.request.urlopen(src["url"]).read())
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != src["sha256"]:
        raise SystemExit(f"{key}: checksum {digest} does not match the pinned {src['sha256']}")
    if "member" in src:
        data = zipfile.ZipFile(io.BytesIO(data)).read(src["member"])
    return data


# ---------------------------------------------------------------- names


VNC = re.compile(r"^(AS|DA|DB|DD|VA|VB|VC|VD)(\d\d)$")
# Classes whose members are named only by a dorsal/ventral and left/right suffix.
DV_CLASSES = {"CEP", "IL1", "IL2", "OLQ", "RMD", "RME", "SAA", "SAB", "SIA", "SIB", "SMB", "SMD", "URA", "URY"}
# Single neurons whose names happen to end in L or R.
UNPAIRED = {"AQR", "AVL", "PVR", "RIR", "ALA", "AVG", "DVA", "DVB", "DVC", "PDA", "PDB", "PVT", "RID", "RIH", "RIS",
            "AVM", "PVM", "PQR", "I3", "I4", "I5", "I6", "M1", "M4", "M5", "MI"}


def neuron_class(name: str) -> str:
    m = VNC.match(name)
    if m:
        return m.group(1)
    if name in UNPAIRED:
        return name
    base = name[:-1] if name[-1] in "LR" else name
    if base[-1:] in ("D", "V") and base[:-1] in DV_CLASSES:
        return base[:-1]
    return base


BWM = re.compile(r"^([dv])BWM([LR])(\d+)$")


def muscle_name(cook: str) -> str:
    """dBWML1 -> MDL01, the WormAtlas name for body-wall muscle cells."""
    m = BWM.match(cook)
    assert m, cook
    return f"M{m.group(1).upper()}{m.group(2)}{int(m.group(3)):02d}"


# ---------------------------------------------------------------- Cook 2019


def read_matrix(ws) -> tuple[list[str], list[str], dict[tuple[str, str], float]]:
    rows = list(ws.iter_rows(values_only=True))
    cols = rows[2]
    row_names: list[str] = []
    col_names = [c for c in cols[3:] if c]
    m: dict[tuple[str, str], float] = {}
    for r in rows[3:]:
        pre = r[2]
        if not pre:
            continue
        row_names.append(pre)
        for j in range(3, len(cols)):
            post = cols[j]
            v = r[j] if j < len(r) else None
            if post and v not in (None, "", 0):
                m[(pre, post)] = float(v)
    return row_names, col_names, m


def group_of_rows(ws) -> dict[str, str]:
    """The section label in column A applies to the rows that follow it."""
    groups: dict[str, str] = {}
    current = ""
    for r in list(ws.iter_rows(values_only=True))[3:]:
        if r[0]:
            current = str(r[0]).lower()
        if r[2]:
            groups[r[2]] = current
    return groups


# ---------------------------------------------------------------- Fenyves 2020 signs


def fenyves_tables(data: bytes):
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True)
    nt: dict[str, tuple[str, str]] = {}
    for r in list(wb["1. NT expr"].iter_rows(values_only=True))[1:]:
        if r[0]:
            nt[str(r[0])] = (str(r[1] or ""), str(r[2] or ""))
    classes = ["Glu+", "Glu-", "ACh+", "ACh-", "GABA+", "GABA-"]
    gene_class: dict[str, str] = {}
    for r in list(wb["2. Receptor gene table"].iter_rows(values_only=True))[1:]:
        for k, cls in enumerate(classes):
            if r[k]:
                gene_class[str(r[k])] = cls
    receptors: dict[str, set[str]] = {}
    for r in list(wb["3. Receptor Gene expression"].iter_rows(values_only=True))[1:]:
        if r[0]:
            receptors[str(r[0])] = {gene_class[g] for g in r[1:] if g and g in gene_class}
    return nt, receptors


def predict_sign(pre: str, post: str, nt, receptors) -> str:
    """Fenyves 2020's rule (S3 Data, sheet 5): '+', '-', 'complex' or 'none'."""
    pre_nts = [x for x in nt.get(pre, ("", "")) if x]
    rec = receptors.get(post, set())
    match = {f"{t}{s}": any(t in n for n in pre_nts) and f"{t}{s}" in rec for t in ("Glu", "ACh", "GABA") for s in "+-"}
    pos = [match["Glu+"], match["ACh+"], match["GABA+"]]
    neg = [match["Glu-"], match["ACh-"], match["GABA-"]]
    one_nt_both = any(p and n for p, n in zip(pos, neg))
    cross = any(pos[i] and neg[j] for i in range(3) for j in range(3) if i != j)
    if one_nt_both or cross:
        return "complex"
    if any(pos):
        return "+"
    if any(neg):
        return "-"
    return "none"


# ---------------------------------------------------------------- positions


def soma_position(name: str) -> list[float]:
    m = VNC.match(name)
    file = f"{m.group(1)}{int(m.group(2))}" if m else name
    path = CACHE / "neuroml" / f"{file}.cell.nml"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://raw.githubusercontent.com/openworm/CElegansNeuroML/{NEUROML}/CElegans/generatedNeuroML2/{file}.cell.nml"
        path.write_bytes(urllib.request.urlopen(url).read())
    text = path.read_text()
    p = re.search(r'<proximal x="([-\d.]+)" y="([-\d.]+)" z="([-\d.]+)"', text)
    assert p, name
    return [round(float(p.group(i)), 2) for i in (1, 2, 3)]


# ---------------------------------------------------------------- main


def main() -> None:
    cook = openpyxl.load_workbook(io.BytesIO(fetch("cook2019")), read_only=True)
    chem_ws = cook["hermaphrodite chemical"]
    neurons, chem_cols, chem = read_matrix(chem_ws)
    groups = group_of_rows(chem_ws)
    # CAN makes no synapses, so Cook's table lists it only as a column (a target).
    for can in ("CANL", "CANR"):
        neurons.append(can)
        groups[can] = "other"
    muscles_cook = sorted((c for c in chem_cols if BWM.match(c)), key=lambda c: (c[0], c[4], int(BWM.match(c).group(3))))
    _, _, gap_raw = read_matrix(cook["hermaphrodite gap jn symmetric"])

    neuron_set = set(neurons)
    muscle_of = {c: muscle_name(c) for c in muscles_cook}
    cell_name = {**{n: n for n in neurons}, **muscle_of}

    nt, receptors = fenyves_tables(fetch("fenyves2020"))

    cells = []
    for n in neurons:
        d, a = nt.get(n, ("", ""))
        cells.append({
            "name": n, "kind": "neuron", "class": neuron_class(n),
            "group": {"interneurons": "inter"}.get(groups[n], groups[n]).replace(" neurons", "").replace(" ", "-"),
            "nt": [x for x in (d, a) if x], "soma": soma_position(n),
        })
    for c in muscles_cook:
        m = BWM.match(c)
        cells.append({"name": muscle_of[c], "kind": "muscle", "class": f"M{m.group(1).upper()}{m.group(2)}",
                      "group": "body-wall-muscle", "index": int(m.group(3))})
    index = {c["name"]: i for i, c in enumerate(cells)}

    # Chemical synapses: neuron -> neuron and neuron -> body-wall muscle.
    chemical = []
    sign_counts: dict[str, int] = {}
    for (pre, post), w in sorted(chem.items()):
        if pre not in neuron_set or post not in cell_name:
            continue
        if post in muscle_of:
            pre_nts = nt.get(pre, ("", ""))
            # Body-wall muscle has excitatory nicotinic ACh and inhibitory GABA-A (UNC-49)
            # receptors at the neuromuscular junction (Richmond & Jorgensen 1999).
            if "GABA" in pre_nts[0]:
                sign, label = -1, "measured"
            elif "ACh" in pre_nts[0]:
                sign, label = 1, "measured"
            else:
                sign, label = 0, "ambiguous"
        else:
            p = predict_sign(pre, post, nt, receptors)
            sign, label = {"+": (1, "predicted"), "-": (-1, "predicted")}.get(p, (0, "ambiguous"))
            sign_counts[p] = sign_counts.get(p, 0) + 1
        chemical.append([index[pre], index[cell_name[post]], w, sign, label])

    # Gap junctions, once per unordered pair.
    gap = []
    for (a, b), w in sorted(gap_raw.items()):
        if a in cell_name and b in cell_name and index[cell_name[a]] < index[cell_name[b]]:
            gap.append([index[cell_name[a]], index[cell_name[b]], w])

    out = {
        "about": "Hermaphrodite connectome for the simulation. Generated by tools/data/build_connectome.py; do not edit.",
        "sources": {k: {"cite": v["cite"], "url": v["url"], "sha256": v["sha256"]} for k, v in SOURCES.items()}
        | {"positions": {"cite": "OpenWorm CElegansNeuroML (VirtualWorm soma positions, µm), drawing only",
                         "url": f"https://github.com/openworm/CElegansNeuroML/tree/{NEUROML}"}},
        "units": {"chemical": "EM serial sections (Cook 2019 connection size)", "gap": "EM serial sections (Cook 2019)"},
        "columns": {"chemical": ["pre", "post", "size", "sign", "label"], "gap": ["a", "b", "size"]},
        "cells": cells,
        "chemical": chemical,
        "gap": gap,
    }
    out["sectionsPerSynapse"] = write_report(cells, chemical, gap, sign_counts)
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(cells)} cells, {len(chemical)} chemical, {len(gap)} gap junction pairs")


def write_report(cells, chemical, gap, sign_counts) -> None:
    """Cross-checks Cook 2019 against Varshney 2011 for neuron-to-neuron edges."""
    wb = openpyxl.load_workbook(io.BytesIO(fetch("varshney2011")), read_only=True)
    v_chem: dict[tuple[str, str], int] = {}
    v_gap: dict[tuple[str, str], int] = {}
    for r in list(wb.worksheets[0].iter_rows(values_only=True))[1:]:
        a, b, kind, n = r[:4]
        if not a or not b:
            continue
        norm = lambda x: (lambda m: f"{m.group(1)}{int(m.group(2)):02d}" if m else x)(re.match(r"^(AS|DA|DB|DD|VA|VB|VC|VD)(\d+)$", x))
        a, b = norm(str(a).strip()), norm(str(b).strip())
        if kind in ("S", "Sp"):
            v_chem[(a, b)] = v_chem.get((a, b), 0) + int(n)
        elif kind == "EJ":
            v_gap[tuple(sorted((a, b)))] = int(n)

    names = [c["name"] for c in cells]
    neurons = {c["name"] for c in cells if c["kind"] == "neuron"}
    c_chem = {(names[a], names[b]): w for a, b, w, *_ in chemical if names[b] in neurons}
    c_gap = {tuple(sorted((names[a], names[b]))): w for a, b, w in gap if names[a] in neurons and names[b] in neurons}

    def compare(cook, var, title):
        both = set(cook) & set(var)
        only_c = set(cook) - set(var)
        only_v = set(var) - set(cook)
        strong_only_v = sorted((k for k in only_v if var[k] >= 5), key=lambda k: -var[k])
        strong_only_c = sorted((k for k in only_c if cook[k] >= 10), key=lambda k: -cook[k])
        lines = [f"## {title}", "",
                 f"- Cook 2019: {len(cook)} pairs; Varshney 2011: {len(var)} pairs; in both: {len(both)}.",
                 f"- Only in Cook: {len(only_c)} (of which {len(strong_only_c)} with size ≥ 10 sections).",
                 f"- Only in Varshney: {len(only_v)} (of which {len(strong_only_v)} with ≥ 5 synapses).", ""]
        if strong_only_v:
            lines.append("Strong Varshney connections missing from Cook (pair: synapses):")
            lines.append("")
            lines += [f"- {a} → {b}: {var[(a, b)]}" for a, b in strong_only_v[:40]]
            lines.append("")
        return lines

    neuron_chem = [e for e in chemical if names[e[1]] in neurons]
    labels = {}
    for e in neuron_chem:
        labels[e[4]] = labels.get(e[4], 0) + 1
    nmj = [e for e in chemical if names[e[1]] not in neurons]
    lines = ["# Connectome data report", "",
             "Generated by `tools/data/build_connectome.py`. Neuron-to-neuron edges, Cook 2019 vs Varshney 2011.", ""]
    lines += compare(c_chem, v_chem, "Chemical synapses")
    lines += compare(c_gap, v_gap, "Gap junctions")
    lines += ["## Synapse signs (DESIGN.md section 3.2)", "",
              f"- Neuron-to-neuron chemical edges: {len(neuron_chem)}.",
              f"- Fenyves 2020 rule on these edges: {sign_counts.get('+', 0)} excitatory, {sign_counts.get('-', 0)} inhibitory, "
              f"{sign_counts.get('complex', 0)} complex (both signs possible), {sign_counts.get('none', 0)} no prediction.",
              f"- Labels: " + ", ".join(f"{k} {v}" for k, v in sorted(labels.items())) + ".",
              f"- Neuron-to-muscle edges: {len(nmj)} (ACh excitatory and GABA inhibitory, Richmond & Jorgensen 1999; others ambiguous: "
              f"{sum(1 for e in nmj if e[4] == 'ambiguous')}).", ""]
    # How many EM sections one Varshney synapse corresponds to, over the pairs both list:
    # converts Cook's sizes into synapse-count units for the per-synapse conductance.
    per = {
        "chemical": round(sum(c_chem[k] for k in c_chem if k in v_chem) / sum(v_chem[k] for k in c_chem if k in v_chem), 4),
        "gap": round(sum(c_gap[k] for k in c_gap if k in v_gap) / sum(v_gap[k] for k in c_gap if k in v_gap), 4),
    }
    lines += ["## Units", "",
              f"- Over pairs in both datasets, one Varshney synapse ≈ {per['chemical']} Cook sections (chemical), "
              f"{per['gap']} (gap junctions). The simulation divides Cook sizes by these to get synapse-count units.", ""]
    REPORT.write_text("\n".join(lines))
    return per


if __name__ == "__main__":
    main()
