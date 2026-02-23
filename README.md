# 🛡️ Tracknity - Backend API

The robust Node.js/Express backend powering the **Tracknity Equipment Tracking System**. It handles secure role-based authentication, real-time transaction processing, and data aggregation for dashboard analytics.

##  Tech Stack
* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** MongoDB (via Mongoose)
* **Authentication:** JSON Web Tokens (JWT) & bcryptjs
* **Deployment:** Render (or your preferred host)

##  Key Features
* **Role-Based Access Control (RBAC):** Distinct permissions for Students, IT Staff, Security Officers, and Admins.
* **Transaction Engine:** Handles checkouts, returns, penalty calculations, and reservation conflicts.
* **Analytics Aggregation:** Generates dynamic statistics and time-series data for frontend charts.
* **Audit Logging:** Tracks high-level system actions for accountability.

##  Getting Started

### 1. Clone the repository
\`\`\`bash
git clone https://github.com/yourusername/tracknity-backend.git
cd tracknity-backend
\`\`\`

### 2. Install dependencies
\`\`\`bash
npm install
\`\`\`

### 3. Environment Variables
Create a `.env` file in the root directory and add the following:
\`\`\`env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_super_secret_jwt_key
\`\`\`

### 4. Run the server
\`\`\`bash
# For development (auto-reloads on save)
npm run dev

# For production
npm start
\`\`\`
The server should now be running on `http://localhost:5000`.

---
