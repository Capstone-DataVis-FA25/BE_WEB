import { UserRole } from "@modules/users/dto/create-user.dto";

export interface TokenPayload {
	sub: string;
	email: string;
	role: UserRole;
}
