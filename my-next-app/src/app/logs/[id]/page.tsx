// src/app/logs/[id]/page.tsx
'use client';

import 'react-quill-new/dist/quill.snow.css'; // ★ これを追加
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, useUser, SignedIn, SignedOut } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import DOMPurify from 'isomorphic-dompurify';
import dynamic from 'next/dynamic';

type Log = {
  id: string;
  title: string;
  memo: string;
  date: string;
  user_id: string;
  categories?: string[];
  sort_order?: number;
};

// ReactQuill（詳細ページ上での編集用）
const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

// 日付フォーマット
const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

// Quill のツールバー・フォーマット設定（ダッシュボードに寄せた標準構成）
const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['blockquote', 'code-block'],
    ['link', 'image'],
    ['clean'],
  ],
};

const quillFormats = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'list',
  'align',
  'blockquote',
  'code-block',
  'link',
  'image',
];

// HTMLサニタイズ
const sanitizeHtml = (dirty: string) => {
  const clean = DOMPurify.sanitize(dirty || '', {
    USE_PROFILES: { html: true },
    FORBID_ATTR: ['style'],
  });

  if (typeof window === 'undefined') return clean;

  const div = document.createElement('div');
  div.innerHTML = clean;

  div.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]').forEach((a) => {
    const rel = a.getAttribute('rel') || '';
    if (!rel.includes('noopener')) {
      a.setAttribute(
        'rel',
        (rel ? rel + ' ' : '') + 'noopener noreferrer'
      );
    }
  });

  return div.innerHTML;
};

export default function LogDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const [log, setLog] = useState<Log | null>(null);
  const [loading, setLoading] = useState(true);

  // 編集モード用
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editMemo, setEditMemo] = useState('');

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

      const cats =
        l.categories && l.categories.length > 0 ? l.categories : ['未分類'];

      setLog({ ...l, categories: cats });
      setEditTitle(l.title || '');
      setEditMemo(l.memo || '');
    } catch (e) {
      console.error('fetch detail error:', e);
      setLog(null);
    } finally {
      setLoading(false);
    }
  }, [id, isSignedIn]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  const handleEditStart = () => {
    if (!log) return;
    setEditTitle(log.title || '');
    setEditMemo(log.memo || '');
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    if (log) {
      setEditTitle(log.title || '');
      setEditMemo(log.memo || '');
    }
    setIsEditing(false);
  };

  const handleEditSave = async () => {
    if (!id || !log) return;
    try {
      const token = await getSupabaseToken();
      if (!token) throw new Error('No token');
      const sb = makeAuthedClient(token);

      const { error } = await sb
        .from('logs')
        .update({
          title: editTitle,
          memo: editMemo,
        })
        .eq('id', id);

      if (error) throw error;

      setLog((prev) =>
        prev
          ? {
              ...prev,
              title: editTitle,
              memo: editMemo,
            }
          : prev
      );
      setIsEditing(false);
    } catch (e) {
      console.error('edit detail error:', e);
      alert('保存に失敗しました。');
    }
  };

  const handleDelete = async () => {
    if (!id || !log) return;
    const ok = window.confirm('このログを削除しますか？');
    if (!ok) return;

    try {
      const token = await getSupabaseToken();
      if (!token) throw new Error('No token');
      const sb = makeAuthedClient(token);
      const { error } = await sb.from('logs').delete().eq('id', id);
      if (error) throw error;

      router.push('/logs');
    } catch (e) {
      console.error('delete detail error:', e);
      alert('削除に失敗しました。');
    }
  };

  return (
    <>
      <SignedOut>
        <main className="p-6">
          <p>ログインしてください。</p>
        </main>
      </SignedOut>

      <SignedIn>
        <main className="p-6 max-w-3xl mx-auto space-y-6">
          <header className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">ログ詳細</h1>
            <div className="flex gap-2">
              <Link
                href="/logs"
                className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
              >
                一覧へ
              </Link>
              <Link
                href="/dashboard"
                className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
              >
                ダッシュボードへ
              </Link>
            </div>
          </header>

          {loading && <p>読み込み中…</p>}

          {!loading && !log && (
            <p className="text-red-600">
              このログは存在しないか、閲覧権限がありません。
            </p>
          )}

          {!loading && log && (
            <article className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  {isEditing ? (
                    <input
                      className="w-full border rounded px-2 py-1 text-sm mb-1"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="タイトル"
                    />
                  ) : (
                    <h2 className="text-xl font-semibold break-words">
                      {log.title || '(no title)'}
                    </h2>
                  )}

                  <p className="text-xs text-gray-500 mt-1">
                    {dateTimeFormatter.format(new Date(log.date))}
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={handleEditSave}
                        className="px-3 py-2 text-xs border rounded bg-blue-600 text-white hover:opacity-90"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={handleEditCancel}
                        className="px-3 py-2 text-xs border rounded hover:bg-gray-50"
                      >
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleEditStart}
                      className="px-3 py-2 text-xs border rounded hover:bg-gray-50"
                    >
                      編集
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-3 py-2 text-xs border rounded text-red-600 border-red-300 hover:bg-red-50"
                  >
                    削除
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {(log.categories && log.categories.length > 0
                  ? log.categories
                  : ['未分類']
                ).map((c, i) => (
                  <span
                    key={`c-${i}`}
                    className="text-[10px] px-2 py-0.5 rounded-full border"
                  >
                    {c}
                  </span>
                ))}
              </div>

              {isEditing ? (
                <div className="border rounded">
                  <ReactQuill
                    value={editMemo}
                    onChange={setEditMemo}
                    theme="snow"
                    modules={quillModules}
                    formats={quillFormats}
                  />
                </div>
              ) : (
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
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(log.memo || ''),
                  }}
                />
              )}
            </article>
          )}
        </main>
      </SignedIn>
    </>
  );
}
