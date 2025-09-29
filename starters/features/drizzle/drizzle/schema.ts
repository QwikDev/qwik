import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import * as t from "drizzle-orm/sqlite-core";

export const users = table("users", {
  id: t.int({ mode: "number" }).primaryKey({ autoIncrement: true }),
  name: t.text().default("not_provided"),
  email: t.text().notNull(),
});

export const schema = {
  users,
};
