import { and, eq, sql } from 'drizzle-orm';
import { getDB } from './index';
import { applicationTable, userApplicationMap, usersTable } from './schema';

export class InsightsUser {
  userId: number;
  email: string;
  superUser: boolean;
  applicationPublicApiKeys: string[];

  constructor(
    userId: number,
    email: string,
    superUser: boolean,
    applicationPublicApiKeys: string[]
  ) {
    this.userId = userId;
    this.email = email;
    this.superUser = superUser;
    this.applicationPublicApiKeys = applicationPublicApiKeys;
  }

  isAuthorizedForApp(publicApiKey: string) {
    if (this.superUser) {
      return true;
    }
    return this.applicationPublicApiKeys.includes(publicApiKey);
  }
}

export const dbGetInsightUser = async (email: string): Promise<InsightsUser> => {
  const db = getDB();
  const users = await db
    .select({
      userId: usersTable.id,
      superUser: usersTable.superUser,
      publicApiKey: applicationTable.publicApiKey,
    })
    .from(usersTable)
    .leftJoin(userApplicationMap, eq(usersTable.id, userApplicationMap.userId))
    .leftJoin(applicationTable, eq(applicationTable.id, userApplicationMap.applicationId))
    .where(eq(usersTable.email, email))
    .limit(1000)
    .all();
  if (users.length === 0) {
    const insert = await db
      .insert(usersTable)
      .values({ email, superUser: false, created: new Date() })
      .execute();
    return new InsightsUser(Number(insert.lastInsertRowid), email, false, []);
  } else {
    return new InsightsUser(
      users[0].userId,
      email,
      users[0].superUser,
      users.reduceRight<string[]>((keys, user) => {
        if (user.publicApiKey) {
          keys.push(user.publicApiKey);
        }
        return keys;
      }, [])
    );
  }
};

export const dbGetUsersForApplication = async (publicApiKey: string) => {
  const users = await getDB()
    .select({
      email: usersTable.email,
    })
    .from(usersTable)
    .leftJoin(userApplicationMap, eq(usersTable.id, userApplicationMap.userId))
    .leftJoin(applicationTable, eq(applicationTable.id, userApplicationMap.applicationId))
    .where(eq(applicationTable.publicApiKey, publicApiKey))
    .orderBy(usersTable.email)
    .limit(1000)
    .all();
  return users.map((user) => user.email);
};

export const dbRemoveUserFromApplication = async (email: string, publicApiKey: string) => {
  console.log('dbRemoveUserFromApplication', email, publicApiKey);
  await getDB()
    .delete(userApplicationMap)
    .where(
      and(
        eq(
          userApplicationMap.applicationId,
          sql`(select ${applicationTable.id} from ${applicationTable} where ${applicationTable.publicApiKey} = ${publicApiKey})`
        ),
        eq(
          userApplicationMap.userId,
          sql`(select ${usersTable.id} from ${usersTable} where ${usersTable.email} = ${email})`
        )
      )
    );
};

export const dbAddUserToApplication = async (email: string, publicApiKey: string) => {
  const [user, app] = await Promise.all([
    await dbGetInsightUser(email),
    await getDB()
      .select({ applicationId: applicationTable.id })
      .from(applicationTable)
      .where(eq(applicationTable.publicApiKey, publicApiKey))
      .get(),
  ]);
  try {
    await getDB()
      .insert(userApplicationMap)
      .values({ userId: user.userId, applicationId: app?.applicationId })
      .execute();
  } catch (e) {
    console.warn('User already exists', email, publicApiKey);
  }
};
