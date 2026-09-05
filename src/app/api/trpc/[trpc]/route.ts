import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { createContext } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/root";

/**
 * The single HTTP surface in the app. This is tRPC's own transport adapter,
 * not a REST endpoint -- all application data goes through `appRouter`.
 */
function handler(req: Request): Promise<Response> {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: ({ resHeaders }) =>
      createContext({ headers: req.headers, resHeaders }),
  });
}

export { handler as GET, handler as POST };
