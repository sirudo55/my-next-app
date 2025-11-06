'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth, useUser, SignedIn, SignedOut } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import DOMPurify from 'isomorphic-dompurify';

type Log = {
  id: string;
  title: string;
  memo: string;
  date: string;
  user_id: string;
  categories?: string[];
  sort_order?: number;
};

export default function LogDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  const [log, setLog] = useState<Log | null>(null);
  const [loading, setLoading] = useState(true);

  const getSupabaseToken = async () => {
    let token = await getToken({ template: 'supabase' }).catch(() => null);
    if (!token) token = await getToken().catch(() => null);
    return token;
  };

  const makeAuthedClient = (token: string) =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

  const fetchLog = useCallback(async () => {
    if (!isSignedIn || !id) return;
    setLoading(true);
    try {
      const token = await getSupabaseToken();
      if (!token) throw new Error('No token');
      const sb = makeAuthedClient(token);
      const { data, error } = await sb
        .from('logs')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      const l = data as Log;
      setLog({ ...l, categories: l.categories ?? ['未分類'] });
    } catch (e) {
      console.error('fetch detail error:', e);
      setLog(null);
    } finally {
      setLoading(false);
    }
  }, [id, isSignedIn]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  if (!isSignedIn) {
    return (
      <SignedOut>
        <main className="p-6"><p>ログインしてください。</p></main>
      </SignedOut>
    );
  }

  return (
    <SignedIn>
      <main className="p-6 max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">ログ詳細</h1>
          <div className="flex gap-2">
            <Link href="/logs" className="px-3 py-2 text-sm border rounded hover:bg-gray-50">一覧へ</Link>
            <Link href="/dashboard" className="px-3 py-2 text-sm border rounded hover:bg-gray-50">ダッシュボードへ</Link>
          </div>
        </header>

        {loading && <p>読み込み中…</p>}

        {!loading && !log && (
          <p className="text-red-600">このログは見つかりませんでした。</p>
        )}

        {!loading && log && (
          <article className="space-y-3">
            <div>
              <h2 className="text-xl font-semibold break-words">{log.title || '(no title)'}</h2>
              <p className="text-xs text-gray-500 mt-1">{new Date(log.date).toLocaleString()}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {(log.categories ?? ['未分類']).map((c, i) => (
                <span key={`c-${i}`} className="text-[10px] px-2 py-0.5 rounded-full border">{c}</span>
              ))}
            </div>
            <div
              className="
                prose max-w-none
                [&_ul]:list-disc [&_ul]:pl-5
                [&_ol]:list-decimal [&_ol]:pl-5
                [&_h1]:text-3xl [&_h2]:text-2xl [&_h3]:text-xl
                [&_blockquote]:border-l-4 [&_blockquote]:pl-4
                [&_pre]:bg-gray-100 [&_pre]:p-3 [&_pre]:rounded
                [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded
                [&_a]:text-blue-600 [&_a]:underline hover:[&_a]:opacity-80
                [&_img]:rounded [&_img]:my-2 [&_img]:max-w-full [&_img]:h-auto
              "
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(log.memo || '') }}
            />
          </article>
        )}
      </main>
    </SignedIn>
  );
}
