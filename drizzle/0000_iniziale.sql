CREATE TABLE "activity_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apartment_cleaners" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"apartment_id" text NOT NULL,
	"cleaner_id" text NOT NULL,
	"role" text DEFAULT 'principale' NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apartment_owners" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"apartment_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"share_bps" integer DEFAULT 10000 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apartments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"checkin_time" text DEFAULT '15:00' NOT NULL,
	"checkout_time" text DEFAULT '10:00' NOT NULL,
	"default_linen_sets" integer DEFAULT 2 NOT NULL,
	"max_guests" integer DEFAULT 4 NOT NULL,
	"notes_for_cleaners" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cleaners" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'persona' NOT NULL,
	"whatsapp" text NOT NULL,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cleaning_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"apartment_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"next_reservation_id" text,
	"date" date NOT NULL,
	"window_start" text NOT NULL,
	"window_end" text,
	"same_day" boolean DEFAULT false NOT NULL,
	"guests_out" integer,
	"guests_in" integer,
	"linen_sets" integer NOT NULL,
	"next_checkin" date,
	"cleaner_id" text,
	"status" text DEFAULT 'creato' NOT NULL,
	"last_snapshot" jsonb,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"extra_cents" integer DEFAULT 0 NOT NULL,
	"extra_note" text,
	"cost_cents" integer,
	"cost_breakdown" jsonb,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"apartment_id" text NOT NULL,
	"valid_from" date NOT NULL,
	"params" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"apartment_id" text NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ical_feeds" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"apartment_id" text NOT NULL,
	"channel" text NOT NULL,
	"url" text NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"last_event_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"fiscal_code" text,
	"email" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"cleaner_id" text NOT NULL,
	"apartment_id" text NOT NULL,
	"valid_from" date NOT NULL,
	"base_cents" integer NOT NULL,
	"guest_threshold" integer DEFAULT 2 NOT NULL,
	"extra_guest_cents" integer DEFAULT 0 NOT NULL,
	"linen_set_cents" integer DEFAULT 0 NOT NULL,
	"holiday_mode" text DEFAULT 'nessuna' NOT NULL,
	"holiday_value" integer DEFAULT 0 NOT NULL,
	"include_sundays" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"kind" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"apartment_id" text NOT NULL,
	"feed_id" text,
	"channel" text NOT NULL,
	"ref" text NOT NULL,
	"external_uid" text,
	"external_code" text,
	"checkin" date NOT NULL,
	"checkout" date NOT NULL,
	"status" text NOT NULL,
	"guests" integer,
	"guests_asked_at" timestamp with time zone,
	"arrival_time" text,
	"notes" text,
	"gross_cents" integer,
	"ota_commission_cents" integer,
	"guest_cleaning_fee_cents" integer,
	"tourist_tax_cents" integer,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"apartment_id" text NOT NULL,
	"period" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'bozza' NOT NULL,
	"corrects_id" text,
	"correction_note" text,
	"result" jsonb NOT NULL,
	"contract_params" jsonb NOT NULL,
	"pdf_path" text,
	"sent_at" timestamp with time zone,
	"sent_to" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"manager_name" text NOT NULL,
	"manager_whatsapp" text NOT NULL,
	"manager_email" text NOT NULL,
	"vat_number" text,
	"address" text,
	"brand_color" text DEFAULT '#1F4E79' NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"direction" text NOT NULL,
	"phone" text NOT NULL,
	"contact_name" text,
	"kind" text NOT NULL,
	"cleaning_job_id" text,
	"reservation_id" text,
	"body" text NOT NULL,
	"buttons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"provider_id" text,
	"error" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cleaning_jobs_reservation" ON "cleaning_jobs" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "cleaning_jobs_date" ON "cleaning_jobs" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_feed_uid" ON "reservations" USING btree ("feed_id","external_uid");--> statement-breakpoint
CREATE INDEX "reservations_apartment_dates" ON "reservations" USING btree ("apartment_id","checkin");