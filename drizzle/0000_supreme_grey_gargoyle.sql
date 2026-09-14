CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`platform` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`reference` text,
	`message` text,
	`idempotency_key` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_record_platform` ON `deliveries` (`record_id`,`platform`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_sessions` (
	`key` text PRIMARY KEY NOT NULL,
	`encrypted` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`filename` text NOT NULL,
	`hash` text NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`fields` text,
	`issues` text,
	`extraction` text,
	`lock_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_owner_hash` ON `records` (`owner`,`hash`);--> statement-breakpoint
CREATE INDEX `records_owner_created` ON `records` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`revision` integer NOT NULL,
	`filename` text NOT NULL,
	`hash` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `revisions_record` ON `revisions` (`record_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`expires` integer NOT NULL
);
