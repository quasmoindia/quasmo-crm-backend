# Bulk complaint data

## Sample file

`complaints-bulk-sample.json` contains **20 sample complaints** for testing the bulk create API. Each item includes subject, description, priority, product model, serial number, and order reference (microscope support style).

## Bulk create API

**Endpoint:** `POST /api/complaints/bulk`  
**Auth:** Bearer token required (same as other complaint routes).

**Request body:**

```json
{
  "complaints": [
    {
      "subject": "Required short title",
      "description": "Required detailed description",
      "priority": "low | medium | high",
      "productModel": "Optional e.g. X200",
      "serialNumber": "Optional",
      "orderReference": "Optional"
    }
  ]
}
```

- `subject` and `description` are required for each item; others are optional.
- Maximum **100** complaints per request.
- Invalid items (missing subject/description) are skipped; at least one valid item is required.

**Response (201):**

```json
{
  "message": "20 complaint(s) created",
  "created": 20,
  "data": [ /* created complaint objects with user populated */ ]
}
```

## Test with curl

From the project root, with the backend running and a valid token:

```bash
# Replace YOUR_JWT_TOKEN with a token from login/signup
curl -X POST http://localhost:8000/api/complaints/bulk \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @backend/data/complaints-bulk-sample.json
```

Or from inside the `backend` folder:

```bash
curl -X POST http://localhost:8000/api/complaints/bulk \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @data/complaints-bulk-sample.json
```
