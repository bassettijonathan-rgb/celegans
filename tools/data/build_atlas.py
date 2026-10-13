"""
Builds src/data/atlas.json from Randi et al. 2023's signal propagation atlas
(DESIGN.md sections 7.2 and 9: the fitting half and the held-out half, V4b).

    python3 tools/data/build_atlas.py

Needs Python 3.10+ and h5py. The atlas ships as funatlas.h5 in the authors'
wormneuroatlas package, the same pinned wheel build_connectome.py reads for
Fenyves 2020 (downloaded into tools/data/.cache/, checked by SHA-256).

Randi, Sharma, Dvali & Leifer 2023 (Nature 623:406) lit one neuron at a time
and recorded the calcium response (ΔF/F) of the others. For each strain the
file holds, per pair (responder i, stimulated j): the mean ΔF/F, the q value
of the response (false discovery rate) and how many times the pair was
measured. Strains: wild type ("wt"), and unc-31 mutants ("unc31"), which
cannot release neuropeptides, so their responses run through the wiring a
connectome model has.

Each ordered pair (stimulated, responder) goes into the fitting half or the
held-out half by a seeded hash of its names, the same for both strains, so a
held-out pair is held out everywhere. Pairs whose neurons the connectome
names differently are renamed (AS1 -> AS01); AWCON/AWCOFF (the two AWC
cells by function, not side) are dropped.
"""

from __future__ import annotations

import hashlib
import io
import json
import math
import re
import sys
import zipfile
from pathlib import Path

import h5py

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_connectome import ROOT, fetch  # noqa: E402

OUT = ROOT / "src" / "data" / "atlas.json"
MEMBER = "wormneuroatlas/data/funatlas.h5"
# Seed for the fit / held-out split (DESIGN.md 7.2: "chosen at random by seed").
SPLIT_SEED = 2023


def rename(n: str) -> str | None:
    if n in ("AWCON", "AWCOF"):
        return None
    m = re.match(r"^(AS|DA|DB|DD|VA|VB|VC|VD)(\d)$", n)
    return f"{m.group(1)}{int(m.group(2)):02d}" if m else n


def held_out(stim: str, resp: str) -> bool:
    return hashlib.sha256(f"{SPLIT_SEED}:{stim}>{resp}".encode()).digest()[0] % 2 == 1


def main() -> None:
    wheel = fetch_wheel()
    f = h5py.File(io.BytesIO(zipfile.ZipFile(io.BytesIO(wheel)).read(MEMBER)), "r")
    ids = [rename(n.decode()) for n in f["neuron_ids"][:]]
    names = {c["name"] for c in json.loads((ROOT / "src" / "data" / "connectome.json").read_text())["cells"]}
    unknown = sorted(n for n in ids if n is not None and n not in names)
    if unknown:
        raise SystemExit(f"atlas neurons missing from the connectome: {unknown}")
    out = {
        "source": "Randi, Sharma, Dvali & Leifer 2023, Nature 623:406, funatlas.h5 in wormneuroatlas 0.0.7.3",
        "compiled": f.attrs["time_compiled"].decode(),
        "splitSeed": SPLIT_SEED,
        "columns": ["stim", "resp", "dFF", "q", "n", "heldOut"],
        "strains": {},
    }
    for strain in ("wt", "unc31"):
        g = f[strain]
        occ, dff, q = g["occ1"][:], g["dFF"][:], g["q"][:]
        rows = []
        for j, stim in enumerate(ids):
            for i, resp in enumerate(ids):
                if stim is None or resp is None or i == j or occ[i, j] == 0:
                    continue
                d, qq = float(dff[i, j]), float(q[i, j])
                rows.append([
                    stim,
                    resp,
                    None if math.isnan(d) else round(d, 4),
                    None if math.isnan(qq) else round(qq, 4),
                    int(occ[i, j]),
                    1 if held_out(stim, resp) else 0,
                ])
        out["strains"][strain] = rows
        print(f"{strain}: {len(rows)} pairs, {sum(r[5] for r in rows)} held out", file=sys.stderr)
    OUT.write_text(json.dumps(out, separators=(",", ":")) + "\n")


def fetch_wheel() -> bytes:
    """The pinned wormneuroatlas wheel itself (fetch() returns its Fenyves member)."""
    from build_connectome import CACHE, SOURCES

    fetch("fenyves2020")  # downloads and checks the wheel
    return (CACHE / ("fenyves2020" + Path(SOURCES["fenyves2020"]["url"]).suffix)).read_bytes()


if __name__ == "__main__":
    main()
