#!/usr/bin/env bash
# Wait for Postgres and MySQL service containers to be ready, then load
# the IANA timezone tables MySQL's test suite needs.
set -euo pipefail

PG_HOST="${PG_HOST:-postgres}"
PG_PORT="${PG_PORT:-5432}"
MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"

echo "Waiting for Postgres at $PG_HOST:$PG_PORT..."
for i in $(seq 1 30); do
  if </dev/tcp/"$PG_HOST"/"$PG_PORT" 2>/dev/null; then
    echo "Postgres is ready"
    break
  fi
  sleep 2
done

echo "Waiting for MySQL at $MYSQL_HOST:$MYSQL_PORT..."
for i in $(seq 1 40); do
  if </dev/tcp/"$MYSQL_HOST"/"$MYSQL_PORT" 2>/dev/null; then
    echo "MySQL is ready"
    break
  fi
  sleep 2
done

# Find the MySQL container via Docker label (GitHub Actions) or name (Docker Compose).
MYSQL_CID=$(docker ps --filter label=com.github.actions.service-name=mysql --format '{{.ID}}' 2>/dev/null || true)
if [ -z "$MYSQL_CID" ]; then
  MYSQL_CID=$(docker ps --filter name=mysql --format '{{.ID}}' 2>/dev/null || true)
fi

if [ -n "$MYSQL_CID" ]; then
  echo "Loading MySQL timezone tables..."
  docker exec "$MYSQL_CID" sh -c '
    set -e
    for i in $(seq 1 30); do
      mysql -h 127.0.0.1 -uroot -proot -e "SELECT 1" >/dev/null 2>&1 && break
      sleep 2
    done
    mkdir -p /tmp/nm-tz/America
    cp /usr/share/zoneinfo/UTC /tmp/nm-tz/UTC
    cp /usr/share/zoneinfo/America/New_York /usr/share/zoneinfo/America/Sao_Paulo /tmp/nm-tz/America/
    mysql_tzinfo_to_sql /tmp/nm-tz 2>/dev/null | mysql -h 127.0.0.1 -uroot -proot mysql
    rm -rf /tmp/nm-tz
  '
  echo "MySQL timezone tables loaded (America/New_York, America/Sao_Paulo)"
else
  echo "WARNING: Could not find MySQL container, skipping timezone load"
fi
