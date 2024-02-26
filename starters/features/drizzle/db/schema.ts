// This is your drizzle schema file.

import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").default("not_provided"),
  email: text("email").notNull(),
});

export const schema = {
  users,
};
