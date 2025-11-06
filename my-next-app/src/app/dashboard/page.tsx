'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useAuth, useUser, SignOutButton, SignedIn, SignedOut } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';

import dynamic from 'next/dynamic';
const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });
import 'react-quill-new/dist/quill.snow.css';

import DOMPurify from 'isomorphic-dompurify';

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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DragEndEvent } from '@dnd-kit/core';

import Link from 'next/link'; // ログ一覧リンク

// ---------- DnD用のSortableアイテム ----------
function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

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

// Supabaseに合わせた型
type Log = {
  id: string;
  title: string;
  memo: string;     // ReactQuillのHTML（本文中に<img>を含む）
  date: string;     // ISO文字列
  user_id: string;  // RLS用
  categories?: string[];
  sort_order?: number;
};

// ★カテゴリ正規化ユーティリティ（重複排除・空埋め）
const normalizeCats = (cats?: string[]) =>
  Array.from(new Set((cats ?? ['未分類']).map(c => (c && c.trim()) ? c : '未分類')));

export default function Dashboard() {
  const { user } = useUser();
  const { isSignedIn, getToken } = useAuth();

  // ---------- 共通ヘルパー ----------
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

  // ---------- state ----------
  const [logs, setLogs] = useState<Log[]>([]);
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState(''); // ReactQuill用（本文中に<img>を含む）

  // カテゴリ関連
  const [newCategory, setNewCategory] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>('すべて');
  const [categories, setCategories] = useState<string[]>(['未分類']); // ← logsから自動再計算に変更

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editSelectedCats, setEditSelectedCats] = useState<string[]>([]);
  const [editNewCategory, setEditNewCategory] = useState('');

  // ★Step13-C: 編集前の本文を保持（差分抽出用）
  const [originalEditMemo, setOriginalEditMemo] = useState('');

  // Step8: 検索/日付フィルタ
  const [searchText, setSearchText] = useState('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Step10: インポート用の隠しfile input 参照
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // ---------- Quill refs（本文／編集） ----------
  const quillRefNew = useRef<any>(null);
  const quillRefEdit = useRef<any>(null);

  // ---------- DnD ----------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // ---------- 並び順と可視リスト ----------
  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0));
  }, [logs]);

  const visibleLogs = useMemo(() => {
    const base = (activeTab === 'すべて')
      ? sortedLogs
      : sortedLogs.filter(l => normalizeCats(l.categories).includes(activeTab));
    if (!searchText.trim()) return base;

    const kw = searchText.trim().toLowerCase();
    return base.filter(l => (l.title || '').toLowerCase().includes(kw) || (l.memo || '').toLowerCase().includes(kw));
  }, [sortedLogs, activeTab, searchText]);

  // ---------- DnD: ドラッグ終了（RPC一括更新） ----------
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = visibleLogs.map(l => l.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;

    const reorderedVisible = arrayMove(visibleLogs, oldIdx, newIdx);

    // UI 楽観更新（仮採番）
    const newLogs = logs.map(l => reorderedVisible.find(v => v.id === l.id) ?? l);
    const base = Math.max(...newLogs.map(l => l.sort_order ?? 0), 0) + 1000;
    const updatedVisible = reorderedVisible.map((l, i) => ({ ...l, sort_order: base - i }));
    const uiMerged = newLogs.map(l => updatedVisible.find(u => u.id === l.id) ?? l);
    const uiSorted = [...uiMerged].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0));
    setLogs(uiSorted);

    try {
      const token = await getSupabaseToken();
      if (!token) throw new Error('No Clerk token');
      const sb = makeAuthedClient(token);
      await sb.rpc('reorder_logs', { ids: reorderedVisible.map(r => r.id) });
    } catch (e: any) {
      console.error('reorder rpc error:', e?.message ?? e, e);
      fetchLogs();
    }
  }, [logs, visibleLogs]);

  // ---------- 一覧取得 ----------
  const fetchLogs = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const token = await getSupabaseToken();
      if (!token) throw new Error('No Clerk token');
      const sb = makeAuthedClient(token);

      const { data, error } = await sb
        .from('logs')
        .select('*')
        .order('sort_order', { ascending: false })
        .order('date', { ascending: false });

      if (error) throw error;

      const list = (data ?? []) as Log[];
      const normalized = list.map(l => ({
        ...l,
        categories: normalizeCats(l.categories),
      }));
      setLogs(normalized);
      // ※ setCategories はここでは行わない（logs依存useEffectで一元管理）
    } catch (e) {
      console.error('fetchLogs error:', e);
    }
  }, [isSignedIn]);

  // ---------- フィルタ付き取得 ----------
  const fetchLogsFiltered = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const token = await getSupabaseToken();
      if (!token) throw new Error('No Clerk token');
      const sb = makeAuthedClient(token);

      let q = sb.from('logs')
        .select('*')
        .order('sort_order', { ascending: false })
        .order('date', { ascending: false });

      if (fromDate) q = q.gte('date', new Date(fromDate + 'T00:00:00.000Z').toISOString());
      if (toDate)   q = q.lte('date', new Date(toDate   + 'T23:59:59.999Z').toISOString());

      if (searchText.trim()) {
        const kw = `%${searchText.trim()}%`;
        q = q.or(`title.ilike.${kw},memo.ilike.${kw}`);
      }

      if (activeTab !== 'すべて') {
        q = q.overlaps('categories', [activeTab] as any);
      }

      const { data, error } = await q;
      if (error) throw error;

      const list = (data ?? []) as Log[];
      const normalized = list.map(l => ({ ...l, categories: normalizeCats(l.categories) }));
      setLogs(normalized);
      // ※ setCategories はここでは行わない
    } catch (e) {
      console.error('fetchLogsFiltered error:', e);
    }
  }, [isSignedIn, searchText, fromDate, toDate, activeTab]);

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, user?.id]);

  // ---------- logs 変更時にカテゴリを自動再計算 ----------
  useEffect(() => {
    const setCat = new Set<string>(['未分類']);
    for (const l of logs) normalizeCats(l.categories).forEach(c => setCat.add(c));
    setCategories(['未分類', ...Array.from(setCat).filter(c => c !== '未分類')]);
  }, [logs]);

  // ---------- 追加（新規作成） ----------
  const handleAdd = async () => {
    if (!title.trim() || !isSignedIn) return;
    try {
      const token = await getSupabaseToken();
      if (!token) throw new Error('No Clerk token');
      const sb = makeAuthedClient(token);

      const addCats = [...selectedCats];
      if (newCategory.trim()) {
        if (!addCats.includes(newCategory.trim())) addCats.push(newCategory.trim());
      }
      const finalCats = normalizeCats(addCats);

      const maxOrder = logs.reduce((m, l) => Math.max(m, l.sort_order ?? 0), 0);
      const payload = {
        title,
        memo,
        date: new Date().toISOString(),
        user_id: user?.id ?? '', // 実運用はDB DEFAULT auth.uid() 推奨
        categories: finalCats,
        sort_order: maxOrder + 1,
      };

      const { data, error } = await sb
        .from('logs')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      const inserted = data as Log;
      setLogs(prev => {
        const next = [{ ...inserted, categories: normalizeCats(inserted.categories) }, ...prev];
        return next.sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0));
      });

      // 入力リセット
      setTitle('');
      setMemo('');
      setNewCategory('');
      setSelectedCats([]);
    } catch (e: any) {
      console.error('addLog error:', e?.message ?? e, e);
    }
  };

  // ---------- 編集開始 ----------
  const handleEditStart = (log: Log) => {
    setEditingId(log.id);
    setEditTitle(log.title);
    setEditMemo(log.memo || '');
    setEditSelectedCats(normalizeCats(log.categories));
    setEditNewCategory('');
    setOriginalEditMemo(log.memo || ''); // ★Step13-C: 差分用に元本文を保持
  };

  // ---------- ★Step13-C: HTMLから画像URLを抽出（<img src="...">） ----------
  const extractImageUrls = (html: string): string[] => {
    if (!html) return [];
    const urls = new Set<string>();
    const imgTagRegex = /<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = imgTagRegex.exec(html))) {
      const src = m[1];
      if (src && /^https?:\/\//i.test(src)) urls.add(src);
    }
    return Array.from(urls);
  };

  // ---------- ★Step13-C: 削除API呼び出し ----------
  const requestDeleteImages = async (urls: string[], userId?: string | null) => {
    if (!urls.length || !userId) return;
    try {
      const res = await fetch('/api/cleanup-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, userId }),
      });
      const txt = await res.text();
      try {
        const json = JSON.parse(txt);
        if (!res.ok) console.error('cleanup failed:', json);
        else console.info('cleanup ok:', json);
      } catch {
        console.error('cleanup non-JSON:', txt);
      }
    } catch (e) {
      console.error('cleanup request error:', e);
    }
  };

  // ---------- 編集保存（UPDATE） ----------
  const handleEditSave = async () => {
    if (!editingId) return;
    try {
      const token = await getSupabaseToken();
      if (!token) throw new Error('No Clerk token');
      const sb = makeAuthedClient(token);

      const addCats = [...editSelectedCats];
      if (editNewCategory.trim() && !addCats.includes(editNewCategory.trim())) {
        addCats.push(editNewCategory.trim());
      }
      const finalCats = normalizeCats(addCats);

      const { error } = await sb
        .from('logs')
        .update({ title: editTitle, memo: editMemo, categories: finalCats })
        .eq('id', editingId);

      if (error) throw error;

      setLogs((prev) => {
        const merged = prev.map((l) => {
          if (l.id !== editingId) return l;
          return { ...l, title: editTitle, memo: editMemo, categories: finalCats };
        });
        return merged.sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0));
      });

      // ★Step13-C: 差分を抽出して不要画像を削除
      try {
        const beforeUrls = extractImageUrls(originalEditMemo);
        const afterUrls  = extractImageUrls(editMemo);
        const removed = beforeUrls.filter(u => !afterUrls.includes(u));
        if (removed.length) {
          await requestDeleteImages(removed, user?.id);
        }
      } catch (e) {
        console.error('cleanup (edit) error:', e);
      }

      // リセット
      setEditingId(null);
      setEditTitle('');
      setEditMemo('');
      setEditSelectedCats(['未分類']);
      setEditNewCategory('');
      setOriginalEditMemo('');
    } catch (e) {
      console.error('updateLog error:', e);
    }
  };

  // ---------- 編集キャンセル ----------
  const handleEditCancel = () => {
    setEditingId(null);
    setEditTitle('');
    setEditMemo('');
    setEditSelectedCats(['未分類']);
    setEditNewCategory('');
    setOriginalEditMemo('');
  };

  // ---------- 削除（DELETE） ----------
  const handleDelete = async (id: string) => {
    try {
      // ★Step13-C: 対象ログの本文から全画像URLを抽出し、先に削除する
      const target = logs.find(l => l.id === id);
      if (target?.memo) {
        const urls = extractImageUrls(target.memo);
        if (urls.length) {
          await requestDeleteImages(urls, user?.id);
        }
      }

      const token = await getSupabaseToken();
      if (!token) throw new Error('No Clerk token');
      const sb = makeAuthedClient(token);

      const { error } = await sb.from('logs').delete().eq('id', id);
      if (error) throw error;
      setLogs(list => list.filter(l => l.id !== id));
    } catch (e) {
      console.error('deleteLog error:', e);
    }
  };

  // ---------- Quill: 画像ハンドラ ----------
  const makeImageHandler = useCallback((which: 'new' | 'edit') => {
    return () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file || !user?.id) return;

        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('userId', user.id); // フォルダ分け用

          const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
          const text = await res.text();

          let json: any = null;
          try {
            json = JSON.parse(text);
          } catch {
            throw new Error(`Upload API returned non-JSON response: ${text?.slice(0, 200)}`);
          }
          if (!res.ok) {
            throw new Error(json?.error || `Upload failed with status ${res.status}`);
          }

          const url = json.url as string;
          const quill = (which === 'new' ? quillRefNew.current : quillRefEdit.current)?.getEditor?.();
          if (!quill) return;

          const range = quill.getSelection(true);
          const index = range ? range.index : quill.getLength();
          quill.insertEmbed(index, 'image', url, 'user');
          quill.setSelection(index + 1);
        } catch (err) {
          console.error('image upload failed:', err);
          alert(`画像アップロードに失敗しました: ${String((err as any)?.message ?? err)}`);
        }
      };
      input.click();
    };
  }, [user?.id]);

  // ★Step13: 共通アップロード関数（/api/upload-image を叩いて公開URLを返す）
  const uploadImageFile = useCallback(async (file: File, userId: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('userId', userId);

    const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`Upload API returned non-JSON: ${text?.slice(0,200)}`); }
    if (!res.ok) throw new Error(json?.error || `Upload failed: ${res.status}`);
    return json.url as string;
  }, []);

  // ★Step13: 取得したURLをエディタに順次挿入（DnD/ペースト対応）
  const insertImagesToQuill = useCallback(async (which: 'new'|'edit', files: FileList | File[] | null) => {
    if (!files || !user?.id) return;
    const arr = Array.from(files);
    const quill = (which === 'new' ? quillRefNew.current : quillRefEdit.current)?.getEditor?.();
    if (!quill) return;

    for (const f of arr) {
      if (!f.type.startsWith('image/')) continue;
      const url = await uploadImageFile(f, user.id);
      const range = quill.getSelection(true);
      const index = range ? range.index : quill.getLength();
      quill.insertEmbed(index, 'image', url, 'user');
      quill.setSelection(index + 1);
    }
  }, [user?.id, uploadImageFile]);

  useEffect(() => {
    const bindDnDAndPaste = (ref: any, which: 'new'|'edit') => {
      const quill = ref.current?.getEditor?.();
      if (!quill) return () => {};

      const root: HTMLElement = quill.root;

      const onDrop = async (ev: DragEvent) => {
        if (!ev.dataTransfer) return;
        const files = ev.dataTransfer.files;
        if (!files || files.length === 0) return;
        const hasImage = Array.from(files).some(f => f.type?.startsWith('image/'));
        if (!hasImage) return;
        ev.preventDefault();
        ev.stopPropagation();
        try {
          await insertImagesToQuill(which, files);
        } catch (e) {
          console.error('drop upload failed:', e);
          alert('画像の挿入に失敗しました。');
        }
      };

      const onPaste = async (ev: ClipboardEvent) => {
        const items = ev.clipboardData?.items || [];
        const imageItems = Array.from(items).filter(it => it.type?.startsWith('image/'));
        if (imageItems.length === 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        try {
          const files = imageItems.map(it => it.getAsFile()).filter(Boolean) as File[];
          await insertImagesToQuill(which, files);
        } catch (e) {
          console.error('paste upload failed:', e);
          alert('画像の貼り付けに失敗しました。');
        }
      };

      root.addEventListener('drop', onDrop);
      root.addEventListener('paste', onPaste);
      return () => {
        root.removeEventListener('drop', onDrop);
        root.removeEventListener('paste', onPaste);
      };
    };

    const cleanNew  = bindDnDAndPaste(quillRefNew, 'new');
    const cleanEdit = bindDnDAndPaste(quillRefEdit, 'edit');
    return () => { cleanNew?.(); cleanEdit?.(); };
  }, [insertImagesToQuill]);

  // ---------- Quill のモジュール/フォーマット ----------
  const quillModulesNew = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote', 'code-block', 'link', 'image'],
        ['clean'],
      ],
      handlers: {
        image: makeImageHandler('new'),
      },
    },
  }), [makeImageHandler]);

  const quillModulesEdit = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote', 'code-block', 'link', 'image'],
        ['clean'],
      ],
      handlers: {
        image: makeImageHandler('edit'),
      },
    },
  }), [makeImageHandler]);

  const quillFormats = useMemo(() => ([
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list',
    'blockquote', 'code-block', 'link',
    'image',
  ]), []);

  // ★Step13-A: 表示中（.prose 内）の画像に lazy/async を付与
  useEffect(() => {
    const imgs = document.querySelectorAll<HTMLImageElement>('.prose img');
    imgs.forEach((img) => {
      if (!img.getAttribute('loading'))  img.setAttribute('loading', 'lazy');
      if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
      if (!img.style.maxWidth) img.style.maxWidth = '100%';
      if (!img.style.height)   img.style.height   = 'auto';
    });
  }, [logs]);

  // ==========================
  // Step10: エクスポート／インポート
  // ==========================
  const handleExport = useCallback(() => {
    const data = logs.map(l => ({
      id: l.id,
      title: l.title,
      memo: l.memo,
      date: l.date,
      categories: normalizeCats(l.categories),
      sort_order: l.sort_order ?? 0,
    }));

    const json = JSON.stringify(
      { exported_at: new Date().toISOString(), count: data.length, items: data },
      null, 2
    );

    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const filename = `learning_logs_${yyyy}-${mm}-${dd}.json`;

    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }, [logs]);

  const handleImportFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmed = window.confirm('このファイルをインポートします。既存のログに上書きしてもよいですか？');
    if (!confirmed) {
      if (importInputRef.current) importInputRef.current.value = '';
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
      if (!Array.isArray(items)) throw new Error('Invalid JSON format');

      if (!isSignedIn) throw new Error('Not signed in');
      const token = await getSupabaseToken();
      if (!token) throw new Error('No Clerk token');
      const sb = makeAuthedClient(token);

      const maxOrder = logs.reduce((m, l) => Math.max(m, l.sort_order ?? 0), 0);

      const rows = items.map((it: any, idx: number) => {
        const safeCats = normalizeCats(Array.isArray(it?.categories) ? it.categories : ['未分類']);
        const safeDate = typeof it?.date === 'string' && it.date ? it.date : new Date().toISOString();
        const safeOrder = typeof it?.sort_order === 'number' ? it.sort_order : maxOrder + idx + 1;

        return {
          title: String(it?.title ?? '(no title)'),
          memo: String(it?.memo ?? ''),  // 本文内に<img>が入っていてもOK
          date: safeDate,
          user_id: user?.id ?? '',
          categories: safeCats,
          sort_order: safeOrder,
        };
      });

      if (rows.length === 0) return;

      const { error } = await sb.from('logs').insert(rows);
      if (error) throw error;

      await fetchLogs();
      if (importInputRef.current) importInputRef.current.value = '';
    } catch (err: any) {
      console.error('import error:', err?.message ?? err, err);
    }
  }, [isSignedIn, logs, user?.id, fetchLogs, getSupabaseToken]);

  // ==========================

  if (!isSignedIn) {
    return (
      <SignedOut>
        <main className="p-6"><p>ログインしてください。</p></main>
      </SignedOut>
    );
  }

  return (
    <SignedIn>
      <main className="p-6 space-y-10 max-w-3xl mx-auto">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">ダッシュボード</h1>

          {/* 右上：一覧リンク／エクスポート／インポート／ログアウト */}
          <div className="flex items-center gap-2">
            <Link href="/logs" className="px-3 py-2 text-sm border rounded hover:bg-gray-50">
              ログ一覧
            </Link>

            <button
              onClick={handleExport}
              className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
            >
              エクスポート
            </button>

            <input
              type="file"
              accept="application/json,.json"
              ref={importInputRef}
              onChange={handleImportFileChange}
              className="hidden"
            />
            <button
              onClick={() => importInputRef.current?.click()}
              className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
            >
              インポート
            </button>

            <SignOutButton>
              <button className="px-3 py-2 text-sm bg-gray-700 text-white rounded">
                ログアウト
              </button>
            </SignOutButton>
          </div>
        </header>

        <section>
          <p>ようこそ、{user?.fullName ?? 'ユーザー'} さん！</p>
          <p className="text-sm text-gray-500">
            メール: {user?.primaryEmailAddress?.emailAddress}
          </p>
        </section>

        {/* 追加フォーム */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">学習ログを追加</h2>

          {/* 既知カテゴリ（チェックで複数選択） */}
          <div className="flex flex-wrap gap-2">
            {categories.map(c => (
              <label key={`new-${c}`} className={`px-2 py-1 rounded border cursor-pointer ${selectedCats.includes(c) ? 'bg-gray-900 text-white' : 'bg-white'}`}>
                <input
                  type="checkbox"
                  className="mr-1"
                  checked={selectedCats.includes(c)}
                  onChange={() => {
                    if (selectedCats.includes(c)) setSelectedCats(selectedCats.filter(v => v !== c));
                    else setSelectedCats([...selectedCats, c]);
                  }}
                />
                {c}
              </label>
            ))}
          </div>

          {/* 新規カテゴリ追加フィールド */}
          <div className="flex gap-2">
            <input
              className="flex-1 border px-3 py-2 rounded"
              placeholder="新しいカテゴリーを追加（任意）"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              list="category-options"
            />
            <datalist id="category-options">
              {categories.map((c) => (<option key={c} value={c} />))}
            </datalist>
          </div>

          <input
            className="w-full border px-3 py-2 rounded"
            placeholder="タイトル"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* ReactQuill（本文中に画像を挿入可能） */}
          <div className="w-full">
            <ReactQuill
              ref={quillRefNew}
              className="quill-editor"
              value={memo}
              onChange={setMemo}
              modules={quillModulesNew}
              formats={quillFormats}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              追加
            </button>
            <button
              onClick={fetchLogs}
              className="px-4 py-2 border rounded"
            >
              再読込
            </button>
          </div>
        </section>

        {/* タブ（カテゴリー） */}
        <section className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('すべて')}
              className={`px-3 py-1 rounded border ${activeTab === 'すべて' ? 'bg-gray-900 text-white' : 'bg-white'}`}
            >
              すべて
            </button>
            {categories.map((c) => (
              <button
                key={`tab-${c}`}
                onClick={() => setActiveTab(c)}
                className={`px-3 py-1 rounded border ${activeTab === c ? 'bg-gray-900 text-white' : 'bg-white'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        {/* Step8: フィルタ（検索・日付） */}
        <section className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">キーワード検索</label>
              <input
                className="w-full border px-3 py-2 rounded"
                placeholder="タイトル・本文から検索"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">From</label>
              <input
                type="date"
                className="border px-3 py-2 rounded"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">To</label>
              <input
                type="date"
                className="border px-3 py-2 rounded"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchLogsFiltered}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                絞り込み
              </button>
              <button
                onClick={() => {
                  setSearchText('');
                  setFromDate('');
                  setToDate('');
                  fetchLogs();
                }}
                className="px-4 py-2 border rounded"
              >
                リセット
              </button>
            </div>
          </div>
        </section>

        {/* 一覧表示 */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">ログ一覧</h2>

          {visibleLogs.length === 0 && (
            <p className="text-gray-500">このタブにはログがありません。</p>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={visibleLogs.map(l => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {visibleLogs.map((log) => (
                <SortableItem key={log.id} id={log.id}>
                  <div className="border p-4 rounded shadow-sm space-y-2 bg-white dark:bg-gray-800">
                    <div className="flex flex-wrap gap-2">
                      {normalizeCats(log.categories).map((c, i) => (
                        <span
                          key={`${log.id}-${c}-${i}`}
                          className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-full border"
                        >
                          {c}
                        </span>
                      ))}
                    </div>

                    {editingId === log.id ? (
                      <>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {categories.map(c => (
                              <label key={`edit-${c}`} className={`px-2 py-1 rounded border cursor-pointer ${editSelectedCats.includes(c) ? 'bg-gray-900 text-white' : 'bg-white'}`}>
                                <input
                                  type="checkbox"
                                  className="mr-1"
                                  checked={editSelectedCats.includes(c)}
                                  onChange={() => {
                                    if (editSelectedCats.includes(c)) setEditSelectedCats(editSelectedCats.filter(v => v !== c));
                                    else setEditSelectedCats([...editSelectedCats, c]);
                                  }}
                                />
                                {c}
                              </label>
                            ))}
                          </div>

                          <input
                            className="w-full border px-2 py-1 rounded"
                            value={editNewCategory}
                            onChange={(e) => setEditNewCategory(e.target.value)}
                            placeholder="新しいカテゴリーを追加（任意）"
                            list="category-options"
                          />

                          <input
                            className="w-full border px-2 py-1 rounded"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder="タイトル"
                          />

                          {/* 編集用エディタ（画像ボタン付き） */}
                          <ReactQuill
                            ref={quillRefEdit}
                            className="quill-editor"
                            value={editMemo}
                            onChange={setEditMemo}
                            modules={quillModulesEdit}
                            formats={quillFormats}
                          />

                          <div className="flex gap-2">
                            <button
                              onClick={handleEditSave}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
                              aria-label="保存"
                            >
                              保存
                            </button>
                            <button
                              onClick={handleEditCancel}
                              className="px-3 py-1 bg-gray-400 hover:bg-gray-500 text-white rounded"
                              aria-label="キャンセル"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 className="font-bold">{log.title}</h3>

                        <div
                          className="
                            prose max-w-none
                            [&_ul]:list-disc [&_ul]:pl-5
                            [&_ol]:list-decimal [&_ol]:pl-5
                            [&_ol]:!list-inside [&_ul]:!list-inside
                            [&_h1]:text-3xl [&_h2]:text-2xl [&_h3]:text-xl
                            [&_blockquote]:border-l-4 [&_blockquote]:pl-4
                            [&_pre]:bg-gray-100 [&_pre]:p-3 [&_pre]:rounded
                            [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded
                            [&_a]:text-blue-600 [&_a]:underline hover:[&_a]:opacity-80
                            [&_img]:rounded [&_img]:my-2
                            [&_img]:max-w-full [&_img]:h-auto
                            dark:[&_pre]:bg-gray-800 dark:[&_code]:bg-gray-800
                          "
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(log.memo || '') }}
                        />

                        <p className="text-xs text-gray-500">
                          {format(new Date(log.date), 'yyyy-MM-dd HH:mm')}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditStart(log)}
                            className="px-3 py-1 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded"
                            aria-label="編集"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDelete(log.id)}
                            className="px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded"
                            aria-label="削除"
                          >
                            削除
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </SortableItem>
              ))}
            </SortableContext>
          </DndContext>
        </section>
      </main>
    </SignedIn>
  );
}
