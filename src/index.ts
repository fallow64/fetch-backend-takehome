import { Elysia, t } from "elysia";
import { createTransaction, getBalances, resetDb, spend } from "./db";

const app = new Elysia()
    .post(
        "/add",
        async ({ body, set }) => {
            // if points are negative, assume that it is being "spent".
            if (body.points > 0) {
                createTransaction(body.payer, body.points, body.timestamp);
            } else if (body.points < 0) {
                spend(-body.points, body.payer);
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
        async ({ body }) => {
            return await spend(body.points);
        },
        {
            body: t.Object({
                points: t.Integer(),
            }),
        }
    )
    .delete("/delete", async () => {
        await resetDb();
    })
    .onError(({ code, error, set }) => {
        // without this, any data validation errors in the body
        // would be long and verbose
        console.log(error, error.message);
        if (code === "VALIDATION") {
            set.status = 400;
            return "400 Bad Request";
        }
    })
    .onStart((app) => {
        console.log(`Server started at: ${app.server?.url}`);
    })
    .listen(process.env.PORT ?? 8000);
