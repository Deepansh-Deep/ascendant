import handler from "./handler.js";
Deno.serve((req: Request) => handler(req, Deno.env.toObject()));
