CREATE TABLE `historical_findings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`taskId` int,
	`discoveryUrl` text NOT NULL,
	`finalUrl` varchar(2048) NOT NULL,
	`title` text NOT NULL,
	`publisher` varchar(240) NOT NULL,
	`publishedAt` timestamp,
	`accessedAt` timestamp NOT NULL DEFAULT (now()),
	`needsEditorialOpen` enum('sim','nao') NOT NULL DEFAULT 'sim',
	`registeredEvidenceId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historical_findings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `historical_findings_case_idx` ON `historical_findings` (`caseId`);--> statement-breakpoint
CREATE INDEX `historical_findings_task_idx` ON `historical_findings` (`taskId`);