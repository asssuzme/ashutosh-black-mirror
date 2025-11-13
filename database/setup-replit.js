#!/usr/bin/env node

/**
 * Database Setup for Replit
 * Uses Replit's built-in PostgreSQL database
 * No Docker needed!
 */

const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

async function setupReplitDatabase() {
  console.log('🚀 Setting up database for Replit...\n');

  // Replit automatically provides DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found!');
    console.log('\n📝 To enable PostgreSQL in Replit:');
    console.log('1. Go to Tools → Database');
    console.log('2. Click "Enable PostgreSQL"');
    console.log('3. Replit will automatically set DATABASE_URL\n');
    process.exit(1);
  }

  console.log('✅ Found DATABASE_URL from Replit');

  // Connect to database
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false // Replit uses self-signed certs
    }
  });

  try {
    // Test connection
    console.log('📡 Testing database connection...');
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL\n');

    // Read and execute schema
    console.log('📋 Reading schema.sql...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');

    console.log('⚙️  Executing schema...');
    await pool.query(schema);
    console.log('✅ Schema applied successfully\n');

    // Verify tables
    console.log('🔍 Verifying tables...');
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📊 Created tables:');
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    console.log('\n✅ Database setup complete!\n');
    console.log('Next steps:');
    console.log('1. Run migration: node database/migrate-replit.js');
    console.log('2. Start the bot: npm start\n');

    await pool.end();

  } catch (error) {
    console.error('🔴 Setup failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  setupReplitDatabase()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { setupReplitDatabase };
