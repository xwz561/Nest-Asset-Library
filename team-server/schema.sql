CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  username_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

CREATE TABLE IF NOT EXISTS libraries (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  root_path text NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id),
  revision bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS memberships (
  library_id uuid NOT NULL REFERENCES libraries(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('editor', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (library_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY,
  library_id uuid NOT NULL REFERENCES libraries(id),
  parent_id uuid REFERENCES folders(id),
  name text NOT NULL,
  name_key text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS folders_unique_active_name
  ON folders(library_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name_key)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS folders_library_parent_idx ON folders(library_id, parent_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY,
  library_id uuid NOT NULL REFERENCES libraries(id),
  folder_id uuid REFERENCES folders(id),
  storage_key text NOT NULL,
  display_name text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  sha256 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_request_id uuid,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(library_id, storage_key)
);
CREATE INDEX IF NOT EXISTS assets_library_folder_idx ON assets(library_id, folder_id, display_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assets_library_folder_recent_idx ON assets(library_id, folder_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assets_library_recent_idx ON assets(library_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS assets_name_trgm_idx ON assets USING gin (display_name gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS assets_request_unique_idx ON assets(library_id, created_by, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS library_changes (
  library_id uuid NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL,
  object_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (library_id, revision)
);

-- 缩略图：由客户端生成并上传（服务端不依赖图像处理库），文件存在素材库的 thumbs 目录
ALTER TABLE assets ADD COLUMN IF NOT EXISTS thumbnail_key text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS thumbnail_at timestamptz;
