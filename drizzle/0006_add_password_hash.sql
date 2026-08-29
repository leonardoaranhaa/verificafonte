ALTER TABLE `historical_findings` ADD `searchKey` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `historical_findings` ADD `queryText` varchar(240) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` text;--> statement-breakpoint
CREATE INDEX `historical_findings_search_key_idx` ON `historical_findings` (`searchKey`);