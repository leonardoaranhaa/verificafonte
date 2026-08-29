CREATE TABLE `case_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`extractedClaim` text NOT NULL,
	`evidenceSummary` text NOT NULL,
	`divergences` text NOT NULL,
	`reviewBrief` text NOT NULL,
	`modelLabel` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `case_analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `case_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`reviewerId` int NOT NULL,
	`decision` enum('aprovar','solicitar_ajustes','rejeitar') NOT NULL,
	`note` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `case_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`sourceName` varchar(240) NOT NULL,
	`sourceType` enum('oficial','reportagem','documento','outra') NOT NULL DEFAULT 'outra',
	`sourceDate` timestamp,
	`accessedAt` timestamp NOT NULL DEFAULT (now()),
	`context` text NOT NULL,
	`excerpt` text,
	`relation` enum('apoia','contradiz','contextualiza','neutra') NOT NULL DEFAULT 'contextualiza',
	CONSTRAINT `evidences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fact_check_cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(180) NOT NULL,
	`claimText` text NOT NULL,
	`claimUrl` text,
	`status` enum('em_apuracao','confirmado','divergente','insuficiente') NOT NULL DEFAULT 'em_apuracao',
	`workflowStatus` enum('rascunho','em_revisao','publicado','arquivado') NOT NULL DEFAULT 'rascunho',
	`methodology` text,
	`editorialNote` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`publishedAt` timestamp,
	CONSTRAINT `fact_check_cases_id` PRIMARY KEY(`id`),
	CONSTRAINT `fact_check_cases_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `case_analyses_case_idx` ON `case_analyses` (`caseId`);--> statement-breakpoint
CREATE INDEX `case_reviews_case_idx` ON `case_reviews` (`caseId`);--> statement-breakpoint
CREATE INDEX `evidences_case_idx` ON `evidences` (`caseId`);--> statement-breakpoint
CREATE INDEX `fact_check_cases_workflow_idx` ON `fact_check_cases` (`workflowStatus`);--> statement-breakpoint
CREATE INDEX `fact_check_cases_status_idx` ON `fact_check_cases` (`status`);