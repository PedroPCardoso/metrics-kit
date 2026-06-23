#!/bin/bash
# Load the named IANA timezone tables so CONVERT_TZ() works (it returns NULL
# silently without them). Runs once on a fresh MySQL data directory.
set -e
mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" mysql
