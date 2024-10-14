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
