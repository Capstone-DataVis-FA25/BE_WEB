import { Injectable, UnauthorizedException } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../users/users.service";
import { UserRole } from "../users/dto/create-user.dto";
import { User } from "../../types/user.types";

@Injectable()
export class GoogleAuthService {
  private googleClient: OAuth2Client;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>("GOOGLE_CLIENT_ID")
    );
  }

  async verifyGoogleToken(idToken: string) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.configService.get<string>("GOOGLE_CLIENT_ID"),
      });

      const payload = ticket.getPayload();
      return payload;
    } catch (error) {
      throw new UnauthorizedException("Invalid Google token");
    }
  }

  async findOrCreateGoogleUser(googlePayload: any): Promise<User> {
    const { email, given_name, family_name, sub: googleId } = googlePayload;

    let user = await this.usersService.findByEmail(email);

    if (user) {
      if (user.isVerified === false) {
        // Overwrite unverified user with Google account
        await this.usersService.remove(user.id);

        const created = await this.usersService.create({
          email,
          firstName: given_name || "",
          lastName: family_name || "",
          role: UserRole.USER,
          isVerified: true,
        });

        return created;
      }

      // Already verified -> keep existing account
      return user;
    }

    // No user -> create new
    const created = await this.usersService.create({
      email,
      firstName: given_name || "",
      lastName: family_name || "",
      role: UserRole.USER,
      isVerified: true,
    });

    return created;
  }
}
