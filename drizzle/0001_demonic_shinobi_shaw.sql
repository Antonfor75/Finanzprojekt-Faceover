CREATE TABLE "budget_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"amount" numeric NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"amount" numeric NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"user_id" uuid DEFAULT auth.uid() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "start_amount" numeric;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "target_amount" numeric;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "target_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "user_id" uuid DEFAULT auth.uid() NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "user_id" uuid DEFAULT auth.uid() NOT NULL;--> statement-breakpoint
ALTER TABLE "fixed_costs" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "fixed_costs" ADD COLUMN "linked_account_id" integer;--> statement-breakpoint
ALTER TABLE "fixed_costs" ADD COLUMN "valid_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fixed_costs" ADD COLUMN "valid_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fixed_costs" ADD COLUMN "user_id" uuid DEFAULT auth.uid() NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "last_processed_week" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "user_id" uuid DEFAULT auth.uid() NOT NULL;