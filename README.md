# Fetch Backend Takehome Assessment

A back-end server to track customer points usage from various "payers". Code is structured into two files:

1. `src/index.ts` handles all web routing using [Elysia](https://elysiajs.com/).
2. `src/db.ts` handles the database using [Prisma](https://www.prisma.io/), and also handles core logic.

## Options

`.env` contains:

-   `DATABASE_URL`: The SQLite database connection string. It defaults to `file:./dev.db`. If the
    file does not exist, it will create it.

    Different database providers can be used by changing
    the datasource in `prisma/schema.prisma`.

-   `PORT`: The port to run the server on, defaulting to 8000 if not specified.

## How to Run

1. Install Bun from https://bun.sh/.
2. Run `bun dev` to start the dev server.

Unfortunately, Elysia, the back-end framework used, does **NOT** support standard Node.

## Testing

To run the unit tests, run `bun test`.

The tests assess the core logic as well as the web server itself.

# Endpoints

The term **transaction** will be used to refer to an element in a queue, with the oldest
transactions first. They are mutable!

## POST /add

Adds a transaction to the queue.

-   Request Body:
    ```
    {
        "payer": string,
        "points": int,
        "timestamp": Date,
    }
    ```
-   Response: `200` if points > 0.
    -   If points is negative, then `/add` will act like `/spend` but only acting on that
        individual payer. Includes all errors of `/spend`.
    -   If points is zero or non-integer, then the response will be `400 Bad Request`.

## GET /balance

Gets the balance of all the current payers.

-   Request Body: none
-   Response: `200` always, with JSON body of:

    ```
    {
        "payer1": 500,
        "payer2": 1000,
    }
    ```

## POST /spend

Spends a certain number of points, using the oldest payer's points first.

-   Request Body:

    ```
    {
        "points": int
    }
    ```

-   Response: `200` if no errors, with JSON body of:

    ```
    [
        {
            "payer": "payer1",
            "points": -500
        },
        {
            "payer": "payer2",
            "points": -1000
        }
    ]
    ```

    -   If there are not enough points, the response will be `400 Not Enough Points`.
    -   If `points` is less than 1 or a non-integer, the response will be `400 Bad Request`.
