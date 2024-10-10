import { Payer, Prisma, PrismaClient, Transaction } from "@prisma/client";

export const prisma = new PrismaClient({
    // log: ["query", "info", "warn", "error"],
});

/**
 * Creates a transaction in the database, creating a payer if one with the name
 * doesn't exist, and also updating their points.
 *
 * @param payer the payer who the points are from
 * @param points amount of points to be added - should be an integer greater than 0
 * @param timestamp when the transaction took place
 * @returns the created transaction object
 */
export async function createTransaction(
    payer: string,
    points: number,
    timestamp: Date
): Promise<Transaction> {
    if (!Number.isInteger(points)) throw new Error("'points' not an integer");
    if (points <= 0) throw new Error("'points' should be greater than 0");

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
export async function getBalances(): Promise<{ [payer: string]: number }> {
    const payers = await prisma.payer.findMany({
        select: { name: true, balance: true },
    });

    const result: { [payer: string]: number } = {};
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
 * [{ "payer1": -10 }, { "payer2": -50 }]
 * ```
 *
 * @param points point to spend
 * @param payerName optional, specify which payer to spend points from
 * @returns array of payers and how many points were used, in the format above
 */
export async function spend(points: number, payerName?: string) {
    if (!Number.isInteger(points)) throw new Error("'points' must be an integer");
    if (points <= 0) throw new Error("'points' should be greater than 0");

    // get a list of transactions to consider
    const transactions = await prisma.transaction.findMany({
        // if there is a payerName specified, then only those transactions should be loaded
        where: payerName ? { payer: { name: payerName } } : undefined,
        orderBy: { timestamp: "asc" },
        include: { payer: { select: { name: true } } },
    });
    console.log(transactions);

    let pointsRemaining = points;

    // create a record of all relevant payer names and their information.
    // this is used to save on database calls for current balances, as well as keeping track of
    // points that were used
    type PayerRecord = Record<string, Payer & { originalBalance: number; pointsUsed: number }>;
    const payers: PayerRecord = (
        await prisma.payer.findMany({
            // once again, if payerName is specified, only include that payer
            where: payerName ? { name: payerName } : undefined,
        })
    ).reduce((result, payer) => {
        // turn an array into an object with the key of payer.name
        result[payer.name] = { ...payer, originalBalance: payer.balance, pointsUsed: 0 };
        return result;
    }, {} as PayerRecord);

    // create a list of transactions to be deleted
    const transactionDeleteQueue: Prisma.PrismaPromise<any>[] = [];

    for (let i = 0; i < transactions.length; i++) {
        const transaction = transactions[i];

        console.log(transaction.points, pointsRemaining);
        // do we have to delete a transaction? or only subtract pointsRemaining
        if (transaction.points <= pointsRemaining) {
            // queue the transaction to be deleted
            transactionDeleteQueue.push(
                prisma.transaction.delete({ where: { id: transaction.id } })
            );

            // update points remaining & payers record
            pointsRemaining -= transaction.points;
            payers[transaction.payer.name].pointsUsed -= transaction.points;
            payers[transaction.payer.name].balance -= transaction.points;

            // transaction.points could equal pointsRemaining, in which case we are done
            if (pointsRemaining == 0) break;
        } else {
            // subtract the remaining points from the transaction's points
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: { points: transaction.points - pointsRemaining },
            });

            // update points remaining & payers record
            payers[transaction.payer.name].pointsUsed -= pointsRemaining;
            payers[transaction.payer.name].balance -= pointsRemaining;
            pointsRemaining = 0;

            break;
        }
    }

    if (pointsRemaining != 0) throw new Error("not enough points to spend");

    // delete the transactions
    await prisma.$transaction(transactionDeleteQueue);

    // update the payers
    const payerUpdates: Prisma.PrismaPromise<any>[] = [];
    for (const payerName in payers) {
        // only queue updates of payers whose balance actually changed
        if (payers[payerName].balance != payers[payerName].originalBalance) {
            payerUpdates.push(
                prisma.payer.update({
                    where: { id: payers[payerName].id },
                    data: { balance: payers[payerName].balance },
                })
            );
        }
    }
    await prisma.$transaction(payerUpdates);

    // craft the final return value
    const result: { payer: string; points: number }[] = [];
    for (const payerName in payers) {
        // only include them in the result if any of their points were used
        if (payers[payerName].pointsUsed != 0) {
            result.push({ payer: payerName, points: payers[payerName].pointsUsed });
        }
    }
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

    const newPayer = await prisma.payer.create({ data: { name, balance: 0 } });
    return newPayer;
}

export async function resetDb() {
    await prisma.transaction.deleteMany();
    await prisma.payer.deleteMany();
}
