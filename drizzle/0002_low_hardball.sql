CREATE TABLE `research_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`objective` text NOT NULL,
	`workerRole` enum('orquestrador','navegador','triagem') NOT NULL DEFAULT 'navegador',
	`status` enum('rascunho','distribuida','recebida','cancelada') NOT NULL DEFAULT 'rascunho',
	`resultSummary` text,
	`requestedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `research_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `source_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(240) NOT NULL,
	`endpoint` text NOT NULL,
	`sourceType` enum('oficial','reportagem','documento','outra') NOT NULL DEFAULT 'oficial',
	`accessMode` enum('publico','credencial') NOT NULL DEFAULT 'publico',
	`status` enum('ativo','pausado') NOT NULL DEFAULT 'ativo',
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `source_connections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `research_tasks_case_idx` ON `research_tasks` (`caseId`);--> statement-breakpoint
CREATE INDEX `research_tasks_status_idx` ON `research_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `source_connections_status_idx` ON `source_connections` (`status`);