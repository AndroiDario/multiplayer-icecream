CREATE TABLE `room_creation_limits` (
	`ip_hash` text PRIMARY KEY NOT NULL,
	`hour_start` text NOT NULL,
	`hour_count` integer DEFAULT 0 NOT NULL,
	`day_start` text NOT NULL,
	`day_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `room_creation_limits_updated_idx` ON `room_creation_limits` (`updated_at`);