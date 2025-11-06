// app/api/upload-image/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs'; // Buffer使用のためNodeランタイム

export async function GET() {
  return NextResponse.json({ ok: true, message: 'upload-image API is reachable' });
}

export async function POST(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_SUPABASE_URL' },
        { status: 500 }
      );
    }
    if (!serviceKey) {
      return NextResponse.json(
        { error: 'Missing SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const file = form.get('file') as File | null;
    const userId = (form.get('userId') as string | null) || 'anonymous';

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const supa = createClient(url, serviceKey);

    const arrayBuffer = await file.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: upErr } = await supa
      .storage
      .from('learning-logs')
      .upload(path, bytes, { contentType: file.type, upsert: false });

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data } = supa.storage.from('learning-logs').getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
