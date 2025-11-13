-- AI Boss 2.0 Database Schema
-- PostgreSQL database for structured data storage
-- Replaces file-based JSONL/JSON storage with proper relational database

-- Enable UUID extension for unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- ============================================
-- INTERNS TABLE
-- Stores all intern/team member profiles
-- ============================================
CREATE TABLE interns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slack_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100),
    channel_id VARCHAR(20) NOT NULL,
    join_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT true,

    -- Profile data
    strengths TEXT[],
    weaknesses TEXT[],
    optimal_workload VARCHAR(50) DEFAULT 'medium',
    motivation_style VARCHAR(50) DEFAULT 'encouraging',

    -- Stats
    total_tasks_assigned INTEGER DEFAULT 0,
    total_tasks_completed INTEGER DEFAULT 0,
    average_quality_score DECIMAL(3,2) DEFAULT 0,
    attendance_rate DECIMAL(5,2) DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    last_active TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_interns_slack_id ON interns(slack_id);
CREATE INDEX idx_interns_channel_id ON interns(channel_id);
CREATE INDEX idx_interns_active ON interns(active);

-- ============================================
-- CONVERSATIONS TABLE
-- Stores ALL message interactions for context
-- ============================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id VARCHAR(50) NOT NULL,
    thread_id VARCHAR(50),
    channel_id VARCHAR(20) NOT NULL,
    channel_name VARCHAR(100),

    -- User info
    user_id VARCHAR(20) NOT NULL,
    user_name VARCHAR(255),
    user_role VARCHAR(100),
    intern_id UUID REFERENCES interns(id) ON DELETE SET NULL,

    -- Message content
    message TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',

    -- AI analysis
    intent VARCHAR(100),
    ai_decision JSONB,
    bot_response TEXT,
    actions_taken TEXT[],

    -- Context
    time_of_day INTEGER,
    day_of_week INTEGER,
    is_first_message_of_day BOOLEAN DEFAULT false,

    -- Sentiment analysis
    sentiment VARCHAR(50),
    urgency VARCHAR(50),
    tags TEXT[],

    -- Embeddings reference (stored in vector DB)
    embedding_id VARCHAR(100),

    -- Metadata
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_channel_id ON conversations(channel_id);
CREATE INDEX idx_conversations_thread_id ON conversations(thread_id);
CREATE INDEX idx_conversations_timestamp ON conversations(timestamp DESC);
CREATE INDEX idx_conversations_intern_id ON conversations(intern_id);
CREATE INDEX idx_conversations_message_id ON conversations(message_id);
CREATE INDEX idx_conversations_intent ON conversations(intent);

-- Full text search on messages
CREATE INDEX idx_conversations_message_text ON conversations USING GIN (to_tsvector('english', message));

-- ============================================
-- ATTENDANCE TABLE
-- Tracks daily check-ins and work hours
-- ============================================
CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    intern_id UUID NOT NULL REFERENCES interns(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    logged_in BOOLEAN DEFAULT true,
    login_time TIMESTAMP WITH TIME ZONE NOT NULL,
    logout_time TIMESTAMP WITH TIME ZONE,

    -- Attendance metadata
    is_late BOOLEAN DEFAULT false,
    late_by_minutes INTEGER,
    was_reminded BOOLEAN DEFAULT false,

    -- Notes
    notes TEXT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(intern_id, date)
);

CREATE INDEX idx_attendance_intern_id ON attendance(intern_id);
CREATE INDEX idx_attendance_date ON attendance(date DESC);
CREATE INDEX idx_attendance_is_late ON attendance(is_late);

