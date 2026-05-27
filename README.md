# EV Speare Inbound Customer App

Dedicated retail-style app for inbound customers created from the central panel.

## Features

- Login ID and password are issued in Central Panel with role `Inbound Customer`.
- Live warehouse product catalog with server-enforced 20% discounted pricing.
- Cart, delivery address, payment method/reference and order placement.
- Order history and downloadable invoice receipt.
- Orders are marked `inbound_customer` and use local warehouse fulfilment only; no Shiprocket order is created.

## Run

```bash
npm start
```

Set the deployed warehouse API:

```text
WAREHOUSE_API_URL=https://your-warehouse-backend.example/api
```

The warehouse backend must allow the app origin through `API_ALLOWED_ORIGINS` (or Railway origins in the existing production configuration).
