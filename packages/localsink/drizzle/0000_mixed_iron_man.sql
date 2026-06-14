CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_name` text NOT NULL,
	`timestamp` integer NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`trace_id` text,
	`span_id` text,
	`logger` text,
	`error` text,
	`attributes` text
);
--> statement-breakpoint
CREATE INDEX `idx_logs_timestamp` ON `logs` (`timestamp`,`id`);--> statement-breakpoint
CREATE INDEX `idx_logs_service_name` ON `logs` (`service_name`,`timestamp`,`id`);--> statement-breakpoint
CREATE INDEX `idx_logs_level` ON `logs` (`level`,`timestamp`,`id`);--> statement-breakpoint
CREATE INDEX `idx_logs_trace_id` ON `logs` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_logs_logger` ON `logs` (`logger`);--> statement-breakpoint
CREATE INDEX `idx_logs_service_name_id` ON `logs` (`service_name`,`id`);--> statement-breakpoint
CREATE INDEX `idx_logs_level_id` ON `logs` (`level`,`id`);--> statement-breakpoint
CREATE INDEX `idx_logs_logger_id` ON `logs` (`logger`,`id`);--> statement-breakpoint
CREATE VIRTUAL TABLE logs_fts USING fts5(
  message,
  error_text,
  attributes_text,
  content=''
);
--> statement-breakpoint
CREATE TRIGGER logs_ai AFTER INSERT ON logs BEGIN
  INSERT INTO logs_fts(rowid, message, error_text, attributes_text)
  VALUES (
    new.id,
    new.message,
    COALESCE((
      SELECT GROUP_CONCAT(value, ' ')
      FROM json_tree(new.error)
      WHERE type IN ('text', 'integer', 'real')
    ), ''),
    COALESCE((
      SELECT GROUP_CONCAT(
        CASE WHEN key IS NOT NULL THEN key || ' ' ELSE '' END || value,
        ' '
      )
      FROM json_tree(new.attributes)
      WHERE type IN ('text', 'integer', 'real')
    ), '')
  );
END;