#!/usr/bin/env bash
# Query gamestates with 2+ members (party / invited players) using mongosh in Docker.
# Reads DM_MONGODB_URI from server/.env (no local mongosh required).
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

# Inside a container, 127.0.0.1 / localhost is the container, not your Mac. Use host.docker.internal (Docker Desktop).
URI="${DM_MONGODB_URI}"
URI="${URI//127.0.0.1/host.docker.internal}"
URI="${URI//localhost/host.docker.internal}"

exec docker run --rm mongo:7 mongosh "${URI}" --quiet --eval '
const games = db.gamestates.find(
  { $expr: { $gte: [{ $size: { $ifNull: ["$memberUserIds", []] } }, 2] } },
  { gameId: 1, ownerUserId: 1, memberUserIds: 1, _id: 0 }
).toArray();
print("Games with 2+ party members:", games.length);
for (const g of games) {
  const ownerStr = g.ownerUserId ? String(g.ownerUserId) : "";
  const members = (g.memberUserIds || []).map((id) => String(id));
  const invitedOnly = members.filter((id) => id !== ownerStr);
  printjson({
    gameId: g.gameId,
    ownerUserId: ownerStr || null,
    allMemberIds: members,
    invitedNonOwnerIds: invitedOnly,
  });
}
'
