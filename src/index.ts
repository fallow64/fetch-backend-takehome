import { Elysia, t } from "elysia";
import { createTransaction, getBalances, NotEnoughPointsError, resetDb, spend } from "./db";

new Elysia()
    .onStart((app) => {
        console.log(`Server started at: ${app.server?.url}`);
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
                createTransaction(body.payer, body.points, body.timestamp);
            } else if (body.points < 0) {
                try {
                    spend(-body.points, body.payer);
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
            }
        },
        {
            body: t.Object({
                payer: t.String(),
                points: t.Integer(),
                timestamp: t.Date(),
            }),
        }
    )
    .get("/balance", async () => {
        return await getBalances();
    })
    .post(
        "/spend",
        async ({ body, set }) => {
            try {
                return await spend(body.points);
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
        },
        {
            body: t.Object({
                points: t.Integer({ minimum: 1 }),
            }),
        }
    )
    .delete("/reset", async () => {
        await resetDb();
    })
    .listen(process.env.PORT ?? 8000);
