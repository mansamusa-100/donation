# Admin User System Implementation

Complete authentication and admin role-based access control system for GambiaFund donation platform.

## 🎯 Overview

The system implements JWT-based authentication with two user roles:
- **ADMIN** - Can approve/reject campaigns, manage users, view all data
- **USER** - Can create campaigns (pending approval), donate

## 📋 Credentials

### Admin Account
```
Email: admin@gambiafund.com
Password: admin@123
Role: ADMIN
```

### Test User Account
```
Email: user@gambiafund.com
Password: user@123
Role: USER
```

## 🗄️ Database Schema

### User Model
```prisma
model User {
  id              String    @id @default(cuid())
  email           String    @unique
  password        String    (hashed with bcryptjs)
  fullName        String
  phoneNumber     String?
  role            UserRole  (ADMIN or USER)
  isActive        Boolean   @default(true)
  campaigns       Campaign[]
  donations       Donation[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

### Campaign Model Updates
- Added `creatorId` - Links campaign to User
- Added `creator` relation
- Campaigns now track who created them

### Donation Model Updates
- Added `userId` - Links donation to User
- Added `user` relation
- Anonymous donations still supported (userId can be null)

## 🔐 Authentication Routes

### POST `/api/auth/register`
Create a new user account.

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "securepassword",
  "fullName": "John Doe",
  "phoneNumber": "+220123456789"
}
```

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "email": "newuser@example.com",
    "fullName": "John Doe",
    "role": "USER"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Status Codes:**
- `201` - User created successfully
- `409` - Email already exists
- `400` - Validation error

---

### POST `/api/auth/login`
Authenticate and get JWT token.

**Request:**
```json
{
  "email": "admin@gambiafund.com",
  "password": "admin@123"
}
```

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "email": "admin@gambiafund.com",
    "fullName": "Admin User",
    "role": "ADMIN"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Status Codes:**
- `200` - Login successful
- `401` - Invalid credentials or inactive account
- `400` - Validation error

---

### GET `/api/auth/me`
Get current authenticated user profile.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "user_id",
  "email": "admin@gambiafund.com",
  "fullName": "Admin User",
  "phoneNumber": "+220123456789",
  "role": "ADMIN",
  "isActive": true,
  "createdAt": "2026-04-17T21:01:17.123Z"
}
```

**Status Codes:**
- `200` - User found
- `401` - Unauthenticated
- `404` - User not found

---

## 👨‍💼 Admin Routes

All admin routes require:
1. Valid JWT token in `Authorization: Bearer <token>` header
2. User must have `ADMIN` role

### GET `/api/admin/campaigns/pending`
List all campaigns awaiting approval.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response:**
```json
[
  {
    "id": "campaign_id",
    "title": "Medical Campaign",
    "status": "PendingReview",
    "goalAmount": 10000,
    "raisedAmount": 2500,
    "donorCount": 25,
    "createdAt": "2026-04-17T20:00:00Z",
    "creator": {
      "id": "user_id",
      "fullName": "Campaign Creator",
      "email": "creator@example.com",
      "phoneNumber": "+220123456789"
    },
    "donations": []
  }
]
```

---

### GET `/api/admin/campaigns`
List all campaigns (admin view with full details).

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response:** Array of campaigns with creator info

---

### PATCH `/api/admin/campaigns/:campaignId/status`
Approve, reject, or close a campaign.

**Headers:**
```
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Request:**
```json
{
  "status": "Active"
}
```

**Valid statuses:**
- `Active` - Approve campaign (goes live)
- `Rejected` - Reject campaign
- `Closed` - Close active campaign

**Response:**
```json
{
  "message": "Campaign active",
  "campaign": {
    "id": "campaign_id",
    "title": "Medical Campaign",
    "status": "Active",
    ...
  }
}
```

**Status Codes:**
- `200` - Campaign updated
- `403` - Admin access required
- `404` - Campaign not found

---

### GET `/api/admin/users`
List all users with statistics.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response:**
```json
[
  {
    "id": "user_id",
    "email": "admin@gambiafund.com",
    "fullName": "Admin User",
    "phoneNumber": "+220123456789",
    "role": "ADMIN",
    "isActive": true,
    "createdAt": "2026-04-17T20:00:00Z",
    "_count": {
      "campaigns": 5,
      "donations": 42
    }
  }
]
```

---

### PATCH `/api/admin/users/:userId/status`
Activate or deactivate a user account.

**Headers:**
```
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Request:**
```json
{
  "isActive": false
}
```

**Response:**
```json
{
  "message": "User deactivated",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "fullName": "User Name",
    "isActive": false,
    "role": "USER"
  }
}
```

**Status Codes:**
- `200` - User status updated
- `400` - Cannot deactivate own account
- `403` - Admin access required
- `404` - User not found

---

### GET `/api/admin/stats`
Get admin dashboard statistics.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "campaigns": {
    "total": 42,
    "active": 35,
    "pending": 7
  },
  "users": {
    "total": 156,
    "admins": 2
  },
  "donations": 892,
  "platformStats": {
    "id": "platform",
    "totalRaised": 5000000,
    "campaignsFunded": 32,
    "totalDonors": 1250,
    "communitiesHelped": 45,
    "updatedAt": "2026-04-17T21:10:00Z"
  }
}
```

