#!/usr/bin/env python3
"""
recompute_from_raw.py - Rebuild data/YYYY-MM.json from the lossless raw archive
(data/YYYY-MM.raw.json) WITHOUT downloading or uploading any Excel file.

Use it after you change a rule / rate / area / holiday:
    python scripts/recompute_from_raw.py 2026-10          # one month
    python scripts/recompute_from_raw.py 2026-10 2026-11  # several
    python scripts/recompute_from_raw.py --all            # every archived month

It runs the exact same parser as to_json.py (it rebuilds the workbook in memory and calls build_month),
so there is only ONE copy of the logic. Run from the repository root.
"""
import sys
import json
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import to_json  # noqa: E402


def main(argv):
    archive_dir = to_json.ARCHIVE_DIR
    if not archive_dir.exists():
        print(f"[ERROR] {archive_dir} not found. Run this from the repository root.")
        return 1
    available = sorted(p.name[:-len(".raw.json")] for p in archive_dir.glob("*.raw.json"))
    if not available:
        print("[ERROR] No raw archives yet. Upload each month's Excel once; after that no re-upload is ever needed.")
        return 1
    months = available if (not argv or "--all" in argv) else argv
    all_data_months = sorted(p.stem for p in to_json.DATA_DIR.glob("20??-??.json"))
    newest = all_data_months[-1] if all_data_months else None
    rc = 0
    for m in months:
        path = archive_dir / f"{m}.raw.json"
        if not path.exists():
            print(f"[SKIP] No archive for {m}. Available: {', '.join(available)}")
            rc = 1
            continue
        with open(path, "r", encoding="utf-8") as f:
            arc = json.load(f)
        named = [(fl["name"], to_json.rebuild_workbook(fl)) for fl in arc.get("files", [])]
        print(f"\n=== Recomputing {m} from {len(named)} archived file(s) ===")
        try:
            to_json.build_month(named, archive=False, update_latest=(m == newest or newest is None), force_month=m)
        except SystemExit as e:
            print(f"[ERROR] {m} failed (exit {e.code}).")
            rc = 1
    try:  # refresh data/emp/<DEPT>/<ID>.json once, after all months are rebuilt
        import build_emp_history
        build_emp_history.main([])
    except Exception as err:
        print(f"[WARN] per-employee history build skipped: {err}")
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
