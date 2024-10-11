import { Payer, Prisma, PrismaClient, Transaction } from "@prisma/client";

export const prisma = new PrismaClient({
    log: ["warn", "error"],
});

/**
 * Creates a transaction in the database, creating a payer if one with the name
 * doesn't exist, and also updating their points.
 *
 * @param payer the payer who the points are from
 * @param points amount of points to be added - should be an integer greater than 0
 * @param timestamp when the transaction took place
 * @returns the created transaction object
 * @throws {RangeError} if points is non-integer or less than 1
 */
export async function createTransaction(
    payer: string,
    points: number,
    timestamp: Date
): Promise<Transaction> {
    if (!Number.isInteger(points)) throw new RangeError("'points' must be an integer");
    if (points < 1) throw new RangeError("'points' must be greater than 0");

    const dbPayer = await getOrCreatePayer(payer);
    await prisma.payer.update({
        where: { id: dbPayer.id },
        data: { balance: dbPayer.balance + points },
    });

    return await prisma.transaction.create({
        data: {
            points,
            timestamp,
            payerId: dbPayer.id,
        },
    });
}

/**
 * Gets the balances of all payers, in the form of:
 * ```
 * { "payer1": 1, "payer2": 2 }
 * ```
 * @returns balances in the form of object described above
 */
export async function getBalances(): Promise<Record<string, number>> {
    const payers = await prisma.payer.findMany({
        select: { name: true, balance: true },
    });

    console.log(payers);

    const result: Record<string, number> = {};
    for (const payer of payers) {
        result[payer.name] = payer.balance;
    }

    return result;
}

/**
 * Spends a non-zero positive number of points, starting from oldest points to the newest.
 * If 'payerName' is specified, then only that payer's points will be used. The return value
 * is in the form of:
 * ```
 * [{ "payer": "PAYER1", "points": -100 }, { "payer": "PAYER1", "points": -200 }]
 * ```
 *
 * @param points point to spend
 * @param payerName specify which payer to spend points from
 * @returns array of payers and how many points were used, in the format above
 * @throws {RangeError} if points is non-integer or less than 1
 */
export async function spend(
    points: number,
    payerName?: string
): Promise<{ payer: string; points: number }[]> {
    if (!Number.isInteger(points)) throw new RangeError("'points' must be an integer");
    if (points < 1) throw new RangeError("'points' must be greater than 0");

    // get a list of transactions to consider
    const transactions = await prisma.transaction.findMany({
        // if there is a payerName specified, then only those transactions should be loaded
        where: payerName ? { payer: { name: payerName } } : undefined,
        orderBy: { timestamp: "asc" },
        include: { payer: { select: { name: true } } },
    });

    // create a local record of payers
    // this is to save on database calls
    const payers: Record<string, Payer & { originalBalance: number }> = {};
    const dbPayers = await prisma.payer.findMany({
        // if payerName is specified, only include that payer
        where: payerName ? { name: payerName } : undefined,
    });
    for (const payer of dbPayers) {
        const withOriginalBalance = payer as Payer & { originalBalance: number };
        withOriginalBalance.originalBalance = payer.balance;

        payers[payer.name] = withOriginalBalance;
    }

    // create a list of transactions to be deleted
    const transactionDeleteQueue: Prisma.PrismaPromise<any>[] = [];

    let pointsRemaining = points;
    for (const transaction of transactions) {
        // do we have to delete a transaction? or only subtract pointsRemaining in the transaction
        if (transaction.points <= pointsRemaining) {
            // queue the transaction to be deleted
            transactionDeleteQueue.push(
                prisma.transaction.delete({ where: { id: transaction.id } })
            );

            // update payers record
            pointsRemaining -= transaction.points;
            payers[transaction.payer.name].balance -= transaction.points;

            // transaction.points could equal pointsRemaining, in which case we are done
            if (pointsRemaining == 0) break;
        } else {
            // subtract the remaining points from the transaction's points
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: { points: transaction.points - pointsRemaining },
            });

            // update payers record
            payers[transaction.payer.name].balance -= pointsRemaining;
            pointsRemaining = 0;

            break;
        }
    }

    if (pointsRemaining != 0) throw new NotEnoughPointsError("not enough points");

    // delete the transactions
    // prisma.$transaction() function name is a coincidence with the model name
    await prisma.$transaction(transactionDeleteQueue);

    // update the payers and craft the return value
    const result = [];
    const payerUpdates: Prisma.PrismaPromise<any>[] = [];

    for (const payerName in payers) {
        // only payers whose balances were changed are relevant
        if (payers[payerName].balance != payers[payerName].originalBalance) {
            // update in database
            payerUpdates.push(
                prisma.payer.update({
                    where: { id: payers[payerName].id },
                    data: { balance: payers[payerName].balance },
                })
            );

            // add to result
            result.push({
                payer: payerName,
                points: payers[payerName].balance - payers[payerName].originalBalance,
            });
        }
    }

    await prisma.$transaction(payerUpdates);
    return result;
}

/**
 * Fetches a payer from the database, and if they don't exist, create one with the given name.
 * @param name name of payer
 * @returns the payer object
 */
async function getOrCreatePayer(name: string): Promise<Payer> {
    const existingPayer = await prisma.payer.findUnique({ where: { name } });

    if (existingPayer) return existingPayer;

    return await prisma.payer.create({ data: { name, balance: 0 } });
}

/**
 * Testing method to reset transactions and payers.
 */
export async function resetDb() {
    await prisma.transaction.deleteMany();
    await prisma.payer.deleteMany();
}

export class NotEnoughPointsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NotEnoughPointsError";
    }
}
