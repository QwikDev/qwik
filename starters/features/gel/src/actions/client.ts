import { createClient, type Executor } from "gel";

// Private state via closure
let client: Executor | null = null;

const isConnectionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("connection") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("invalidreferenceerror")
  );
};

const createNewClient = (): Executor => {
  console.log("Creating new database client");
  return createClient();
};

const closeClient = (): void => {
  if (client) {
    client = null;
    console.log("Database client closed");
  }
};

// Main client management functions
export const getClient = (): Executor => {
  if (!client) {
    closeClient();
    client = createNewClient();
  }

  return client;
};

// Regular async function preserves generic types with optional args
export const executeQuery = async <T, TArgs = void>(
  queryFn: TArgs extends void
    ? (client: Executor) => Promise<T>
    : (client: Executor, args: TArgs) => Promise<T>,
  args?: TArgs,
): Promise<T> => {
  const dbClient = getClient();

  try {
    if (args === undefined) {
      return await (queryFn as (client: Executor) => Promise<T>)(dbClient);
    } else {
      return await (queryFn as (client: Executor, args: TArgs) => Promise<T>)(
        dbClient,
        args,
      );
    }
  } catch (error) {
    console.error("Database query failed:", error);

    if (isConnectionError(error)) {
      console.log("Connection error detected, recreating client...");
      closeClient();
      const newClient = getClient();
      if (args === undefined) {
        return await (queryFn as (client: Executor) => Promise<T>)(newClient);
      } else {
        return await (queryFn as (client: Executor, args: TArgs) => Promise<T>)(
          newClient,
          args,
        );
      }
    }

    throw error;
  }
};
