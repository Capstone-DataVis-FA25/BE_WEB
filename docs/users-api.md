# Users API

## Lock/Unlock User (Admin only)

Allows administrators to lock or unlock a user account.

### Endpoint

```
PATCH /users/:id/lock-unlock
```

### Headers

```
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json
```

### Request Body

```json
{
  "isActive": false
}
```

### Parameters

- `id` (path parameter): The ID of the user to lock/unlock
- `isActive` (boolean):
  - `false` to lock the user (deactivate the account)
  - `true` to unlock the user (activate the account)

### Response

```json
{
  "id": "user-id",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "USER",
  "isActive": false,
  "isVerified": true,
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

### Example Usage

To lock a user:

```bash
curl -X PATCH \
  http://localhost:3000/users/user-id/lock-unlock \
  -H 'Authorization: Bearer your-admin-jwt-token' \
  -H 'Content-Type: application/json' \
  -d '{"isActive": false}'
```

To unlock a user:

```bash
curl -X PATCH \
  http://localhost:3000/users/user-id/lock-unlock \
  -H 'Authorization: Bearer your-admin-jwt-token' \
  -H 'Content-Type: application/json' \
  -d '{"isActive": true}'
```

### Error Responses

- `401 Unauthorized`: If the user is not authenticated
- `403 Forbidden`: If the user is not an administrator
- `404 Not Found`: If the user with the specified ID doesn't exist
