#!/usr/bin/env python3
"""
scrape-email-log.py
-------------------
Searches the claude@mike-wolf.com inbox for Legends-of-Basketball-related
completion emails and prints candidate changelog entries (JSON) to stdout.

Usage:
    python3 scripts/scrape-email-log.py [--since YYYY-MM-DD] [--out entries.json]

The output is a JSON array of dicts with keys:
  id, date, requester, title, summary, status

Review the output and paste relevant entries into the CHANGELOG array in
admin-changelog.html.

Requirements:
    pip install imapclient python-dateutil

Credentials are read from ~/Projects/second-brain/Resources/email-config.md
(same path daemon.py uses).
"""

import argparse
import email as email_lib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Config helpers (mirrors daemon.py)
# ---------------------------------------------------------------------------

def _read_app_password(memory_section: str) -> str:
    for candidate in [
        "~/Projects/second-brain/Resources/email-config.md",
        "~/Projects/memory/context/email.md",
    ]:
        path = Path(candidate).expanduser()
        if not path.exists():
            continue
        in_section = False
        for line in path.read_text().splitlines():
            if line.startswith("##"):
                in_section = memory_section.lower() in line.lower()
                continue
            if in_section and "App Password:" in line:
                pw = line.split("App Password:")[1].strip().replace("**", "").strip("`").strip()
                return pw
    raise RuntimeError(
        "Could not read app password. Check ~/Projects/second-brain/Resources/email-config.md"
    )


IMAP_HOST = "imap.gmail.com"
CLAUDE_EMAIL = "claude@mike-wolf.com"
LEGENDS_KEYWORDS = [
    "legends", "legends-membership", "member services committee",
    "membership site", "gfos44", "basketball"
]


# ---------------------------------------------------------------------------
# IMAP search
# ---------------------------------------------------------------------------

def fetch_legends_threads(since_date: str | None) -> list[dict]:
    try:
        from imapclient import IMAPClient
    except ImportError:
        print("ERROR: run `pip install imapclient` first", file=sys.stderr)
        sys.exit(1)

    password = _read_app_password("claude@mike-wolf.com")

    results = []
    with IMAPClient(IMAP_HOST, ssl=True) as client:
        client.login(CLAUDE_EMAIL, password)

        for folder in ["INBOX", "[Gmail]/Sent Mail"]:
            try:
                client.select_folder(folder, readonly=True)
            except Exception:
                continue

            # Build search criteria
            criteria = ["ALL"]
            if since_date:
                # imap date format: DD-Mon-YYYY
                dt = datetime.strptime(since_date, "%Y-%m-%d")
                criteria = ["SINCE", dt.strftime("%d-%b-%Y")]

            uids = client.search(criteria)
            if not uids:
                continue

            fetch_data = client.fetch(uids, ["RFC822.HEADER", "BODY[TEXT]"])
            for uid, msg_data in fetch_data.items():
                raw = msg_data.get(b"RFC822.HEADER", b"") + msg_data.get(b"BODY[TEXT]", b"")
                msg = email_lib.message_from_bytes(raw)

                subject = str(msg.get("Subject", ""))
                sender = str(msg.get("From", ""))
                date_str = str(msg.get("Date", ""))

                body_bytes = msg_data.get(b"BODY[TEXT]", b"")
                body = body_bytes.decode("utf-8", errors="replace") if body_bytes else ""

                combined = (subject + " " + sender + " " + body).lower()
                if not any(kw in combined for kw in LEGENDS_KEYWORDS):
                    continue

                # Skip unless it's a daemon completion email
                if "— done" not in subject.lower() and "done" not in subject.lower():
                    continue

                try:
                    from dateutil import parser as dateparser
                    dt = dateparser.parse(date_str)
                    date_iso = dt.strftime("%Y-%m-%d") if dt else ""
                except Exception:
                    date_iso = ""

                # Determine requester
                if "gfos44" in sender.lower() or "greg" in body.lower()[:400]:
                    requester = "Greg"
                else:
                    requester = "Mike"

                # Extract summary from body (look for "Final assistant text" block)
                summary = ""
                m = re.search(r"## Final assistant text\s*\n(.+?)(?:\n---|\n##|\Z)", body, re.S)
                if m:
                    summary = m.group(1).strip()[:600]
                    summary = re.sub(r"\*\*|__", "", summary)
                    summary = re.sub(r"\n+", " ", summary)
                else:
                    # Fall back to first 300 chars of body after greeting
                    lines = [l for l in body.splitlines() if l.strip() and not l.startswith(">")]
                    summary = " ".join(lines[:6])[:400]

                results.append({
                    "date": date_iso,
                    "requester": requester,
                    "title": subject.replace(" — Done", "").replace(" — done", "").strip(),
                    "summary": summary,
                    "status": "completed",
                    "_source_folder": folder,
                })

    # Deduplicate by title+date
    seen = set()
    deduped = []
    for r in sorted(results, key=lambda x: x["date"]):
        key = (r["date"], r["title"][:50])
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    return deduped


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since", metavar="YYYY-MM-DD", default="2026-05-01",
                    help="Only fetch emails on or after this date (default: 2026-05-01)")
    ap.add_argument("--out", metavar="FILE", help="Write JSON to file instead of stdout")
    args = ap.parse_args()

    print(f"Searching claude@ inbox for Legends emails since {args.since}...", file=sys.stderr)
    entries = fetch_legends_threads(args.since)
    print(f"Found {len(entries)} candidate entries.", file=sys.stderr)

    output = json.dumps(entries, indent=2, ensure_ascii=False)
    if args.out:
        Path(args.out).write_text(output)
        print(f"Written to {args.out}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
