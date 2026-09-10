CREATE TABLE `appointments` (
	`appointment_id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`slot` text NOT NULL,
	`call_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`patient_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`call_id`) REFERENCES `calls`(`call_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_appointments_slot` ON `appointments` (`slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_appointments_call` ON `appointments` (`call_id`);--> statement-breakpoint
CREATE TABLE `calls` (
	`call_id` text PRIMARY KEY NOT NULL,
	`patient_id` text,
	`status` text DEFAULT 'in-progress' NOT NULL,
	`draft_json` text,
	`draft_token` text,
	`draft_patient_id` text,
	`verified_patient_id` text,
	`committed_token` text,
	`summary` text,
	`transcript` text,
	`ended_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`patient_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_calls_patient` ON `calls` (`patient_id`);--> statement-breakpoint
CREATE INDEX `idx_calls_updated` ON `calls` (`updated_at`);--> statement-breakpoint
CREATE TABLE `patients` (
	`patient_id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`date_of_birth` text NOT NULL,
	`sex` text NOT NULL,
	`phone_number` text NOT NULL,
	`email` text,
	`address_line_1` text NOT NULL,
	`address_line_2` text,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`zip_code` text NOT NULL,
	`insurance_provider` text,
	`insurance_member_id` text,
	`preferred_language` text DEFAULT 'English' NOT NULL,
	`emergency_contact_name` text,
	`emergency_contact_phone` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "patient_id_uuid" CHECK(length("patients"."patient_id") = 36),
	CONSTRAINT "first_name_length" CHECK(length(trim("patients"."first_name")) BETWEEN 1 AND 50),
	CONSTRAINT "last_name_length" CHECK(length(trim("patients"."last_name")) BETWEEN 1 AND 50),
	CONSTRAINT "sex_enum" CHECK("patients"."sex" IN ('Male','Female','Other','Decline to Answer')),
	CONSTRAINT "phone_format" CHECK(length("patients"."phone_number")=10 AND "patients"."phone_number" NOT GLOB '*[^0-9]*' AND substr("patients"."phone_number",1,1) BETWEEN '2' AND '9' AND substr("patients"."phone_number",4,1) BETWEEN '2' AND '9'),
	CONSTRAINT "dob_format" CHECK("patients"."date_of_birth" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("patients"."date_of_birth",'+0 days') IS NOT NULL AND date("patients"."date_of_birth",'+0 days')="patients"."date_of_birth"),
	CONSTRAINT "street_length" CHECK(length(trim("patients"."address_line_1")) BETWEEN 1 AND 200),
	CONSTRAINT "city_length" CHECK(length(trim("patients"."city")) BETWEEN 1 AND 100),
	CONSTRAINT "state_enum" CHECK("patients"."state" IN ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY')),
	CONSTRAINT "zip_format" CHECK("patients"."zip_code" GLOB '[0-9][0-9][0-9][0-9][0-9]' OR "patients"."zip_code" GLOB '[0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'),
	CONSTRAINT "member_id_format" CHECK("patients"."insurance_member_id" IS NULL OR (length("patients"."insurance_member_id") BETWEEN 1 AND 100 AND "patients"."insurance_member_id" NOT GLOB '*[^A-Za-z0-9]*')),
	CONSTRAINT "emergency_phone_format" CHECK("patients"."emergency_contact_phone" IS NULL OR (length("patients"."emergency_contact_phone")=10 AND "patients"."emergency_contact_phone" NOT GLOB '*[^0-9]*')),
	CONSTRAINT "language_length" CHECK(length(trim("patients"."preferred_language")) BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE INDEX `idx_patients_last_name` ON `patients` (`last_name`) WHERE "patients"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_patients_phone` ON `patients` (`phone_number`) WHERE "patients"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_patients_dob` ON `patients` (`date_of_birth`) WHERE "patients"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
