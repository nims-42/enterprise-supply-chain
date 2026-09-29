# Enterprise Supply Chain Management System

## Requirements

- Node.js 20 or newer
- PostgreSQL 15 or newer
- Qdrant ([releases page](https://github.com/qdrant/qdrant/releases))

## Setup

1. Create the database and load the SQL files in this order:

   ```
   psql -U postgres -c "CREATE DATABASE enterprise_supply_chain;"
   psql -U postgres -d enterprise_supply_chain -v ON_ERROR_STOP=1 -f database/schema.sql
   psql -U postgres -d enterprise_supply_chain -v ON_ERROR_STOP=1 -f database/advanced.sql
   psql -U postgres -d enterprise_supply_chain -v ON_ERROR_STOP=1 -f database/seed.sql
   ```

2. Copy `.env.example` to `.env.local` and set your Postgres password in `DATABASE_URL`.

3. Download the Qdrant zip for your system, unzip it outside this folder, and start it:

   ```
   qdrant.exe
   ```

   Keep it running. It listens on port 6333.

4. Install dependencies and start the app:

   ```
   npm install
   npm run dev
   ```

5. Open http://localhost:3000.

## Reset the sample data

Run all three SQL files again in the same order (schema, advanced, seed).

## Notes

- The first search by meaning downloads the embedding model (about 90 MB) once.
- On Linux, if `npm install` fails fetching from nuget.org, run `ONNXRUNTIME_NODE_INSTALL=skip npm install`.
