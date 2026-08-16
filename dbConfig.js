require('dotenv').config();

const mysql = require('mysql2');

const conn = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306
});

conn.connect(err => {
  if (err) {
    console.error('Database connection failed:', err.message);
    return;
  }
  console.log(`Connected to ${process.env.DB_NAME} as ${process.env.DB_USER}`);
});

module.exports = conn;
