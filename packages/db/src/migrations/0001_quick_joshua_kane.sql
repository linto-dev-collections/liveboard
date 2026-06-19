CREATE TABLE `asset` (
	`board_id` text NOT NULL,
	`file_id` text NOT NULL,
	`r2_object_id` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer,
	`height` integer,
	`sha256` text,
	`created_by_user_id` text,
	`last_retrieved_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`board_id`, `file_id`),
	FOREIGN KEY (`board_id`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`board_id`,`r2_object_id`) REFERENCES `board_r2_object`(`board_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "asset_mime_check" CHECK("asset"."mime" IN ('image/png','image/jpeg','image/svg+xml','image/gif','image/webp')),
	CONSTRAINT "asset_dim_check" CHECK(("asset"."width" IS NULL OR "asset"."width" > 0) AND ("asset"."height" IS NULL OR "asset"."height" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_r2Object_uidx` ON `asset` (`r2_object_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`organization_id_snapshot` text NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_log_org_created_idx` ON `audit_log` (`organization_id_snapshot`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_target_idx` ON `audit_log` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `board` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`title` text DEFAULT 'Untitled' NOT NULL,
	`created_by_user_id` text,
	`thumbnail_key` text,
	`last_activity_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`deletion_state` text DEFAULT 'active' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "board_deletion_state_check" CHECK("board"."deletion_state" IN ('active','purging'))
);
--> statement-breakpoint
CREATE INDEX `board_org_title_idx` ON `board` (`organization_id`,"title" COLLATE NOCASE);--> statement-breakpoint
CREATE INDEX `board_org_activity_idx` ON `board` (`organization_id`,`last_activity_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `board_id_org_uidx` ON `board` (`id`,`organization_id`);--> statement-breakpoint
CREATE TABLE `board_favorite` (
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`board_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `board_id`),
	FOREIGN KEY (`organization_id`,`user_id`) REFERENCES `member`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`,`organization_id`) REFERENCES `board`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `board_favorite_boardId_idx` ON `board_favorite` (`board_id`);--> statement-breakpoint
CREATE TABLE `board_r2_object` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`kind` text NOT NULL,
	`r2_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`size` integer,
	`gc_candidate_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "board_r2_object_kind_check" CHECK("board_r2_object"."kind" IN ('asset','thumbnail','backup','history','export')),
	CONSTRAINT "board_r2_object_status_check" CHECK("board_r2_object"."status" IN ('pending','sanitizing','ready','deleting','failed')),
	CONSTRAINT "board_r2_object_size_check" CHECK("board_r2_object"."size" IS NULL OR "board_r2_object"."size" > 0),
	CONSTRAINT "board_r2_object_ready_size_check" CHECK("board_r2_object"."status" != 'ready' OR "board_r2_object"."size" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `board_r2_object_r2Key_uidx` ON `board_r2_object` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `board_r2_object_board_id_uidx` ON `board_r2_object` (`board_id`,`id`);--> statement-breakpoint
CREATE INDEX `board_r2_object_board_status_idx` ON `board_r2_object` (`board_id`,`status`);--> statement-breakpoint
CREATE TABLE `board_role` (
	`board_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`board_id`, `user_id`),
	FOREIGN KEY (`organization_id`,`user_id`) REFERENCES `member`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`,`organization_id`) REFERENCES `board`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "board_role_role_check" CHECK("board_role"."role" IN ('owner','editor','viewer'))
);
--> statement-breakpoint
CREATE INDEX `board_role_userId_idx` ON `board_role` (`user_id`);--> statement-breakpoint
CREATE TABLE `comment` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`author_id` text,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `comment_thread`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `comment_thread_created_idx` ON `comment` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `comment_mention` (
	`comment_id` text NOT NULL,
	`mentioned_user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`comment_id`, `mentioned_user_id`),
	FOREIGN KEY (`comment_id`) REFERENCES `comment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mentioned_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comment_mention_user_idx` ON `comment_mention` (`mentioned_user_id`);--> statement-breakpoint
CREATE TABLE `comment_thread` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`anchor_kind` text NOT NULL,
	`anchor_element_id` text,
	`anchor_x` real,
	`anchor_y` real,
	`resolved` integer DEFAULT false NOT NULL,
	`resolved_at` integer,
	`resolved_by_user_id` text,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "comment_thread_resolved_check" CHECK("comment_thread"."resolved" IN (0,1)),
	CONSTRAINT "comment_thread_anchor_check" CHECK((
        ("comment_thread"."anchor_kind" = 'element' AND "comment_thread"."anchor_element_id" IS NOT NULL AND "comment_thread"."anchor_x" IS NULL AND "comment_thread"."anchor_y" IS NULL)
        OR
        ("comment_thread"."anchor_kind" = 'point' AND "comment_thread"."anchor_x" IS NOT NULL AND "comment_thread"."anchor_y" IS NOT NULL AND "comment_thread"."anchor_element_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE INDEX `comment_thread_board_resolved_idx` ON `comment_thread` (`board_id`,`resolved`);--> statement-breakpoint
CREATE TABLE `deletion_job` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`lease_owner` text,
	`lease_expires_at` integer,
	`lease_version` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_retry_at` integer,
	`last_error` text,
	`requested_by_user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "deletion_job_state_check" CHECK("deletion_job"."state" IN ('queued','purging_do','purging_r2','ready_to_delete','done','failed')),
	CONSTRAINT "deletion_job_lease_check" CHECK(("deletion_job"."lease_owner" IS NULL AND "deletion_job"."lease_expires_at" IS NULL)
        OR ("deletion_job"."lease_owner" IS NOT NULL AND "deletion_job"."lease_expires_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deletion_job_board_uidx` ON `deletion_job` (`board_id`);--> statement-breakpoint
CREATE INDEX `deletion_job_due_idx` ON `deletion_job` (`state`,`next_retry_at`);--> statement-breakpoint
CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`type` text NOT NULL,
	`comment_id` text NOT NULL,
	`actor_user_id` text,
	`read_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comment_id`) REFERENCES `comment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "notification_type_check" CHECK("notification"."type" IN ('mention'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_dedup_uidx` ON `notification` (`type`,`user_id`,`comment_id`);--> statement-breakpoint
CREATE INDEX `notification_user_org_created_idx` ON `notification` (`user_id`,`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_user_unread_idx` ON `notification` (`user_id`) WHERE "notification"."read_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `member_org_user_uidx` ON `member` (`organization_id`,`user_id`);