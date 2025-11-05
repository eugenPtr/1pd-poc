const DEFAULT_PONDER_URL = "http://localhost:42069";

const baseUrl = (process.env.NEXT_PUBLIC_PONDER_URL || DEFAULT_PONDER_URL).replace(/\/$/, "");
export const PONDER_GRAPHQL_URL = `${baseUrl}/graphql`;

export type GraphQLResponse<T> = { data?: T; errors?: { message: string }[] };

export async function graphqlRequest<T>(query: string, variables?: Record<string, any>): Promise<T> {
  const queryName = query.match(/query\s+(\w+)/)?.[1] || "Unknown";

  const res = await fetch(PONDER_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = (await res.json()) as GraphQLResponse<T>;

  if (!res.ok || json.errors) {
    console.error(`GraphQL ${queryName} errors:`, json.errors);
    throw new Error(json.errors?.map(e => e.message).join("; ") || `GraphQL error (${res.status})`);
  }

  console.log(`GraphQL Data for ${queryName}:`, json.data);
  return json.data as T;
}
