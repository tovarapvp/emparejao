CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_participant_unique` ON `push_subscriptions` (`participant_id`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_room_idx` ON `push_subscriptions` (`room_id`);