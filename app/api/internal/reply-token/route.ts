import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateInternalApiSecret, isInternalRateLimited } from '@/lib/internal-api-auth';
import { createLogger } from '@/lib/logger';
import { createReplyToken, decodeReplyToken } from '@/lib/reply-token-crypto';

const logger = createLogger('ReplyTokenAPI');

const createTokenSchema = z.object({
    originalSender: z.string().email().max(254),
    aliasEmail: z.string().email().max(254),
    recipientEmail: z.string().email().max(254),
});

export async function POST(request: NextRequest) {
  if (!validateInternalApiSecret(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (await isInternalRateLimited("reply-token")) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = createTokenSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { originalSender, aliasEmail, recipientEmail } = parsed.data;
    const token = createReplyToken(originalSender, aliasEmail, recipientEmail);

    return NextResponse.json({ token });

  } catch (error) {
    logger.error('Error creating reply token', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!validateInternalApiSecret(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (await isInternalRateLimited("reply-token")) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse('Missing token parameter', { status: 400 });
  }

  try {
    const decoded = decodeReplyToken(token);
    if (!decoded) {
      return new NextResponse('Token not found', { status: 404 });
    }

    return NextResponse.json({
      token,
      originalSender: decoded.originalSender,
      aliasEmail: decoded.aliasEmail,
      recipientEmail: decoded.recipientEmail,
      expiresAt: decoded.expiresAt,
    });

  } catch (error) {
    logger.error('Error retrieving reply token', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
