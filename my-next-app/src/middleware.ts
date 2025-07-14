import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware({
  publicRoutes: ["/", "/sign-in", "/sign-up"], // ← “/” が入っていればOK
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};