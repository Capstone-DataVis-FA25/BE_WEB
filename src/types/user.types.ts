export type User = {
  id: string;
  email: string;
  password: string;
  firstName: string | null;
  lastName: string | null;
  role: "USER" | "ADMIN";
  isActive: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  currentHashedRefreshToken: string | null;
};

export type UserWithoutPassword = Omit<
  User,
  "password" | "currentHashedRefreshToken"
>;