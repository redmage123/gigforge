"""Build the Paris laptop PowerPoint, handout and speaker notes with python-pptx and ReportLab.

    python build.py [output folder]

Needs: python-pptx, reportlab, cairosvg, pillow, numpy, lxml, and ffprobe (for the demo
recordings' lengths). Slide content is fetched first from the live web deck on the server
(src/present/paris-deck.json) into assets/paris-deck.json; if the server can't be reached
the last fetched copy is used, and the script says so. The three demo recordings are
taken from the earlier laptop file in $PARIS_DELIVERABLES/previous-2026-11-26/
(default ~/bacswn-deliverables/paris-presentation).
"""
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = "aielevate@78.47.104.139"
REMOTE_DECK = "/opt/ai-elevate/paris-presentation/app/frontend/src/present/paris-deck.json"


def fetch_deck():
    """Copy the live deck's content next to this script before building."""
    tmp = HERE / "assets" / "paris-deck.json.new"
    r = subprocess.run(["scp", "-q", "-o", "ConnectTimeout=15", "-i", str(Path.home() / ".ssh" / "id_ecdsa"),
                        f"{SERVER}:{REMOTE_DECK}", str(tmp)], capture_output=True, text=True)
    if r.returncode == 0:
        tmp.replace(HERE / "assets" / "paris-deck.json")
        print("Fetched the live deck from the server")
    else:
        tmp.unlink(missing_ok=True)
        print(f"Could not reach the server ({r.stderr.strip() or r.returncode}); using the last fetched deck")


if __name__ == "__main__":
    fetch_deck()                                   # before scenes.py reads the deck

import pdf_out  # noqa: E402
import pptx_out  # noqa: E402

# The deliverables folder (outputs, and the earlier laptop file the demo recordings come from).
DELIVERABLES = Path(os.environ.get("PARIS_DELIVERABLES", Path.home() / "bacswn-deliverables" / "paris-presentation"))
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else DELIVERABLES
DEMO_SOURCE = DELIVERABLES / "previous-2026-11-26" / "Paris_From_Bottleneck_to_Bankable_laptop.pptx"
NAME = "Paris_From_Bottleneck_to_Bankable"

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    n = pptx_out.build(OUT / f"{NAME}_laptop.pptx", DEMO_SOURCE)
    print(f"{NAME}_laptop.pptx: {n} slides")
    pages = pdf_out.handout(OUT / f"{NAME}_handout.pdf", DEMO_SOURCE)
    print(f"{NAME}_handout.pdf: {pages} pages")
    pdf_out.speaker_notes(OUT / f"{NAME}_speaker_notes.pdf")
    print(f"{NAME}_speaker_notes.pdf")
    pdf_out.driving_guide(OUT / f"{NAME}_how_to_drive.pdf")
    print(f"{NAME}_how_to_drive.pdf")
