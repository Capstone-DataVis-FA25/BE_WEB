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

async function bootstrap() {
  const logger = new Logger(bootstrap.name);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: "*",
  });
  configSwagger(app);
  const config_service = app.get(ConfigService);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          message: "Validation failed",
          details: errors
            .map((error) =>
              error.constraints ? Object.values(error.constraints) : []
            )
            .flat(),
        }),
    })
  );
  const port = process.env.PORT || config_service.get("PORT") || 4000;
  app.useGlobalInterceptors(
    new ResponseInterceptor(),
    new LoggingInterceptor()
  );
  // Increased payload limits to match application requirements
  app.use(json({ limit: "15mb" }));
  app.use(urlencoded({ extended: true, limit: "15mb" }));

  await app.listen(port, () =>
    logger.log(`🚀 Server running on: http://localhost:${port}/api-docs`)
  );
}
bootstrap();
