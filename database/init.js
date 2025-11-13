#!/usr/bin/env node

/**
 * Database Initialization Script
 * Sets up PostgreSQL database and tables from schema.sql
 */

const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

async function initializeDatabase() {
  console.log('🚀 Initializing AI Boss 2.0 Database...\n');

  // Connect to postgres database first to create our database
  const adminPool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: 'postgres', // Connect to default postgres DB
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
  });

  try {
    // Create database if it doesn't exist
    const dbName = process.env.POSTGRES_DB || 'aiboss';
    console.log(`📦 Creating database "${dbName}"...`);

    try {
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database "${dbName}" created`);
    } catch (error) {
      if (error.code === '42P04') {
        console.log(`ℹ️  Database "${dbName}" already exists`);
      } else {
        throw error;
      }
    }

    await adminPool.end();

    // Connect to our database
    const appPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: dbName,
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD,
    });

    // Read and execute schema.sql
    console.log('\n📋 Reading schema.sql...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');

    console.log('⚙️  Executing schema...');
    await appPool.query(schema);
    console.log('✅ Schema applied successfully');

    // Verify tables were created
    console.log('\n🔍 Verifying tables...');
    const tablesResult = await appPool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📊 Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    // Verify views
    const viewsResult = await appPool.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    if (viewsResult.rows.length > 0) {
      console.log('\n👁️  Created views:');
      viewsResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    }

    await appPool.end();

    console.log('\n✅ Database initialization complete!\n');
    console.log('Next steps:');
    console.log('1. Start Qdrant: docker-compose up -d qdrant');
    console.log('2. Run migration: node database/migrate.js');
    console.log('3. Start the bot: npm start\n');

  } catch (error) {
    console.error('🔴 Database initialization failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