---

## 📊 Campaign Routes Updates

### POST `/api/campaigns`
Create a new campaign.

**Behavior:**
- **Authenticated ADMIN user** → Campaign is `Active` (auto-approved)
- **Regular/Unauthenticated user** → Campaign is `PendingReview` (needs approval)

**Request:**
```json
{
  "title": "Medical Treatment Campaign",
  "creatorName": "Ahmed Hassan",
  "category": "Medical",
  "shortDescription": "Help fund my medical treatment",
  "fullDescription": "Detailed medical campaign description...",
  "goalAmount": 50000,
  "daysLeft": 90,
  "coverImage": "https://example.com/image.jpg",
  "creatorAvatar": "https://example.com/avatar.jpg"
}
```

**Response:**
- Admin: Campaign with `"status": "Active"`
- Regular user: Campaign with `"status": "PendingReview"`

---

## 🔄 Campaign Workflow

### Regular User Flow
```
1. User registers/logs in
2. User creates campaign
3. Campaign goes to "PendingReview"
4. Admin reviews campaign
5. Admin approves → Campaign becomes "Active"
6. Campaign is visible to donors
```

### Admin Flow
```
1. Admin logs in
2. Admin creates campaign
3. Campaign is immediately "Active"
4. Campaign is visible to donors right away
```

---

## 🛡️ Security Features

1. **Password Hashing**
   - bcryptjs with 10 salt rounds
   - Passwords never stored in plain text

2. **JWT Tokens**
   - Expires in 7 days
   - Contains only userId (role fetched from DB on each request)
   - Signed with JWT_SECRET

3. **Role-Based Access Control**
   - Admin middleware checks user role on every admin request
   - Middleware fetches latest role from database

4. **Account Status**
   - Admin can deactivate users
   - Inactive users cannot log in
   - Cannot deactivate own account

---

## 🚀 Starting the Backend

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Run migrations (already done)
npm run prisma:migrate

# Seed database (already done)
npm run seed

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

Backend will run on `http://localhost:4000`

---

## 🧪 Testing with cURL

### Register New User
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123",
    "fullName": "Test User",
    "phoneNumber": "+220123456789"
  }'
```

### Admin Login
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@gambiafund.com",
    "password": "admin@123"
  }'
```

### Get Pending Campaigns (Admin)
```bash
curl http://localhost:4000/api/admin/campaigns/pending \
  -H "Authorization: Bearer <token>"
```

### Approve Campaign (Admin)
```bash
curl -X PATCH http://localhost:4000/api/admin/campaigns/<campaign_id>/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "status": "Active"
  }'
```

---

## 📁 Files Created/Modified

### Created Files
- `backend/src/lib/auth.ts` - Authentication utilities and middleware
- `backend/src/routes/auth.ts` - Authentication endpoints
- `backend/src/routes/admin.ts` - Admin endpoints

### Modified Files
- `backend/prisma/schema.prisma` - Added User model and relations
- `backend/src/app.ts` - Registered auth and admin routes
- `backend/src/routes/campaigns.ts` - Added authentication logic
- `backend/src/config/env.ts` - Added JWT_SECRET
- `backend/package.json` - Added bcryptjs, jsonwebtoken
- `backend/prisma/seed.ts` - Create admin and test users

---

## 🔑 Environment Variables

```env
DATABASE_URL="postgresql://postgres:admin@localhost:5432/gambiafund?schema=public"
PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
JWT_SECRET="your-secret-key-change-in-production"
```

**Change `JWT_SECRET` in production!**

---

## 🎓 Admin Features

| Feature | Regular User | Admin |
|---------|-------------|-------|
| Create campaigns | ✅ (Pending) | ✅ (Active) |
| Approve campaigns | ❌ | ✅ |
| Reject campaigns | ❌ | ✅ |
| View own campaigns | ✅ | ✅ |
| View all campaigns | ❌ | ✅ |
| Delete campaigns | ❌ | ✅ |
| View all users | ❌ | ✅ |
| Deactivate users | ❌ | ✅ |
| View platform stats | Limited | ✅ Full |
| Access admin panel | ❌ | ✅ |

---

## ⚠️ Common Issues

### "Invalid token" error
- Ensure token is included in `Authorization: Bearer <token>` header
- Token expires after 7 days
- Get new token by logging in again

### "Admin access required" error
- User account must have `role: "ADMIN"`
- Only admins can access `/api/admin/*` routes

### "Email already exists" error
- Email must be unique
- Try with different email or check if user exists

### Database connection failed
- Ensure PostgreSQL is running
- Check DATABASE_URL in .env
- Verify database exists: `gambiafund`

---

## 📖 Next Steps

1. **Create admin dashboard UI** - Frontend for campaign approval
2. **Add email notifications** - Notify admins of new campaigns
3. **Implement refresh tokens** - For better security
4. **Add password reset** - Forgot password functionality
5. **Create admin audit log** - Track admin actions
6. **Add two-factor authentication** - Enhanced security

---

## 📞 Support

For issues or questions about the admin system, refer to:
- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Guide](https://expressjs.com/)
- [JWT.io](https://jwt.io/)
- [bcryptjs](https://www.npmjs.com/package/bcryptjs)
