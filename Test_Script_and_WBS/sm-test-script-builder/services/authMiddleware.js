import config from "../config.js";
import { verifyToken } from "./tokenService.js";

/**
 * JWT Bearer token middleware.
 * Validates the Authorization: Bearer <token> header using JWKS from Azure AD.
 */
export async function requireAuth(req, res, next) {
  // Skip auth when Azure AD is not configured (local development / running
  // behind the APAC shell). Prefer the upstream X-Forwarded-User header so
  // backend handlers see the actual signed-in user, not "Developer".
  if (!config.azure.clientId || !config.azure.tenantId) {
    const forwarded = (req.headers["x-forwarded-user"] || "").toString().trim();
    const name = forwarded || "Developer";
    // The APAC shell injects the real Azure identity it validated upstream.
    const oid = (req.headers["x-forwarded-oid"] || "").toString().trim();
    const email = (req.headers["x-forwarded-email"] || "").toString().trim();
    req.user = {
      oid,
      name,
      username: email || (forwarded ? `${forwarded}@local` : "dev@local"),
    };
    return next();
  }

  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const payload = await verifyToken(token);
    req.user = {
      oid: payload.oid || "",
      name: payload.name || "",
      username: payload.preferred_username || payload.upn || payload.email || "",
    };
    next();
  } catch (err) {
    console.error("Token validation failed:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
