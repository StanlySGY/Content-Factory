/* eslint-disable */
// 0003 — audit_events（db §5.18）：哈希链防篡改（ADR-008）+ append-only + RLS 跨项目隔离（ADR-009）
//
// 安全要点：
//   - sequence_no 项目内单调；prev_hash/entry_hash 构成哈希链；BEFORE INSERT 触发器计算并锁定
//   - 项目内 advisory lock 串行化插入，杜绝并发断号/竞态；(project_id, sequence_no) 唯一兜底
//   - append-only：UPDATE/DELETE/TRUNCATE 触发器 RAISE；权限层不授 cf_app U/D（见 0004）
//   - RLS：仅可见/可写 current_setting('app.current_project_id') 对应项目；FORCE 对属主亦生效

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE audit_events (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id   uuid NOT NULL REFERENCES projects (id),
      actor_id     uuid REFERENCES users (id),
      subject_type varchar(80)  NOT NULL,
      subject_id   uuid         NOT NULL,
      action       varchar(120) NOT NULL,
      before_data  jsonb,
      after_data   jsonb,
      metadata     jsonb        NOT NULL DEFAULT '{}'::jsonb,
      sequence_no  bigint       NOT NULL,
      prev_hash    varchar(128),
      entry_hash   varchar(128) NOT NULL,
      created_at   timestamptz  NOT NULL DEFAULT now(),
      CONSTRAINT audit_events_seq_unique UNIQUE (project_id, sequence_no)
    );
    CREATE INDEX idx_audit_events_subject
      ON audit_events (subject_type, subject_id, created_at);
    CREATE INDEX idx_audit_events_project_time
      ON audit_events (project_id, created_at);

    -- 哈希链：BEFORE INSERT 计算 sequence_no / prev_hash / entry_hash
    CREATE FUNCTION cf_audit_chain() RETURNS trigger
    LANGUAGE plpgsql AS $$
    DECLARE
      v_prev_seq  bigint;
      v_prev_hash varchar(128);
      v_canonical text;
    BEGIN
      -- 项目内串行化（含首条），避免并发竞态
      PERFORM pg_advisory_xact_lock(hashtext('cf_audit:' || NEW.project_id::text));

      SELECT sequence_no, entry_hash INTO v_prev_seq, v_prev_hash
        FROM audit_events
        WHERE project_id = NEW.project_id
        ORDER BY sequence_no DESC
        LIMIT 1;

      NEW.sequence_no := COALESCE(v_prev_seq, 0) + 1;
      NEW.prev_hash   := v_prev_hash;  -- 项目首条为 NULL

      v_canonical := concat_ws('|',
        NEW.project_id::text,
        NEW.sequence_no::text,
        NEW.subject_type,
        NEW.subject_id::text,
        NEW.action,
        COALESCE(NEW.actor_id::text, ''),
        COALESCE(NEW.before_data::text, ''),
        COALESCE(NEW.after_data::text, ''),
        COALESCE(NEW.metadata::text, '{}'),
        COALESCE(NEW.prev_hash, '')
      );
      NEW.entry_hash := encode(sha256(convert_to(v_canonical, 'UTF8')), 'hex');
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER trg_audit_chain
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION cf_audit_chain();

    -- append-only：拒绝任何 UPDATE / DELETE / TRUNCATE
    CREATE FUNCTION cf_audit_immutable() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'audit_events is append-only: % is prohibited', TG_OP
        USING ERRCODE = 'check_violation';
    END;
    $$;

    CREATE TRIGGER trg_audit_no_update
      BEFORE UPDATE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION cf_audit_immutable();
    CREATE TRIGGER trg_audit_no_delete
      BEFORE DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION cf_audit_immutable();
    CREATE TRIGGER trg_audit_no_truncate
      BEFORE TRUNCATE ON audit_events
      FOR EACH STATEMENT EXECUTE FUNCTION cf_audit_immutable();

    -- RLS：跨项目隔离（ADR-009）；未设上下文则不可见（安全默认）
    ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
    CREATE POLICY audit_project_isolation ON audit_events
      USING      (project_id = nullif(current_setting('app.current_project_id', true), '')::uuid)
      WITH CHECK (project_id = nullif(current_setting('app.current_project_id', true), '')::uuid);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS audit_events;
    DROP FUNCTION IF EXISTS cf_audit_chain();
    DROP FUNCTION IF EXISTS cf_audit_immutable();
  `);
};
