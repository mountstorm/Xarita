// @ts-check
// Vercel function behind /tiles/ohm/{z}/{x}/{y}.pbf (see vercel.json).
import { tileResponse } from "./_ohm-slim.js";

/**
 * @param {{ query: Record<string, string> }} req
 * @param {{ setHeader(k: string, v: string): void, status(code: number): { send(body: unknown): unknown, end(): unknown } }} res
 */
export default async function handler(req, res) {
  const { status, headers, body } = await tileResponse(req.query.z, req.query.x, req.query.y);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  return status === 204 ? res.status(204).end() : res.status(status).send(body);
}
