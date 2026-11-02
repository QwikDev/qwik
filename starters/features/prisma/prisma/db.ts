import "dotenv/config";
import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";
import type { Contract } from "./contract.d";
import contractJson from "./contract.json" with { type: "json" };

// `prisma contract emit` generates contract.json and contract.d.ts from contract.prisma.
export const contract = contractFromJson<Contract>(contractJson);

// One client for the whole server. Its connection pool is shared by every request.
export const db = postgres({
  contract,
  url: process.env["DATABASE_URL"]!,
});
