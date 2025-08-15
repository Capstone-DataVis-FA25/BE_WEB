import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';

const api_documentation_credentials = {
	name: process.env.SWAGGER_ACCOUNT_NAME,
	pass: process.env.SWAGGER_ACCOUNT_PASS,
};

export function configSwagger(app: INestApplication) {
	const config = new DocumentBuilder()
		.setTitle('Data Vis project')
		.setDescription('## The Data Vis API description')
		.setVersion('1.0')
		.addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
		.build();
		
	const document = SwaggerModule.createDocument(app, config);

	const http_adapter = app.getHttpAdapter();
	http_adapter.use(
		'/api-docs',
		(req: Request, res: Response, next: NextFunction) => {
			function parseAuthHeader(input: string): { name: string; pass: string } {
				const [, encodedPart] = input.split(' ');

				const buff = Buffer.from(encodedPart, 'base64');
				const text = buff.toString('ascii');
				const [name, pass] = text.split(':');

				return { name, pass };
			}

			function unauthorizedResponse(): void {
				if (http_adapter.getType() === 'fastify') {
					res.statusCode = 401;
					res.setHeader('WWW-Authenticate', 'Basic');
				} else {
					res.status(401);
					res.set('WWW-Authenticate', 'Basic');
				}

				next();
			}

			if (!req.headers.authorization) {
				return unauthorizedResponse();
			}

			const credentials = parseAuthHeader(req.headers.authorization);

			if (
				credentials?.name !== api_documentation_credentials.name ||
				credentials?.pass !== api_documentation_credentials.pass
			) {
				return unauthorizedResponse();
			}

			next();
		},
	);
	SwaggerModule.setup('api-docs', app, document, {
		swaggerOptions: { persistAuthorization: true },
		customSiteTitle: 'Data Vis Documentation',
		customfavIcon: '/swagger.ico',
	});
}
