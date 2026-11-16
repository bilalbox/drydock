#!/bin/sh
# Apply the hidden solution for each lab (optionally filtered by path id) and require every check to pass.
set -eu
filter=${1:-}
cd "$(dirname "$0")/.."
if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run the acceptance test" >&2
  exit 1
fi
docker compose up -d --build

i=0
until curl -fsS http://127.0.0.1:8080/api/health >/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then
    echo "labd did not become healthy" >&2
    exit 1
  fi
  sleep 2
done

post() {
  url=$1
  payload=$2
  tmp=$(mktemp)
  code=$(curl -sS --max-time 600 -o "$tmp" -w '%{http_code}' -X POST "$url" \
    -H 'content-type: application/json' \
    -d "$payload") || {
    rm -f "$tmp"
    exit 1
  }
  if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
    echo "POST $url failed with HTTP $code" >&2
    cat "$tmp" >&2
    rm -f "$tmp"
    exit 1
  fi
  cat "$tmp"
  rm -f "$tmp"
}

grade_lab() {
  lab_id=$1
  solution=$2
  body=$(post http://127.0.0.1:8080/api/sessions "{\"labId\":\"${lab_id}\"}")
  id=$(printf '%s' "$body" | python3 -c 'import json,sys; print(json.load(sys.stdin)["workspaceId"])')
  docker cp "$solution" "drydock-toolbox:/workspaces/$id/main.tf"
  docker exec --env-file "data/workspaces/$id/.drydock/docker.env" \
    -w "/workspaces/$id" drydock-toolbox \
    terraform apply -auto-approve -input=false -no-color
  result=$(post http://127.0.0.1:8080/api/sessions/current/check '{}')
  printf '%s\n' "$result"
  python3 -c 'import json,sys; data=json.loads(sys.argv[1]); assert data["passed"], data' "$result"
}

for solution in content/paths/*/scenarios/*/labs/*/solution/main.tf; do
  lab_dir=${solution%/solution/main.tf}
  path_id=$(printf '%s' "$lab_dir" | cut -d/ -f3)
  scenario_id=$(printf '%s' "$lab_dir" | cut -d/ -f5)
  lab_id=$(printf '%s' "$lab_dir" | cut -d/ -f7)
  if [ -n "$filter" ] && [ "$path_id" != "$filter" ]; then
    continue
  fi
  grade_lab "${path_id}/${scenario_id}/${lab_id}" "$solution"
done
echo "acceptance passed"
