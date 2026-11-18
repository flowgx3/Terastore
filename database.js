const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL environment variable.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on("error", error => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

async function verifyDatabase() {
  const result = await pool.query("SELECT current_database() AS database, NOW() AS server_time");
  console.log("PostgreSQL connected:", result.rows[0].database);
}

module.exports = { pool, verifyDatabase };
