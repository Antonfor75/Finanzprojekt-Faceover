CREATE TABLE "account_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"account_id" integer NOT NULL,
	"amount" numeric NOT NULL,
	"type" text NOT NULL,
	"note" text,
	"transaction_date" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fun_accounts_v2" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text DEFAULT 'Spaßkonto' NOT NULL,
	"foresight_enabled" boolean DEFAULT true NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	CONSTRAINT "fun_accounts_v2_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "fun_group_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fun_account_id" integer NOT NULL,
	"group_id" integer,
	"amount" numeric NOT NULL,
	"description" text,
	"expense_date" text NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fun_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fun_account_id" integer NOT NULL,
	"name" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"user_id" uuid DEFAULT auth.uid() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fun_income_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fun_account_id" integer NOT NULL,
	"group_id" integer,
	"amount" numeric NOT NULL,
	"description" text,
	"income_date" text NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "valid_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fixed_costs" ADD COLUMN "execution_day" integer;--> statement-breakpoint
ALTER TABLE "fixed_costs" ADD COLUMN "frequency" text;--> statement-breakpoint
ALTER TABLE "income_sources" ADD COLUMN "execution_day" integer;--> statement-breakpoint
CREATE INDEX "fun_group_expenses_user_account_idx" ON "fun_group_expenses" USING btree ("user_id","fun_account_id");--> statement-breakpoint
CREATE INDEX "fun_groups_user_account_idx" ON "fun_groups" USING btree ("user_id","fun_account_id");--> statement-breakpoint
CREATE INDEX "fun_income_entries_user_account_idx" ON "fun_income_entries" USING btree ("user_id","fun_account_id");