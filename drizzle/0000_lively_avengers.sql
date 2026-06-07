CREATE TABLE `market_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`quarter` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `market_room_quarter_idx` ON `market_snapshots` (`room_id`,`quarter`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`nickname` text NOT NULL,
	`token` text NOT NULL,
	`cumulative_revenue` real DEFAULT 0 NOT NULL,
	`cumulative_profit` real DEFAULT 0 NOT NULL,
	`cumulative_satisfaction` real DEFAULT 0 NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_token_unique` ON `players` (`token`);--> statement-breakpoint
CREATE INDEX `players_room_idx` ON `players` (`room_id`);--> statement-breakpoint
CREATE INDEX `players_token_idx` ON `players` (`token`);--> statement-breakpoint
CREATE TABLE `quarter_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`player_id` text NOT NULL,
	`quarter` integer NOT NULL,
	`product` text NOT NULL,
	`price_tier` text NOT NULL,
	`district` text NOT NULL,
	`google_budget` integer NOT NULL,
	`meta_budget` integer NOT NULL,
	`influencer_budget` integer NOT NULL,
	`research_spend` integer NOT NULL,
	`auto_submitted` integer DEFAULT false NOT NULL,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `decisions_room_quarter_idx` ON `quarter_decisions` (`room_id`,`quarter`);--> statement-breakpoint
CREATE INDEX `decisions_player_quarter_idx` ON `quarter_decisions` (`player_id`,`quarter`);--> statement-breakpoint
CREATE TABLE `quarter_results` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`player_id` text NOT NULL,
	`quarter` integer NOT NULL,
	`revenue` real NOT NULL,
	`profit` real NOT NULL,
	`units` integer NOT NULL,
	`market_share` real NOT NULL,
	`satisfaction` real NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `results_room_quarter_idx` ON `quarter_results` (`room_id`,`quarter`);--> statement-breakpoint
CREATE INDEX `results_player_quarter_idx` ON `quarter_results` (`player_id`,`quarter`);--> statement-breakpoint
CREATE TABLE `research_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`player_id` text NOT NULL,
	`quarter` integer NOT NULL,
	`type` text NOT NULL,
	`cost` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `research_player_quarter_idx` ON `research_purchases` (`player_id`,`quarter`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`host_name` text NOT NULL,
	`host_token` text NOT NULL,
	`seed` integer NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`current_quarter` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_code_unique` ON `rooms` (`code`);--> statement-breakpoint
CREATE INDEX `rooms_code_idx` ON `rooms` (`code`);