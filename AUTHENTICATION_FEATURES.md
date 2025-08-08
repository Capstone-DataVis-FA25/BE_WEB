# API Authentication & Authorization Features

## Các tính năng mới đã thêm:

### 1. Role-based Access Control
- **Admin Role**: Có quyền truy cập đặc biệt
- **User Role**: Quyền truy cập cơ bản

### 2. Admin-only Endpoints

#### Deactivate User Account
```http
PATCH /auth/unactive/:id
Authorization: Bearer {access_token}
```
- **Yêu cầu**: Admin role
- **Chức năng**: Deactivate user account và xóa refresh token
- **Response**: Success message

#### Admin Sign Out User
```http
POST /auth/signout/:id
Authorization: Bearer {access_token}
```
- **Yêu cầu**: Admin role  
- **Chức năng**: Sign out user bất kỳ (xóa refresh token)
- **Response**: Success message

#### Delete User (Admin only)
```http
DELETE /users/:id
Authorization: Bearer {access_token}
```
- **Yêu cầu**: Admin role
- **Chức năng**: Xóa hoàn toàn user khỏi hệ thống
- **Response**: User deleted successfully

### 3. Access Token Verification
Tất cả các endpoint được bảo vệ sẽ:
1. **Verify access token** - Kiểm tra tính hợp lệ của token
2. **Check user role** - Xác minh quyền truy cập
3. **Decode user information** từ token

### 4. Guards đã implement:
- `JwtAccessTokenGuard`: Xác thực access token
- `RolesGuard`: Kiểm tra role permission
- Combined guards: `@UseGuards(JwtAccessTokenGuard, RolesGuard)`

### 5. Decorators:
- `@Roles(UserRole.ADMIN)`: Chỉ admin mới truy cập được
- `@ApiBearerAuth()`: Yêu cầu Bearer token

## Cách test:

### 1. Tạo admin user:
```typescript
// Trong database hoặc qua API với role: "ADMIN"
{
  "email": "admin@example.com",
  "password": "password123",
  "role": "ADMIN"
}
```

### 2. Login để lấy access token:
```http
POST /auth/signin
{
  "email": "admin@example.com", 
  "password": "password123"
}
```

### 3. Sử dụng token để truy cập admin endpoints:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Error Responses:

### 401 Unauthorized:
- Token không hợp lệ hoặc hết hạn
- User chưa đăng nhập

### 403 Forbidden:
- Không có quyền truy cập (thiếu admin role)
- "Insufficient permissions"

### 404 Not Found:
- User không tồn tại khi deactivate/delete
