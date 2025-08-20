export type User = {
  id: string;
  email: string;
  password: string | null;
  firstName: string | null;
  lastName: string | null;
  role: "USER" | "ADMIN";
  isActive: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  currentVerifyToken: string | null;
  currentHashedRefreshToken: string | null;
};

export type UserWithoutPassword = Omit<
  User,
  "password" | "currentHashedRefreshToken" | "currentVerifyToken"
>;
