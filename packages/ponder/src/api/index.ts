import { ponder } from "ponder:registry";
import { graphql } from "@ponder/core";
import { cors } from "hono/cors";

ponder.use("*", cors({
  origin: ["https://1pd-poc.vercel.app", "http://localhost:3000"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));

ponder.use("/graphql", graphql());
ponder.use("/", graphql());
