#!/usr/bin/env bash
set -euo pipefail

if [[ ! -d .venv ]]; then
  python -m venv .venv
fi
source .venv/bin/activate
pip install -r backend/requirements.txt
export TESTING=1
export DB_NAME=dukani_test
export PYTHONPATH=.
pytest backend/tests -q
