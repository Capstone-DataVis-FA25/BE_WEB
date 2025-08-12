import * as fs from "fs";
import * as path from "path";

// Load RSA keys from secure folder
export const access_token_private_key = fs.readFileSync(
  path.join(process.cwd(), "secure", "access_token_private.key"),
  "utf8"
);

export const access_token_public_key = fs.readFileSync(
  path.join(process.cwd(), "secure", "access_token_public.key"),
  "utf8"
);

export const refresh_token_private_key = fs.readFileSync(
  path.join(process.cwd(), "secure", "refresh_token_private.key"),
  "utf8"
);

export const refresh_token_public_key = fs.readFileSync(
  path.join(process.cwd(), "secure", "refresh_token_public.key"),
  "utf8"
);
