# Dukani API Examples

## Seed full demo data
`POST /api/dev/seed`

## Create shop
`POST /api/dashboard/shops`
```json
{ "name": "CBD Branch", "subscription_plan": "online" }
```

## Assign one shopkeeper to shop
`POST /api/dashboard/shops/{shop_id}/assign/{staff_id}`

## Bulk assign shopkeepers
`POST /api/dashboard/shops/{shop_id}/assignments/bulk`
```json
{ "staff_ids": ["keeper-id-1", "keeper-id-2"] }
```

## View shop allocations
`GET /api/dashboard/shops/{shop_id}/assignments`

## POS checkout with tax + discount + payment method
`POST /api/orders/checkout`
```json
{
  "shop_id": "shop-123",
  "items": [{"product_id": "prod-1", "qty": 2}],
  "payment_provider": "M-Pesa",
  "payment_method": "cash",
  "tax_percent": 16,
  "discount": 5,
  "idempotency_key": "idem-pos-100"
}
```

## Customer checkout on credit
`POST /api/customer/checkout`
```json
{
  "idempotency_key": "idem-credit-100",
  "payment_provider": "Ledger",
  "payment_method": "credit"
}
```


## Refresh token
`POST /api/auth/refresh`
```json
{ "refresh_token": "<token>" }
```

## Idempotent customer checkout (header)
`POST /api/customer/checkout`
Header:
`Idempotency-Key: checkout-123`
```
```
