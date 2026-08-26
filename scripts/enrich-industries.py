#!/usr/bin/env python3
"""
Fill in the Industry column of a cleaned leads CSV using an LLM (Groq, the same
provider the app uses to classify calls). Only rows whose Industry is blank are
sent — keyword-labeled rows are left as-is. Businesses are batched (25/request)
to keep it fast and cheap (~50-60 requests for 1,300 rows, a few cents total).

Usage:
    GROQ_API_KEY=xxxxx python3 scripts/enrich-industries.py \
        "docs/2000 Leads - CLEANED.csv"

Grab GROQ_API_KEY from your Vercel env (Settings -> Environment Variables).
Safe to re-run: it only touches blank Industry cells and overwrites in place.
"""
import csv, json, os, sys, time, subprocess

CSV_PATH = sys.argv[1] if len(sys.argv) > 1 else "docs/2000 Leads - CLEANED.csv"
API_KEY = os.environ.get("GROQ_API_KEY")
BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
# Default to the lightweight instant model: this is simple labeling, and
# gpt-oss-120b burns huge "reasoning" tokens that blow the free-tier TPM cap.
MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
BATCH = 20

SYSTEM = (
    "You label US small businesses by industry. You are given a numbered list of "
    "businesses (name + email domain). Return STRICT JSON: an object mapping each "
    "number (as a string) to a concise industry label in Title Case, 1-3 words "
    "(e.g. \"HVAC\", \"Dental\", \"Marketing Agency\", \"Auto Repair\", "
    "\"Real Estate\", \"Law Firm\", \"Trucking\"). If you genuinely cannot tell, "
    "use \"Unknown\". Return ONLY the JSON object, nothing else."
)


class GroqError(Exception):
    pass


def call_groq(items):
    """items: list of (idx, 'Business — email'). Returns {idx_str: label}.

    Uses curl (not urllib) because Groq is behind Cloudflare, which blocks
    Python's urllib signature with "error code: 1010". curl passes cleanly.
    """
    listing = "\n".join(f"{i}: {text}" for i, text in items)
    body = json.dumps({
        "model": MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": listing},
        ],
    })
    proc = subprocess.run(
        [
            "curl", "-sS", "-X", "POST", f"{BASE_URL}/chat/completions",
            "-H", "Content-Type: application/json",
            "-H", f"Authorization: Bearer {API_KEY}",
            "--data-binary", "@-",
        ],
        input=body.encode(), capture_output=True, timeout=90,
    )
    out = proc.stdout.decode(errors="replace").strip()
    if not out:
        raise GroqError(f"empty response (curl stderr: {proc.stderr.decode()[:200]})")
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        # Non-JSON => almost always a Cloudflare/HTML block page.
        raise GroqError(f"non-JSON response (blocked?): {out[:200]}")
    if isinstance(data, dict) and data.get("error"):
        raise GroqError(str(data["error"])[:200])
    return json.loads(data["choices"][0]["message"]["content"])


def main():
    if not API_KEY:
        sys.exit("ERROR: set GROQ_API_KEY (grab it from Vercel env). See file header.")

    rows = list(csv.DictReader(open(CSV_PATH)))
    if not rows:
        sys.exit(f"No rows in {CSV_PATH}")
    fields = list(rows[0].keys())
    if "Industry" not in fields:
        sys.exit("CSV has no 'Industry' column")

    def save():
        # Write full CSV after every batch, so progress is NEVER lost — even on
        # a rate limit, Ctrl-C, or crash. Re-running resumes from here.
        with open(CSV_PATH, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)

    todo = [i for i, r in enumerate(rows) if not (r.get("Industry") or "").strip()]
    print(f"{len(rows)} rows | {len(todo)} blank industries to enrich | model={MODEL}")

    nbatches = (len(todo) + BATCH - 1) // BATCH
    for bn, start in enumerate(range(0, len(todo), BATCH), 1):
        chunk = todo[start:start + BATCH]
        items = [(i, f"{rows[i]['Business Name']} — {rows[i]['Email']}") for i in chunk]

        # Up to 5 tries per batch, backing off on rate limits.
        for attempt in range(5):
            try:
                result = call_groq(items)
                break
            except GroqError as e:
                msg = str(e).lower()
                if "rate limit" in msg or "rate_limit" in msg or "tpm" in msg:
                    wait = 20 + attempt * 15
                    print(f"  batch {bn}/{nbatches} rate-limited; waiting {wait}s…")
                    save()  # persist what we have before sleeping
                    time.sleep(wait)
                    continue
                if any(k in msg for k in ("invalid_api_key", "unauthorized",
                                          "does not exist", "decommission",
                                          "model_not_found")):
                    save()
                    sys.exit(f"\nStopping (key/model problem): {e}\n"
                             "List models: curl -s https://api.groq.com/openai/v1/models "
                             "-H \"Authorization: Bearer $GROQ_API_KEY\" | grep '\"id\"'")
                print(f"  batch {bn}/{nbatches} error: {e}; skipping")
                result = {}
                break
            except (json.JSONDecodeError, KeyError, subprocess.TimeoutExpired) as e:
                print(f"  batch {bn}/{nbatches} failed ({e}); skipping")
                result = {}
                break
        else:
            print(f"  batch {bn}/{nbatches} gave up after retries; skipping")
            result = {}

        for i in chunk:
            label = str(result.get(str(i), "")).strip()
            if label and label.lower() != "unknown":
                rows[i]["Industry"] = label
        save()
        have = sum(1 for r in rows if (r.get("Industry") or "").strip())
        print(f"  batch {bn}/{nbatches} done ({have} filled total)")
        time.sleep(0.4)

    have = sum(1 for r in rows if (r.get("Industry") or "").strip())
    print(f"\nDone. Industry filled on {have}/{len(rows)} ({have*100//len(rows)}%). "
          f"Saved -> {CSV_PATH}")
    write_filled_subset(rows, fields)


def write_filled_subset(rows, fields):
    """Emit a separate CSV of ONLY the rows that have an industry, named with
    the count — this is the 'upload now' file."""
    filled_rows = [r for r in rows if (r.get("Industry") or "").strip()]
    n = len(filled_rows)
    out = f"docs/{n} Leads - Industry Filled.csv"
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(filled_rows)
    print(f"Subset (industry filled only): {n} rows -> {out}")


if __name__ == "__main__":
    main()
