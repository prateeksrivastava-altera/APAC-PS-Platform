-- 009 — AI Project Analyst tables.
--
-- Persists per-project, per-user conversations with the in-app AI agent
-- (Matcha mission MISSION_ID_WBS). Each conversation is a thread; messages
-- are ordered by CreatedAtUtc within a conversation. Feedback (+1/-1) on
-- assistant messages is captured for future curation.

CREATE TABLE IF NOT EXISTS AIConversations (
    ConversationId  SERIAL  PRIMARY KEY,
    ProjectId       INT     NOT NULL REFERENCES Projects(ProjectId) ON DELETE CASCADE,
    UserEmail       TEXT    NOT NULL,
    Title           TEXT,
    CreatedAtUtc    TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    UpdatedAtUtc    TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE INDEX IF NOT EXISTS ix_aiconvo_project_user
    ON AIConversations (ProjectId, UserEmail);

CREATE TABLE IF NOT EXISTS AIMessages (
    MessageId       SERIAL  PRIMARY KEY,
    ConversationId  INT     NOT NULL REFERENCES AIConversations(ConversationId) ON DELETE CASCADE,
    Role            TEXT    NOT NULL,                      -- 'user' | 'assistant' | 'system'
    Content         TEXT    NOT NULL,
    Mode            TEXT,                                  -- 'chat' | 'analysis'
    Feedback        SMALLINT,                              -- NULL | -1 (down) | 1 (up)
    FeedbackNote    TEXT,
    TokensUsed      INT,
    CreatedAtUtc    TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE INDEX IF NOT EXISTS ix_aimsg_convo
    ON AIMessages (ConversationId);
