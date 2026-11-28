"""Load-shape check for a live Engage session's API (not the media server).

Each simulated learner does what the classroom page does: fetch the session state
every 5 seconds, send a heartbeat every 30, and answer whatever activity opens. Run
it against a session that is already live, with one access token per line:

    python scripts/engage_load.py --base https://api.example.com --tenant lakewood \\
        --session <session-id> --tokens tokens.txt --seconds 120

Prints request counts, errors and latency percentiles. It measures the API and
database only; video load has to be tested with real browsers.
"""

import argparse
import json
import random
import statistics
import threading
import time
import urllib.error
import urllib.request


def call(base, tenant, token, method, path, body=None):
    request = urllib.request.Request(
        f"{base}/api/engage/{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else (b"" if method != "GET" else None),
        headers={
            "Authorization": f"Bearer {token}",
            "X-Forge-Tenant": tenant,
            "Content-Type": "application/json",
        },
    )
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        raw, status = error.read(), error.code
    except OSError:
        raw, status = b"", 0
    return status, time.monotonic() - started, (json.loads(raw) if raw[:1] == b"{" else None)


def learner(args, token, until, samples, lock):
    time.sleep(random.uniform(0, 5))  # real clients do not poll in step
    answered, last_beat = set(), 0.0
    while time.monotonic() < until:
        results = []
        status, took, state = call(
            args.base, args.tenant, token, "GET", f"sessions/{args.session}/state"
        )
        results.append(("state", status, took))
        if time.monotonic() - last_beat >= 30:
            last_beat = time.monotonic()
            status, took, _ = call(
                args.base, args.tenant, token, "POST", f"sessions/{args.session}/heartbeat"
            )
            results.append(("heartbeat", status, took))
        activity = (state or {}).get("activity")
        if activity and activity["status"] == "open" and activity["id"] not in answered:
            answered.add(activity["id"])
            time.sleep(random.uniform(0.2, 3))
            choice = random.choice(activity["options"])["id"]
            status, took, _ = call(
                args.base,
                args.tenant,
                token,
                "POST",
                f"activities/{activity['id']}/respond",
                {"optionId": choice},
            )
            results.append(("respond", status, took))
        with lock:
            samples.extend(results)
        time.sleep(5)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--base", required=True)
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--session", required=True)
    parser.add_argument("--tokens", required=True, help="file with one access token per line")
    parser.add_argument("--seconds", type=int, default=120)
    args = parser.parse_args()
    args.base = args.base.rstrip("/")
    with open(args.tokens) as handle:
        tokens = [line.strip() for line in handle if line.strip()]
    samples, lock = [], threading.Lock()
    until = time.monotonic() + args.seconds
    threads = [
        threading.Thread(target=learner, args=(args, token, until, samples, lock), daemon=True)
        for token in tokens
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    print(f"{len(tokens)} learners for {args.seconds}s: {len(samples)} requests")
    for kind in ("state", "heartbeat", "respond"):
        rows = [(status, took) for name, status, took in samples if name == kind]
        if not rows:
            continue
        times = sorted(took * 1000 for _, took in rows)
        errors = sum(1 for status, _ in rows if status not in (200, 204))
        p95 = times[min(len(times) - 1, int(len(times) * 0.95))]
        print(
            f"  {kind:<9} n={len(rows):<5} errors={errors:<3} "
            f"median={statistics.median(times):.0f}ms p95={p95:.0f}ms max={times[-1]:.0f}ms"
        )


if __name__ == "__main__":
    main()
