#!/bin/bash
set -e

 
# Create users if they do not already exist
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    DO
    \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'boltz') THEN
            CREATE USER boltz WITH PASSWORD 'boltz';
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'shopstr') THEN
            CREATE USER shopstr WITH PASSWORD 'shopstr';
        END IF;
    END
    \$\$
EOSQL

# Create databases if they do not already exist
psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE boltz;
EOSQL
psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE shopstr;
EOSQL

# Enable TimescaleDB extension
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname=boltz <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
EOSQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname=shopstr <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
EOSQL

# Grant privileges
psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" <<-EOSQL
    GRANT ALL PRIVILEGES ON DATABASE boltz TO boltz;
EOSQL
psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" <<-EOSQL
    GRANT ALL PRIVILEGES ON DATABASE shopstr TO shopstr;
EOSQL

# Grant privileges on public schema
psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname=boltz <<-EOSQL
    GRANT ALL PRIVILEGES ON SCHEMA public TO boltz;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO boltz;
EOSQL
psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname=shopstr <<-EOSQL
    GRANT ALL PRIVILEGES ON SCHEMA public TO shopstr;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO shopstr;
EOSQL

# Restore boltz database from dump file
pg_restore -U "$POSTGRES_USER" -d boltz /seed/boltz.dump

# Restore shopstr database from dump file
pg_restore -U "$POSTGRES_USER" -d shopstr /seed/shopstr.dump