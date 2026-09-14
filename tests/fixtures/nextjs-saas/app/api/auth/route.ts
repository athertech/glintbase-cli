// @ts-nocheck
export async function POST(req: any) {
  return Response.json({ token: 'mock-agent-token', expires_in: 3600 });
}
