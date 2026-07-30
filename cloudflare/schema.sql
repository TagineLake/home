-- yanzien 官网留言板 · D1 表结构
-- 本地预览：sqlite3 可直接用；部署前用 `wrangler d1 execute yanzien-guestbook --file=./schema.sql` 导入

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending',  -- pending | approved | hidden
  created_at  INTEGER NOT NULL,
  ip          TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_status_time ON messages(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(created_at DESC);
