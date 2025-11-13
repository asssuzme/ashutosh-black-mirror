#!/usr/bin/env node

/**
 * Migration Script
 * Migrates data from JSONL/JSON files to PostgreSQL and Qdrant
 */

const fs = require('fs').promises;
const path = require('path');
const postgres = require('./postgres');
const qdrant = require('./qdrant');

const MEMORY_DIR = path.join(__dirname, '..', 'memory');
const CONVERSATIONS_FILE = path.join(MEMORY_DIR, 'conversations.jsonl');
const INTERNS_FILE = path.join(MEMORY_DIR, 'interns.json');

/**
 * Migrate interns data
 */
async function migrateInterns() {
  console.log('\n👥 Migrating interns data...');

  try {
    const data = await fs.readFile(INTERNS_FILE, 'utf8');
    const internsData = JSON.parse(data);

    if (!internsData.interns || internsData.interns.length === 0) {
      console.log('ℹ️  No interns to migrate');
      return {};
    }

    const internIdMap = {}; // Map slack_id to PostgreSQL UUID

    for (const intern of internsData.interns) {
      console.log(`   Migrating intern: ${intern.name} (${intern.slackId})`);

      // Upsert intern
      const dbIntern = await postgres.upsertIntern({
        slackId: intern.slackId || intern.id,
        name: intern.name,
        role: intern.role,
        channelId: intern.channelId,
        strengths: intern.profile?.strengths || [],
        weaknesses: intern.profile?.weaknesses || [],
        optimalWorkload: intern.profile?.optimalWorkload || 'medium',
        motivationStyle: intern.profile?.motivationStyle || 'encouraging'
      });

      internIdMap[intern.slackId || intern.id] = dbIntern.id;

      // Update stats
      await postgres.updateInternStats(dbIntern.id, {
        totalTasksAssigned: intern.stats?.totalTasksAssigned || 0,
        totalTasksCompleted: intern.stats?.totalTasksCompleted || 0,
        averageQualityScore: intern.stats?.averageQualityScore || 0,
        attendanceRate: intern.stats?.attendanceRate || 0,
        completionRate: intern.completionRate || 0
      });

      // Migrate attendance
      if (intern.attendance && Object.keys(intern.attendance).length > 0) {
        console.log(`   Migrating ${Object.keys(intern.attendance).length} attendance records...`);

        for (const [date, attendanceData] of Object.entries(intern.attendance)) {
          if (attendanceData.loggedIn) {
            const loginTime = new Date(attendanceData.timestamp);
            const workStartTime = new Date(date + ' 10:00:00'); // 10 AM work start
            const isLate = loginTime > workStartTime;
            const lateByMinutes = isLate ? Math.floor((loginTime - workStartTime) / (1000 * 60)) : 0;

            await postgres.logAttendance(
              dbIntern.id,
              date,
              loginTime,
              isLate,
              lateByMinutes
            );
          }
        }
      }

      // Migrate current tasks
      if (intern.currentTasks && intern.currentTasks.length > 0) {
        console.log(`   Migrating ${intern.currentTasks.length} current tasks...`);

        for (const task of intern.currentTasks) {
          await postgres.createTask({
            internId: dbIntern.id,
            title: task.title,
            description: task.description,
            priority: task.priority || 'medium',
            estimatedTime: parseInt(task.estimatedTime) || null,
            dueDate: null
          });
        }
      }

      // Migrate completed tasks
      if (intern.completedTasks && intern.completedTasks.length > 0) {
        console.log(`   Migrating ${intern.completedTasks.length} completed tasks...`);

        for (const task of intern.completedTasks) {
          const dbTask = await postgres.createTask({
            internId: dbIntern.id,
            title: task.title,
            description: task.description,
            priority: task.priority || 'medium',
            estimatedTime: parseInt(task.estimatedTime) || null,
            dueDate: null
          });

          await postgres.updateTaskStatus(
            dbTask.id,
            'completed',
            true,
            new Date(task.completedAt)
          );
        }
      }

      console.log(`   ✅ Migrated intern: ${intern.name}`);
    }

    console.log(`✅ Migrated ${internsData.interns.length} interns`);
    return internIdMap;

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('ℹ️  No interns.json file found, skipping');
      return {};
    }
    throw error;
  }
}

/**
 * Migrate conversations data
 */
