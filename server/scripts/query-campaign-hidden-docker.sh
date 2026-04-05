#!/usr/bin/env bash
# Print campaign DM-hidden field (dmHiddenAdventureObjective) + full campaignSpec for one game via mongosh in Docker.
# Reads DM_MONGODB_URI from server/.env (no local mongosh required).
#
# Usage:
#   ./scripts/query-campaign-hidden-docker.sh
#   ./scripts/query-campaign-hidden-docker.sh 1775330167551-40d0e0193385
set -euo pipefail
SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
# shellcheck disable=SC1091
source "${SERVER_DIR}/.env"
set +a
if [[ -z "${DM_MONGODB_URI:-}" ]]; then
  echo "DM_MONGODB_URI is not set in ${SERVER_DIR}/.env" >&2
  exit 1
fi

GAME_ID="${1:-1775330167551-40d0e0193385}"

URI="${DM_MONGODB_URI}"
URI="${URI//127.0.0.1/host.docker.internal}"
URI="${URI//localhost/host.docker.internal}"

exec docker run --rm -e "TARGET_GAME_ID=${GAME_ID}" mongo:7 mongosh "${URI}" --quiet --eval '
const gameId = process.env.TARGET_GAME_ID;
const doc = db.gamestates.findOne(
  { gameId },
  { gameId: 1, ownerUserId: 1, memberUserIds: 1, campaignSpec: 1, "gameSetup.party": 1, _id: 0 }
);
if (!doc) {
  print("No document for gameId:", gameId);
  quit(1);
}
const spec = doc.campaignSpec && typeof doc.campaignSpec === "object" ? doc.campaignSpec : {};
const hidden =
  typeof spec.dmHiddenAdventureObjective === "string" ? spec.dmHiddenAdventureObjective.trim() : "";
print("gameId:", doc.gameId);
print("ownerUserId:", doc.ownerUserId ? String(doc.ownerUserId) : null);
print("memberUserIds:", JSON.stringify((doc.memberUserIds || []).map((id) => String(id))));
if (doc.gameSetup && doc.gameSetup.party && doc.gameSetup.party.phase != null) {
  print("party.phase:", String(doc.gameSetup.party.phase));
}
print("");
print("--- dmHiddenAdventureObjective (DM-only) ---");
print(hidden || "(empty or missing)");
print("");
print("--- full campaignSpec ---");
printjson(spec);
'
