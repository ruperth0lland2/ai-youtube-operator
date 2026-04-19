import type { RequestHandler, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 12;

function cookieName(): string {
  return env.DASHBOARD_SESSION_COOKIE;
}

function hash(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function safeEquals(a: string, b: string): boolean {
  const left = hash(a);
  const right = hash(b);
  return timingSafeEqual(left, right);
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }
  return header.split(";").reduce<Record<string, string>>((acc, pair) => {
    const [k, ...v] = pair.trim().split("=");
    if (!k) {
      return acc;
    }
    acc[decodeURIComponent(k)] = decodeURIComponent(v.join("="));
    return acc;
  }, {});
}

function setCookie(res: Response, value: string, maxAgeSeconds: number): void {
  res.setHeader(
    "Set-Cookie",
    `${cookieName()}=${encodeURIComponent(value)}; HttpOnly; Max-Age=${maxAgeSeconds}; Path=/dashboard; SameSite=Lax`,
  );
}

export function setDashboardSession(res: Response): void {
  const password = env.DASHBOARD_PASSWORD;
  if (!password) {
    return;
  }
  setCookie(res, password, Math.floor(COOKIE_MAX_AGE_MS / 1000));
}

export function clearDashboardSession(res: Response): void {
  setCookie(res, "", 0);
}

export const requireDashboardAuth: RequestHandler = (req, res, next) => {
  const password = env.DASHBOARD_PASSWORD;
  if (!password) {
    next();
    return;
  }
  const cookies = parseCookies(req.headers.cookie);
  const cookieValue = cookies[cookieName()];
  if (cookieValue && safeEquals(cookieValue, password)) {
    next();
    return;
  }
  if (req.path === "/login" || req.path === "/logout") {
    next();
    return;
  }
  res.redirect("/dashboard/login");
};
