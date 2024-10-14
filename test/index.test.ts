import { describe, expect, test } from "bun:test";
import { app } from "../src";
import { createTransaction, resetDb } from "../src/db";

// All of these tests reset the database - not optimal for production, lol

describe("web", async () => {
    test("POST /add - normal", async () => {
        await resetDb();

        const res = await app.handle(
            makeRequest("add", "POST", {
                payer: "Fetch",
                points: 500,
                timestamp: new Date().toString(),
            }),
        );

        const body = await res.text();
        expect(res.status).toBe(200);
        expect(body).toBe("");
    });

    test("POST /add - negative", async () => {
        await resetDb();

        const res = await app.handle(
            makeRequest("add", "POST", {
                payer: "Fetch",
                points: -500,
                timestamp: new Date().toString(),
            }),
        );

        const body = await res.text();
        expect(res.status).toBe(400);
        expect(body).toBe("Not Enough Points");
    });

    test("POST /add - zero", async () => {
        await resetDb();

        const res = await app.handle(
            makeRequest("add", "POST", {
                payer: "Fetch",
                points: 0,
                timestamp: new Date().toString(),
            }),
        );

        const body = await res.text();
        expect(res.status).toBe(400);
        expect(body).toBe("Bad Request");
    });

    test("GET /balance", async () => {
        await resetDb();
        await createTransaction("Fetch", 500, new Date());

        const res = await app.handle(makeRequest("balance", "GET"));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ Fetch: 500 });
    });

    test("POST /spend", async () => {
        // this test won't cover all test cases - the handler function is just a wrapper around spend(),
        // and the intricacies are tested more extensively in db.test.ts
        await resetDb();
        await createTransaction("Fetch", 1000, new Date());

        const res = await app.handle(
            makeRequest("spend", "POST", {
                points: 500,
            }),
        );
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject([
            {
                payer: "Fetch",
                points: -500,
            },
        ]);
    });
});

function makeRequest(endpoint: string, method: "POST" | "GET", body?: {}): Request {
    const port = process.env.PORT ?? 8000;
    return new Request(`http://localhost:${port}/${endpoint}`, {
        method,
        headers: {
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}
