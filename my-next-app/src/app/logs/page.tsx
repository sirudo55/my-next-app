'use client';

// 一覧ページ安定化：
// - タブ表示用カテゴリは「全ログ」から別取得（allCategories）
// - per-log のカテゴリ正規化（重複排除・空→'未分類'）
// - key 重複回避 / DnD 安定 / ページング維持

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth, SignedIn, SignedOut } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import DOMPurify from 'isomorphic-dompurify';
import { format } from 'date-fns';

// DnD（並び替え）
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy, // ★ グリッド用
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DragEndEvent } from '@dnd-kit/core';

type Log = {
  id: string;
  title: string;
  memo: string;
  date: string;       // ISO
  user_id: string;
  categories?: string[];
  sort_order?: number;
};

// ---------- ユーティリティ ----------
const normalizeCats = (cats?: string[]) =>
  Array.from(new Set((cats ?? ['未分類']).map(c => (c && c.trim()) ? c : '未分類')));

// ---------- DnD Sortable Item ----------
function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: isDragging ? 'grabbing' : 'default',
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      onPointerDownCapture={(e) => {
        const el = e.target as HTMLElement;
        if (el.closest('.drag-handle')) return;
        if (el.closest('input, textarea, select, button, a, [contenteditable="true"], .ql-editor')) {
          e.stopPropagation();
        }
      }}
      className="h-full"
    >
      <div className="flex justify-end">
        <button
          type="button"
          aria-label="ドラッグして並び替え"
          className="drag-handle cursor-grab px-2 py-1 text-gray-500 hover:text-gray-700 select-none"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
      </div>
      {children}
    </div>
  );
}

