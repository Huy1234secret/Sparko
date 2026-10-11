import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export { Prisma, PrismaClient };
export type Transaction = Prisma.TransactionClient;
export function createDatabase(url: string) { return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 10 }) }); }
export function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
