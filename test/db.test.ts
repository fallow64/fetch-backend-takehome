import { describe, expect, test } from "bun:test";
import {
    createTransaction,
    getBalances,
    NotEnoughPointsError,
    prisma,
    resetDb,
    spend,
} from "../src/db";

describe("db", async () => {
    test("createTransaction - normal", async () => {
        await resetDb();
        const today = new Date();

        const transaction = await createTransaction("Fetch", 500, today);
        expect(transaction).toMatchObject({ points: 500, timestamp: today });

        const balances = await getBalances();
        expect(await getBalances()).toMatchObject({ Fetch: 500 });
    });

    test("createTransaction - errors", async () => {
        await resetDb();
        const today = new Date();

        expect(async () => await createTransaction("Fetch", -500, today)).toThrow(RangeError);
        expect(async () => await createTransaction("Fetch", 0.5, today)).toThrow(RangeError);
    });

    test("getBalances", async () => {
        await resetDb();
        const today = new Date();

        await createTransaction("Fetch", 500, today);
        await createTransaction("Madison", 1000, today);

        const balances = await getBalances();
        expect(balances).toMatchObject({ Fetch: 500, Madison: 1000 });
    });

    test("spend - normal", async () => {
        await resetDb();
        const yesterday = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
        const today = new Date();

        await createTransaction("Fetch", 500, yesterday);
        await createTransaction("Madison", 1000, today);

        const result = await spend(800);
        expect(result).toMatchObject([
            { payer: "Fetch", points: -500 },
            { payer: "Madison", points: -300 },
        ]);
    });

    test("spend - exact", async () => {
        await resetDb();
        const today = new Date();

        await createTransaction("Fetch", 500, today);

        const result = await spend(500);
        expect(result).toMatchObject([{ payer: "Fetch", points: -500 }]);
        expect((await prisma.transaction.findMany()).length).toBe(0);
        expect(await getBalances()).toMatchObject({ Fetch: 0 });
    });

    test("spend - with payer specified", async () => {
        await resetDb();
        const yesterday = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
        const today = new Date();

        await createTransaction("Madison", 1000, yesterday);
        await createTransaction("Fetch", 2000, today);

        const result = await spend(500, "Fetch");
        expect(result).toMatchObject([{ payer: "Fetch", points: -500 }]);
        expect(await getBalances()).toMatchObject({ Madison: 1000, Fetch: 1500 });
    });

    test("spend - not enough points", async () => {
        await resetDb();
        const yesterday = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
        const today = new Date();

        await createTransaction("Fetch", 500, yesterday);
        await createTransaction("Madison", 1000, today);

        expect(async () => await spend(2000)).toThrow(NotEnoughPointsError);
    });

    test("spend - invalid arguments", async () => {
        await resetDb();
        const today = new Date();

        expect(async () => await spend(-500)).toThrow(RangeError);
        expect(async () => await spend(0.5)).toThrow(RangeError);
    });
});
