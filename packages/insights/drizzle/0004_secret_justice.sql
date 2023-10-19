CREATE TABLE `symbolDetail` (
	`id` integer PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`public_api_key` text,
	`full_name` text NOT NULL,
	`origin` text NOT NULL,
	FOREIGN KEY (`public_api_key`) REFERENCES `applications`(`public_api_key`) ON UPDATE no action ON DELETE no action
);
