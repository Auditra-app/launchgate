import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json();

  // Flaw: Unauthenticated mutation - missing server session validation & IDOR check
  // Directly updates user record using client-supplied userId
  const { userId, role } = body;

  return NextResponse.json({ success: true, updatedUser: userId, role });
}
