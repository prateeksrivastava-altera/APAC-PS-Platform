import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import config from "../config.js";

const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${config.azure.tenantId}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000,
});

async function getSigningKey(header) {
  const key = await client.getSigningKey(header.kid);
  return key.getPublicKey();
}

export async function verifyToken(token) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new Error("Invalid token format");
  const signingKey = await getSigningKey(decoded.header);
  return jwt.verify(token, signingKey, {
    audience: `api://${config.azure.clientId}`,
    issuer: [
      `https://sts.windows.net/${config.azure.tenantId}/`,
      `https://login.microsoftonline.com/${config.azure.tenantId}/v2.0`,
    ],
  });
}
