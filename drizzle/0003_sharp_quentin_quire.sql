CREATE TABLE `source_case_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`sourceConnectionId` int NOT NULL,
	`priority` int NOT NULL DEFAULT 0,
	`active` enum('sim','nao') NOT NULL DEFAULT 'sim',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `source_case_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `source_case_links_case_idx` ON `source_case_links` (`caseId`);--> statement-breakpoint
CREATE INDEX `source_case_links_source_idx` ON `source_case_links` (`sourceConnectionId`);