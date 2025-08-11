import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailService {
	constructor(private readonly mailerService: MailerService) {}

	async sendEmailVerification(email: string, token: string) {
		await this.mailerService.sendMail({
			to: email,
			subject: 'Xác thực tài khoản Lingora',
			template: 'verify-email.hbs',
			context: {
				link: `https://lingora-fe.vercel.app/verify-email?token=${token}`,
			},
		});
	}

	async sendResetPassword(email: string, token: string) {
		await this.mailerService.sendMail({
			to: email,
			subject: 'Đặt lại mật khẩu Lingora',
			template: 'reset-password.hbs',
			context: {
				link: `https://lingora-fe.vercel.app/reset-password?token=${token}`,
			},
		});
	}

	async sendPaymentNotification(
		email: string,
		studentName: string,
		courseName: string,
		paymentLink: string,
		amount?: number,
		paymentMethod?: string,
	) {
		await this.mailerService.sendMail({
			to: email,
			subject: 'Thông báo thanh toán khóa học Lingora',
			template: 'payment-notification.hbs',
			context: {
				studentName,
				courseName,
				paymentLink,
				amount: amount ? amount.toLocaleString('vi-VN') : 'N/A',
				paymentMethod: paymentMethod || 'Chưa chọn',
			},
		});
	}

	/**
	 * Gửi email thông báo tài khoản cho giáo viên mới
	 */
	async sendTeacherAccountInfo(
		email: string,
		accountInfo: {
			fullName: string;
			loginEmail: string;
			password: string;
			notificationEmail: string;
		},
	) {
		await this.mailerService.sendMail({
			to: email,
			subject: 'Chào mừng bạn đến với Lingora - Thông tin tài khoản giáo viên',
			template: 'teacher-account-info.hbs',
			context: {
				fullName: accountInfo.fullName,
				loginEmail: accountInfo.loginEmail,
				password: accountInfo.password,
				notificationEmail: accountInfo.notificationEmail,
				loginUrl: 'https://lingora-fe.vercel.app/login',
				supportEmail: 'support@lingora.edu.vn',
			},
		});
	}

	async sendInviteTeacherToFillForm(email: string, formUrl: string) {
		await this.mailerService.sendMail({
			to: email,
			subject: 'Mời bạn trở thành giáo viên Lingora',
			template: 'invite-teacher-fill-form',
			context: { formUrl },
		});
	}
}
