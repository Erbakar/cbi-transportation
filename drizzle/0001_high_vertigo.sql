ALTER TABLE `deliveries` ADD `owner` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `deliveries` ADD `business_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_business` ON `deliveries` (`owner`,`platform`,`business_key`);