export default function LogsIndexPage() {
  const { isSignedIn, getToken } = useAuth();

  // ---- 共通ヘルパー ----
  const getSupabaseToken = useCallback(async () => {
    let token = await getToken({ template: 'supabase' }).catch(() => null);
    if (!token) token = await getToken().catch(() => null);
    return token;
  }, [getToken]);

  const makeAuthedClient = useCallback((token: string) => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
  }, []);

  // ---- state ----
  const [logs, setLogs] = useState<Log[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>(['未分類']); // ★全ログから収集したカテゴリ
  const [activeTab, setActiveTab] = useState<string>('すべて');

  // ページング
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  // 検索
  const [q, setQ] = useState('');

  // DnD センサ
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // ---- 並び順固定のソート配列 ----
  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0) || (b.date > a.date ? 1 : -1));
  }, [logs]);

  // ---- タブで絞り込み ----
  const visibleLogs = useMemo(() => {
    const filteredByTab =
      activeTab === 'すべて'
        ? sortedLogs
        : sortedLogs.filter(l => normalizeCats(l.categories).includes(activeTab));
    if (!q.trim()) return filteredByTab;
    const kw = q.trim().toLowerCase();
    return filteredByTab.filter(l => {
      const t = (l.title || '').toLowerCase();
      const m = (l.memo || '').toLowerCase();
      return t.includes(kw) || m.includes(kw);
    });
  }, [sortedLogs, activeTab, q]);

  // ---- 初回ロード：ページ0＆カテゴリ全取得 ----
  useEffect(() => {
    if (!isSignedIn) return;
    // 1) 一覧の初期ページ
    setLogs([]);
    setPage(0);
    setHasMore(true);
    void fetchPage(0, true);
    // 2) 全ログからカテゴリを別途収集
    void fetchAllCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  // ---- activeTab 変更時：ページを再取得（カテゴリは allCategories を維持）----
  useEffect(() => {
    if (!isSignedIn) return;
    setLogs([]);
    setPage(0);
    setHasMore(true);
    void fetchPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ---- 全カテゴリ取得（全ログの categories だけ軽量取得） ----
  const fetchAllCategories = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const token = await getSupabaseToken();
      if (!token) throw new Error('No Clerk token');
      const sb = makeAuthedClient(token);

      const { data, error } = await sb
        .from('logs')
        .select('categories')
        .order('date', { ascending: false })
        .limit(2000);

      if (error) throw error;

      const setCat = new Set<string>(['未分類']);
      for (const row of (data ?? [])) {
        normalizeCats(row?.categories).forEach(c => setCat.add(c));
      }
      setAllCategories(['未分類', ...Array.from(setCat).filter(c => c !== '未分類')]);
    } catch (e) {
      console.error('fetchAllCategories error:', e);
      // フェイルセーフ：既存を維持
    }
  }, [isSignedIn, getSupabaseToken, makeAuthedClient]);

  // ---- ページ取得（追記読み込み） ----
  const fetchPage = useCallback(async (nextPage: number, reset = false) => {
    if (!isSignedIn || loading || (!reset && !hasMore)) return;
    setLoading(true);
    try {
      const token = await getSupabaseToken();
      if (!token) throw new Error('No Clerk token');
      const sb = makeAuthedClient(token);

      let qsb = sb
        .from('logs')
        .select('*')
        .order('sort_order', { ascending: false })
        .order('date', { ascending: false })
        .range(nextPage * PAGE_SIZE, nextPage * PAGE_SIZE + PAGE_SIZE - 1);

      if (activeTab !== 'すべて') {
        qsb = qsb.overlaps('categories', [activeTab] as any);
      }

      const { data, error } = await qsb;
      if (error) throw error;

      const rows = (data ?? []) as Log[];

      const normalized = rows.map(l => ({
        ...l,
        categories: normalizeCats(l.categories),
      }));

      setLogs(prev => (reset ? normalized : [...prev, ...normalized]));

      if (rows.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
      setPage(nextPage);
    } catch (e) {
      console.error('fetchPage error:', e);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, loading, hasMore, getSupabaseToken, makeAuthedClient, activeTab]);

  // ---- 「もっと読む」ボタン ----
  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading) return;
    void fetchPage(page + 1);
  }, [page, hasMore, loading, fetchPage]);

  // ---- DnD: 並び替え（RPC） ----
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = visibleLogs.map(l => l.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;

    const reorderedVisible = arrayMove(visibleLogs, oldIdx, newIdx);

    const newAll = logs.map(l => reorderedVisible.find(v => v.id === l.id) ?? l);
    const base = Math.max(...newAll.map(l => l.sort_order ?? 0), 0) + 1000;
    const updatedVisible = reorderedVisible.map((l, i) => ({ ...l, sort_order: base - i }));
    const merged = newAll.map(l => updatedVisible.find(u => u.id === l.id) ?? l);
    merged.sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0));
    setLogs(merged);

    try {
      const token = await getSupabaseToken();
      if (!token) throw new Error('No Clerk token');
      const sb = makeAuthedClient(token);
      await sb.rpc('reorder_logs', { ids: reorderedVisible.map(r => r.id) });
    } catch (e: any) {
      console.error('reorder error:', e?.message ?? e, e);
      setLogs([]);
      setPage(0);
      setHasMore(true);
      void fetchPage(0, true);
    }
  }, [logs, visibleLogs, getSupabaseToken, makeAuthedClient, fetchPage]);

  // ---- DnD items（ユニーク） ----
  const sortableIds = useMemo(() => visibleLogs.map(l => l.id), [visibleLogs]);

  // ---- 画像の lazy/async 付与（任意） ----
  useEffect(() => {
    const imgs = document.querySelectorAll<HTMLImageElement>('.prose img');
    imgs.forEach((img) => {
      if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
      if (!img.style.maxWidth) img.style.maxWidth = '100%';
      if (!img.style.height) img.style.height = 'auto';
    });
  }, [visibleLogs]);

  if (!isSignedIn) {
    return (
      <SignedOut>
        <main className="p-6"><p>ログインしてください。</p></main>
      </SignedOut>
    );
  }

  return (
    <SignedIn>
      <main className="p-6 max-w-6xl mx-auto space-y-6">{/* ★ 横幅広げる */}
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <h1 className="text-2xl font-bold">ログ一覧</h1>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab('すべて')}
                className={`px-3 py-1 rounded border ${activeTab === 'すべて' ? 'bg-gray-900 text-white' : 'bg-white'}`}
              >
                すべて
              </button>
              {allCategories.map((c) => (
                <button
                  key={`tab-${c}`}
                  onClick={() => setActiveTab(c)}
                  className={`px-3 py-1 rounded border ${activeTab === c ? 'bg-gray-900 text-white' : 'bg-white'}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="border px-3 py-2 rounded"
                placeholder="検索（タイトル・本文）"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button
                onClick={() => setQ('')}
                className="px-3 py-2 border rounded"
              >
                クリア
              </button>
            </div>
          </div>
        </header>

        {/* 一覧（2カラムカード） */}
        <section className="space-y-3">
          {visibleLogs.length === 0 && (
            <p className="text-gray-500">この条件のログはありません。</p>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleLogs.map((log) => {
                  const perLogCats = normalizeCats(log.categories);
                  return (
                    <SortableItem key={log.id} id={log.id}>
                      <article className="border rounded p-3 bg-white shadow-sm h-full flex flex-col">
                        <h3 className="font-semibold truncate">
                          {log.title || '(no title)'}
                        </h3>

                        <div className="flex flex-wrap gap-1 mt-1">
                          {perLogCats.map((c, i) => (
                            <span
                              key={`${log.id}-${c}-${i}`}
                              className="text-[10px] inline-flex items-center px-2 py-0.5 rounded-full border"
                            >
                              {c}
                            </span>
                          ))}
                        </div>

                        <div
                          className="prose max-w-none line-clamp-3 [&_img]:hidden text-sm text-gray-700 mt-2"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(log.memo || '') }}
                        />
                        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                          <span>{format(new Date(log.date), 'yyyy-MM-dd HH:mm')}</span>
                          <a
                            href={`/logs/${log.id}`}
                            className="underline hover:opacity-80"
                            aria-label="詳細へ"
                          >
                            詳細
                          </a>
                        </div>
                      </article>
                    </SortableItem>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>

          {/* ページング */}
          <div className="pt-2 flex justify-center">
            {hasMore ? (
              <button
                disabled={loading}
                onClick={handleLoadMore}
                className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-60"
              >
                {loading ? '読み込み中…' : 'もっと読む'}
              </button>
            ) : (
              <p className="text-xs text-gray-500">以上です</p>
            )}
          </div>
        </section>
      </main>
    </SignedIn>
  );
}
