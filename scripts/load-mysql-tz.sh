#!/usr/bin/env bash
# Load only the IANA zones the test suite uses into MySQL's named timezone
# tables. Works with Docker Compose (container name "mysql") and GitHub
# Actions service containers (found via docker ps label filtering).
set -euo pipefail

# Find the MySQL container — in Docker Compose it's "mysql", in GitHub Actions
# it's labelled with "com.github.actions.service-name=mysql".
MYSQL_CID=$(docker ps --filter label=com.github.actions.service-name=mysql --format '{{.ID}}' 2>/dev/null || true)
if [ -z "$MYSQL_CID" ]; then
  MYSQL_CID="mysql"
fi

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
