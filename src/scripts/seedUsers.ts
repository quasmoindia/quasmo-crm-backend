import { User } from '../models/User.js';

/** Default users to seed when DB has no users. Passwords are hashed by User model on create. */
const DEFAULT_USERS = [
  {
    fullName: 'Admin User',
    email: 'admin@example.com',
    password: 'admin123',
    role: 'admin',
  },
  {
    fullName: 'Test User',
    email: 'user@example.com',
    password: 'user123',
    role: 'user',
  },
];

export async function seedUsersIfNeeded(): Promise<void> {
  const count = await User.countDocuments();
  if (count > 0) return;
  for (const u of DEFAULT_USERS) {
    await User.create(u);
  }
  console.log('Seeded default users:', DEFAULT_USERS.map((u) => u.email).join(', '));
}
