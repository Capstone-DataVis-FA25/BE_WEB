import { MailerService } from "@nestjs-modules/mailer";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class EmailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService
  ) {}

  async sendEmailVerification(email: string, token: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: "Xác thực tài khoản DataVis",
      template: "verify-email.hbs",
      context: {
        link: `${this.configService.get("API_URL")}/auth/verify-email?token=${token}`,
      },
    });
  }
}