async function migrateConversations(internIdMap) {
  console.log('\n💬 Migrating conversations data...');

  try {
    const content = await fs.readFile(CONVERSATIONS_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line);

    if (lines.length === 0) {
      console.log('ℹ️  No conversations to migrate');
      return;
    }

    console.log(`📊 Found ${lines.length} conversations`);

    // Process in batches for efficiency
    const BATCH_SIZE = 100;
    let migrated = 0;
    let failed = 0;

    for (let i = 0; i < lines.length; i += BATCH_SIZE) {
      const batch = lines.slice(i, i + BATCH_SIZE);
      console.log(`   Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(lines.length / BATCH_SIZE)}...`);

      const conversationsToEmbed = [];

      for (const line of batch) {
        try {
          const conv = JSON.parse(line);

          // Find intern ID from map
          const internId = internIdMap[conv.userId] || null;

          // Store in PostgreSQL
          const dbConv = await postgres.storeConversation({
            messageId: conv.messageId,
            threadId: conv.threadId,
            channelId: conv.channelId,
            channelName: conv.channelName,
            userId: conv.userId,
            userName: conv.userName,
            userRole: conv.userRole,
            internId: internId,
            message: conv.message,
            messageType: conv.messageType || 'text',
            intent: conv.intent,
            aiDecision: conv.aiDecision,
            botResponse: conv.botResponse,
            actionsTaken: conv.actionsTaken || [],
            timeOfDay: conv.timeOfDay,
            dayOfWeek: conv.dayOfWeek,
            isFirstMessageOfDay: conv.isFirstMessageOfDay || false,
            sentiment: conv.sentiment,
            urgency: conv.urgency,
            tags: conv.tags || [],
            embeddingId: conv.messageId, // Will match Qdrant point ID
            timestamp: new Date(conv.timestamp)
          });

          // Prepare for batch embedding
          conversationsToEmbed.push({
            messageId: conv.messageId,
            threadId: conv.threadId,
            channelId: conv.channelId,
            channelName: conv.channelName,
            userId: conv.userId,
            userName: conv.userName,
            internId: internId,
            message: conv.message,
            botResponse: conv.botResponse,
            intent: conv.intent,
            actionsTaken: conv.actionsTaken || [],
            timestamp: conv.timestamp,
            sentiment: conv.sentiment,
            tags: conv.tags || []
          });

          migrated++;
        } catch (error) {
          console.error(`   ⚠️  Failed to migrate conversation:`, error.message);
          failed++;
        }
      }

      // Store embeddings in batch
      if (conversationsToEmbed.length > 0) {
        try {
          await qdrant.storeConversationEmbeddingsBatch(conversationsToEmbed);
        } catch (error) {
          console.error(`   ⚠️  Failed to store batch embeddings:`, error.message);
        }
      }
    }

    console.log(`✅ Migrated ${migrated} conversations (${failed} failed)`);

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('ℹ️  No conversations.jsonl file found, skipping');
      return;
    }
    throw error;
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('🚀 Starting data migration...\n');
  console.log('This will migrate data from JSONL/JSON files to PostgreSQL and Qdrant\n');

  try {
    // Initialize database connections
    console.log('📡 Connecting to databases...');
    postgres.initializePool();
    await qdrant.initializeCollection();
    console.log('✅ Database connections established\n');

    // Migrate interns first (we need the ID mapping)
    const internIdMap = await migrateInterns();

    // Migrate conversations
    await migrateConversations(internIdMap);

    // Get final stats
    console.log('\n📊 Migration complete! Final statistics:\n');

    const postgresStats = await postgres.getMemoryStats();
    console.log('PostgreSQL:');
    console.log(`   - Total conversations: ${postgresStats.totalConversations}`);
    console.log(`   - Total users: ${postgresStats.totalUsers}`);
    console.log(`   - Total channels: ${postgresStats.totalChannels}`);
    console.log(`   - Total threads: ${postgresStats.totalThreads}`);

    const qdrantInfo = await qdrant.getCollectionInfo();
    if (qdrantInfo) {
      console.log('\nQdrant:');
      console.log(`   - Total vectors: ${qdrantInfo.pointsCount}`);
      console.log(`   - Indexed vectors: ${qdrantInfo.indexedVectorsCount}`);
      console.log(`   - Status: ${qdrantInfo.status}`);
    }

    console.log('\n✅ Migration successful!\n');

    await postgres.close();

  } catch (error) {
    console.error('\n🔴 Migration failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runMigration };
