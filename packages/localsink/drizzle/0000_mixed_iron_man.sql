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
