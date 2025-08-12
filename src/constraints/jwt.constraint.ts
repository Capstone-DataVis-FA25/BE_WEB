import * as fs from "fs";
import * as path from "path";

// For HS256, use string secrets, not PEM keys
export const access_token_private_key = process.env.ACCESS_TOKEN_SECRET || 'your_random_access_secret';
export const refresh_token_private_key = process.env.REFRESH_TOKEN_SECRET || 'your_random_refresh_secret';
