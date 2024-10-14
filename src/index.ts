import { Elysia, t } from "elysia";
import { createTransaction, getBalances, NotEnoughPointsError, prisma, resetDb, spend } from "./db";

export const app = new Elysia()
    .onStart((app) => {
        console.log(`Server started at: ${app.server?.url}`);
    })

    .onStop(async () => {
        // disconnect from database
        await prisma.$disconnect();
    })

    .onError(({ code, set }) => {
        // without this, any data validation errors in the body
        // would be long and verbose

        if (code === "VALIDATION") {
            set.status = 400;
            return "Bad Request";
        } else if (code === "INTERNAL_SERVER_ERROR") {
            set.status = 500;
            return "Internal Server Error";
        }
    })

    .post(
        "/add",
        async ({ body, set }) => {
            // if points are negative, assume that it is being "spent".
            if (body.points > 0) {
                await createTransaction(body.payer, body.points, body.timestamp);
            } else if (body.points < 0) {
                const result = await trySpend(-body.points, set, body.payer);

                if (typeof result === "string") {
                    // error message
                    return result;
                }
            } else {
                // add 0 points, client error
                set.status = 400;
                return "Bad Request";
            }
        },
        {
            // request body schema
            body: t.Object({
                payer: t.String(),
                points: t.Integer(),
                timestamp: t.Date(),
            }),
        },
    )

    .get("/balance", async () => {
        return await getBalances();
    })

    .post(
        "/spend",
        async ({ body, set }) => {
            return await trySpend(body.points, set);
        },
        {
            // request body schema
            body: t.Object({
                points: t.Integer({ minimum: 1 }),
            }),
        },
    )

    // debugging route for easy testing
    .delete("/reset", async () => {
        await resetDb();
    })

    .listen(process.env.PORT ?? 8000);

/**
 * Attempts to spend a certain number of points, returning the appopriate response. Any errors will
 * use `set` to set the status code.
 *
 * @param points amount of points to spend
 * @param set the set object provided by Elysia, to use `set.status`
 * @param the payer, if any, to specifically deduct from
 * @returns the value to respond with
 */
async function trySpend(points: number, set: any, payer?: string): Promise<string | {}[]> {
    let result: {}[];
    try {
        result = await spend(points, payer);
    } catch (e: unknown) {
        if (e instanceof NotEnoughPointsError) {
            set.status = 400;
            return "Not enough points";
        } else {
            console.error(e);

            set.status = 500;
            return "Internal Server Error";
        }
    }

    return result;
}
