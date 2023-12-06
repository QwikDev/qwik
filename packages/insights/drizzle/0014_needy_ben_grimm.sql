CREATE TABLE `userApplicationMap` (
	`application_id` integer,
	`user_id` integer,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created` integer NOT NULL,
	`super_user` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `userApplicationIndex` ON `userApplicationMap` (`application_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `emailIndex` ON `users` (`email`);