-- ============================================
-- TASKS TABLE
-- Stores all assigned tasks and completions
-- ============================================
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    intern_id UUID NOT NULL REFERENCES interns(id) ON DELETE CASCADE,

    -- Task details
    title VARCHAR(500) NOT NULL,
    description TEXT,
    priority VARCHAR(20) DEFAULT 'medium',
    estimated_time INTEGER, -- in minutes

    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, completed, cancelled
    completed BOOLEAN DEFAULT false,

    -- Screenshots and proof
    screenshot_url TEXT,
    screenshot_verified BOOLEAN DEFAULT false,
    verification_notes TEXT,

    -- Progress tracking
    progress_updates JSONB DEFAULT '[]'::jsonb,

    -- Quality scoring
    quality_score DECIMAL(3,2),
    quality_notes TEXT,

    -- Timestamps
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    due_date TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_intern_id ON tasks(intern_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_completed ON tasks(completed);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_assigned_at ON tasks(assigned_at DESC);

-- ============================================
-- CONTEXT INDEX TABLE
-- Fast lookups for users, channels, threads
-- ============================================
CREATE TABLE context_index (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    index_type VARCHAR(50) NOT NULL, -- 'user', 'channel', 'thread'
    index_key VARCHAR(100) NOT NULL, -- user_id, channel_id, thread_id

    -- Aggregated stats
    total_messages INTEGER DEFAULT 0,
    last_seen TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(index_type, index_key)
);

CREATE INDEX idx_context_index_type ON context_index(index_type);
CREATE INDEX idx_context_index_key ON context_index(index_key);

-- ============================================
-- RULES AND DIRECTIVES TABLE
-- Stores workplace rules and custom directives
-- ============================================
CREATE TABLE rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_type VARCHAR(50) NOT NULL, -- 'rule', 'directive', 'tone'
    content TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,

    -- Metadata
    created_by VARCHAR(20), -- admin user_id
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rules_type ON rules(rule_type);
CREATE INDEX idx_rules_active ON rules(active);

-- ============================================
-- PERFORMANCE HISTORY TABLE
-- Tracks intern performance over time
-- ============================================
CREATE TABLE performance_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    intern_id UUID NOT NULL REFERENCES interns(id) ON DELETE CASCADE,

    -- Performance metrics
    date DATE NOT NULL,
    tasks_completed INTEGER DEFAULT 0,
    quality_score DECIMAL(3,2),
    attendance_logged BOOLEAN DEFAULT false,

    -- Behavioral observations
    engagement_level VARCHAR(50),
    response_time_avg INTEGER, -- average response time in minutes
    proactivity_score DECIMAL(3,2),

    -- AI observations
    ai_notes TEXT,
    strengths_observed TEXT[],
    areas_for_improvement TEXT[],

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_performance_intern_id ON performance_history(intern_id);
CREATE INDEX idx_performance_date ON performance_history(date DESC);

-- ============================================
-- LEARNING INSIGHTS TABLE
-- Stores AI learning and pattern discoveries
-- ============================================
CREATE TABLE learning_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Insight details
    insight_type VARCHAR(100) NOT NULL, -- 'pattern', 'optimization', 'behavior', 'anomaly'
    title VARCHAR(500) NOT NULL,
    description TEXT,

    -- Supporting data
    confidence_score DECIMAL(3,2),
    supporting_data JSONB,

    -- Application
    applied BOOLEAN DEFAULT false,
    applied_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_learning_insights_type ON learning_insights(insight_type);
CREATE INDEX idx_learning_insights_applied ON learning_insights(applied);

-- ============================================
-- TRIGGERS FOR AUTO-UPDATE TIMESTAMPS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_interns_updated_at BEFORE UPDATE ON interns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_context_index_updated_at BEFORE UPDATE ON context_index
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rules_updated_at BEFORE UPDATE ON rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- Active interns with their stats
CREATE VIEW active_interns_stats AS
SELECT
    i.id,
    i.slack_id,
    i.name,
    i.role,
    i.channel_id,
    i.completion_rate,
    i.attendance_rate,
    i.total_tasks_assigned,
    i.total_tasks_completed,
    i.last_active,
    COUNT(DISTINCT a.date) as days_attended,
    COUNT(t.id) FILTER (WHERE t.status = 'pending') as pending_tasks
FROM interns i
LEFT JOIN attendance a ON i.id = a.intern_id
LEFT JOIN tasks t ON i.id = t.intern_id AND t.completed = false
WHERE i.active = true
GROUP BY i.id;

-- Recent conversations with user context
CREATE VIEW recent_conversations AS
SELECT
    c.id,
    c.message_id,
    c.timestamp,
    c.user_name,
    c.channel_name,
    c.message,
    c.bot_response,
    c.intent,
    c.actions_taken,
    i.name as intern_name,
    i.role as intern_role
FROM conversations c
LEFT JOIN interns i ON c.intern_id = i.id
ORDER BY c.timestamp DESC
LIMIT 100;

-- Daily task completion summary
CREATE VIEW daily_task_summary AS
SELECT
    DATE(t.completed_at) as date,
    i.name as intern_name,
    COUNT(*) as tasks_completed,
    AVG(t.quality_score) as avg_quality,
    STRING_AGG(t.title, '; ') as tasks
FROM tasks t
JOIN interns i ON t.intern_id = i.id
WHERE t.completed = true
GROUP BY DATE(t.completed_at), i.name
ORDER BY date DESC;
