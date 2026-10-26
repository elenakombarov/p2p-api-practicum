---
name: p2p-qa-run
description: Runs the P2P QA agent — the explorer, then the adversary, then the judge — and shows the report. Use when the user asks to run the QA agent, test the P2P API on its own, run the challenge, or check the business rules end to end against a running API.
---

# P2P QA run

Run the explorer, then the adversary, then the judge. Show the report. Fix nothing.

The base URL is the one the user gave. If none was given, use `http://localhost:8000`. Do not add a trailing slash.

## Steps

1. `GET <base URL>/health` through `curl.exe`. If it is down, tell the user to run `npm start` and stop.
2. Empty `qa-run/`. It holds run output only. Do not delete anything outside that directory.
3. `POST /admin/reset` through `curl.exe`.
4. Run the `p2p-explorer` subagent with the base URL and wait until it finishes.
5. Run the `p2p-adversary` subagent with the base URL and wait until it finishes.
6. Run the `p2p-judge` subagent with the base URL and wait until it finishes.
7. Show the happy path status, the rule table, and the path to `qa-run/report.json`.

## Stop

Fix nothing, write no tests, file no bugs: those are separate steps a human starts.

Do not read `src/`. Do not push. HTTP calls in this skill go through `curl.exe`.
