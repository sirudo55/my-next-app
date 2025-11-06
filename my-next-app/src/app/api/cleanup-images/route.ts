// app/api/cleanup-images/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 今回は URL から学習用バケット名を決め打ち
const BUCKET = 'learning-logs';

export const runtime = 'nodejs';

function extractObjectPath(url: string): string | null {
  try {
    // 例) https://xxxx.supabase.co/storage/v1/object/public/learning-logs/user_xxx/xxx.png
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const i = parts.indexOf('public');
    if (i === -1) return null;
    const bucket = parts[i + 1];
    if (bucket !== BUCKET) return null;
    const rest = parts.slice(i + 2).join('/'); // userId/filename...
    // ルート相対や不正なパスを簡易防御
    if (!rest || rest.includes('..') || rest.startsWith('/')) return null;
    return rest;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Server keys missing' }, { status: 500 });
    }

    // 入力 { urls: string[], userId: string }
    const body = await req.json().catch(() => null as any);
    const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];
    const userId: string | undefined = typeof body?.userId === 'string' ? body.userId : undefined;
    if (!urls.length || !userId) {
      return NextResponse.json({ error: 'urls[] and userId are required' }, { status: 400 });
    }

    // URL -> object path へ変換（bucket配下の userId/ で始まるものだけ許可）
    const paths = urls
      .map(extractObjectPath)
      .filter((p): p is string => !!p && p.startsWith(`${userId}/`));

    if (!paths.length) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const supa = createClient(url, serviceKey);

    const { data, error } = await supa.storage.from(BUCKET).remove(paths);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: data?.length ?? 0, paths });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
