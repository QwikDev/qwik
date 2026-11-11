CREATE TABLE `application_sources` (
	`public_api_key` text PRIMARY KEY NOT NULL,
	`repository` text NOT NULL,
	`revision` text NOT NULL,
	`source_root` text NOT NULL,
	FOREIGN KEY (`public_api_key`) REFERENCES `applications`(`public_api_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `application_sources` (`public_api_key`, `repository`, `revision`, `source_root`)
SELECT `public_api_key`, 'https://github.com/QwikDev/qwik', 'main', 'packages/docs/src'
FROM `applications` WHERE `public_api_key` = '221smyuj5gl';
