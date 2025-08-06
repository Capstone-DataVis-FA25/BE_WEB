export interface DatabaseConfig {
	url: string;
}

export const database_config = () => ({
	database: {
		url: process.env.DATABASE_URL,
	},
	jwt: {
		access_token_expiration_time: process.env.JWT_ACCESS_TOKEN_EXPIRATION_TIME,
		refresh_token_expiration_time: process.env.JWT_REFRESH_TOKEN_EXPIRATION_TIME,
	},
});
