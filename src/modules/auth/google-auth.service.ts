import { Injectable, UnauthorizedException } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../users/users.service";
import { UserRole } from "../users/dto/create-user.dto";

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

  async findOrCreateGoogleUser(googlePayload: any) {
    const {
      email,
      given_name,
      family_name,
      picture,
      sub: googleId,
    } = googlePayload;

    // Check if user exists by email
    let user = await this.usersService.findByEmail(email);

    if (!user) {
      // Create new user with Google data
      user = await this.usersService.create({
        email,
        firstName: given_name || "",
        lastName: family_name || "",
        password: Math.random().toString(36) + Date.now().toString(36), // Random password for Google users
        role: UserRole.USER,
      });
    }

    return user;
  }
}
