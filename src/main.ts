import { BadRequestException, Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configSwagger } from "@configs/api-docs.config";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationError } from "class-validator";
import { ResponseInterceptor } from "./interceptors/response.interceptor";
import { LoggingInterceptor } from "./interceptors/logging.interceptor";
import { json, urlencoded } from "express";
import { join } from "path";

async function bootstrap() {
	const logger = new Logger(bootstrap.name);
	const app = await NestFactory.create<NestExpressApplication>(AppModule);

	app.enableCors({
		origin: "*",
		methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
		allowedHeaders: "*",
	});

	// Serve static files from project root public directory
	app.useStaticAssets(join(process.cwd(), "public"));

	configSwagger(app);
	const config_service = app.get(ConfigService);

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			exceptionFactory: (errors: ValidationError[]) => {
				console.log("🚨 Validation errors:", JSON.stringify(errors, null, 2));
				const errorMessages = errors.map((error) =>
					error.constraints ? Object.values(error.constraints) : []
				).flat();
				return new BadRequestException({
					message: errorMessages.length > 0 ? errorMessages.join(", ") : "Validation failed",
					details: errorMessages,
					rawErrors: errors,
				});
			},
		})
	);

	const port = process.env.PORT || config_service.get("PORT") || 4000;

	// Combine both interceptors
	app.useGlobalInterceptors(new ResponseInterceptor(), new LoggingInterceptor());

	// Increased payload limits
	app.use(json({ limit: "50mb" }));
	app.use(urlencoded({ extended: true, limit: "50mb" }));

	await app.listen(port, () =>
		logger.log(`🚀 Server running on: http://localhost:${port}/api-docs`)
	);
}
bootstrap();