import { MailerService } from "@nestjs-modules/mailer";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class EmailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService
  ) {}

  async sendResetPasswordEmail(email: string, resetToken: string) {
    const resetUrl = `${process.env.CLIENT_URL}/auth/reset-password?token=${resetToken}`;

    const mailOptions = {
      to: email,
      subject: "Reset Password Request",
      template: "reset-password",
      context: {
        resetUrl,
        email,
      },
    };

    try {
      await this.mailerService.sendMail(mailOptions);
      console.log("Reset password email sent successfully");
    } catch (error) {
      console.error("Error sending reset password email:", error);
      throw new Error("Failed to send reset password email");
    }
  }

  async sendEmailVerification(email: string, token: string) {
    const verifyUrl = `${this.configService.get("API_URL")}/auth/verify-email?token=${token}`;
    await this.mailerService.sendMail({
      to: email,
      subject: "Xác thực tài khoản DataVis",
      template: "verify-email.hbs",
      context: {
        link: verifyUrl,
      },
    });
  }
}
