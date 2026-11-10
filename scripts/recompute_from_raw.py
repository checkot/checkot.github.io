#!/usr/bin/env python3
"""
recompute_from_raw.py - Rebuild data/YYYY-MM.json (PR) and data/qa/YYYY-MM.json (QA)
from the lossless raw archives WITHOUT downloading or uploading any Excel file.

Use it after you change a rule / rate / area / holiday:
    python scripts/recompute_from_raw.py 2026-10          # one month
    python scripts/recompute_from_raw.py 2026-10 2026-11  # several
    python scripts/recompute_from_raw.py --all            # every archived month (PR + QA)

It runs the exact same parser as to_json.py (it rebuilds the workbook in memory and calls build_month),
so there is only ONE copy of the logic. Run from the repository root.
"""
import sys
import json
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import to_json  # noqa: E402


def recompute_dept(dept, archive_dir, out_dir, months, newest):
    available = sorted(p.name[:-len(".raw.json")] for p in archive_dir.glob("*.raw.json"))
    if not available:
        return 0
    target_months = available if (not months or "--all" in months) else [m for m in months if not m.startswith("--")]
    rc = 0
    for m in target_months:
        path = archive_dir / f"{m}.raw.json"
        if not path.exists():
            if "--all" not in months:
                print(f"[SKIP] No {dept} archive for {m}. Available in {dept}: {', '.join(available)}")
            continue
        with open(path, "r", encoding="utf-8") as f:
            arc = json.load(f)
        named = [(fl["name"], to_json.rebuild_workbook(fl)) for fl in arc.get("files", [])]
        print(f"\n=== Recomputing ({dept}) {m} from {len(named)} archived file(s) ===")
        try:
            to_json.build_month(
                named,
                archive=False,
                update_latest=(m == newest or newest is None),
                force_month=m,
                dept=dept,
                out_dir=out_dir
            )
        except SystemExit as e:
            print(f"[ERROR] {dept} {m} failed (exit {e.code}).")
            rc = 1
    return rc


def main(argv):
    archive_dir = to_json.ARCHIVE_DIR
    if not archive_dir.exists():
        print(f"[ERROR] {archive_dir} not found. Run this from the repository root.")
        return 1

    all_data_months = sorted(p.stem for p in to_json.DATA_DIR.glob("20??-??.json"))
    newest = all_data_months[-1] if all_data_months else None

    # 1. Recompute PR archives
    rc_pr = recompute_dept("PR", to_json.DATA_DIR, to_json.DATA_DIR, argv, newest)

    # 2. Recompute QA archives if present
    qa_dir = to_json.DATA_DIR / "qa"
    rc_qa = 0
    if qa_dir.exists():
        all_qa_months = sorted(p.stem for p in qa_dir.glob("20??-??.json"))
        newest_qa = all_qa_months[-1] if all_qa_months else None
        rc_qa = recompute_dept("QA", qa_dir, qa_dir, argv, newest_qa)

    return 1 if (rc_pr != 0 or rc_qa != 0) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
