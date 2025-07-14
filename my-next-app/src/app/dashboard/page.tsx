'use client';

import { useState, useEffect } from 'react';
import { useUser, SignOutButton } from '@clerk/nextjs';
import { format } from 'date-fns';

export default function Dashboard() {
  const { user } = useUser();


  /* ---------- ログ用 state ---------- */
  const [logs, setLogs] = useState<Log[]>([]);
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');


 // 編集対象のログID（nullなら編集中なし）
const [editingId, setEditingId] = useState<number | null>(null);
// 編集用のタイトル・メモ
const [editTitle, setEditTitle] = useState('');
const [editMemo, setEditMemo] = useState('');
type Log = {
  id: number;
  title: string;
  memo: string;
  date: Date;
};
// ログを編集モードに切り替える関数
const handleEditStart = (log: Log) => {
  setEditingId(log.id);
  setEditTitle(log.title);
  setEditMemo(log.memo);
};

//編集を保存する関数
const handleEditSave = () => {
  if (editingId === null) return;

  setLogs((prevLogs) =>
    prevLogs.map((log) =>
      log.id === editingId
        ? { ...log, title: editTitle, memo: editMemo }
        : log
    )
  );
  setEditingId(null);
  setEditTitle('');
  setEditMemo('');
};
//編集をキャンセルする関数
const handleEditCancel = () => {
  setEditingId(null);
  setEditTitle('');
  setEditMemo('');
}; 

// localStorageから復元するuseEffect（初回のみ）
useEffect(() => {
  const stored = localStorage.getItem('my-logs');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // 日付文字列を Date 型に変換
      const revived = parsed.map((log: any) => ({
        ...log,
        date: new Date(log.date),
      }));
      setLogs(revived);
    } catch (error) {
      console.error('ログの読み込みに失敗しました', error);
    }
  }
}, []);



// logs が変更されるたびに localStorage に保存する
useEffect(() => {
  const serialized = JSON.stringify(logs);
  localStorage.setItem('my-logs', serialized);
}, [logs]);

  
  /* ---------- 追加ボタン ---------- */
  const handleAdd = () => {
    if (!title.trim()) return;

    const newLog: Log = {
      id: Date.now(),          // 簡易 ID
      title,
      memo,
      date: new Date(),
    };
    setLogs([newLog, ...logs]); // 先頭に追加
    setTitle('');
    setMemo('');
  };
/* ---------- 削除ボタン ---------- */
const handleDelete = (id: number) => {
  setLogs(logs.filter((log) => log.id !== id));
};
  return (
    <main className="p-6 space-y-10 max-w-3xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <SignOutButton>
          <button className="px-4 py-2 bg-gray-700 text-white rounded">
            ログアウト
          </button>
        </SignOutButton>
      </header>

      <section>
        <p>ようこそ、{user?.fullName ?? 'ユーザー'} さん！</p>
        <p className="text-sm text-gray-500">
          メール: {user?.primaryEmailAddress?.emailAddress}
        </p>
      </section>

      {/* ---------- 追加フォーム ---------- */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">学習ログを追加</h2>

        <input
          className="w-full border px-3 py-2 rounded"
          placeholder="タイトル"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="w-full border px-3 py-2 rounded h-24"
          placeholder="メモ / 内容"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />

        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          追加
        </button>


      </section>

      {/* ---------- 一覧表示 ---------- */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">ログ一覧</h2>

        {logs.length === 0 && (
          <p className="text-gray-500">まだログがありません。</p>
        )}

        {logs.map((log) => (
  <div
    key={log.id}
    className="border p-4 rounded shadow-sm space-y-2 bg-white dark:bg-gray-800"
  >
    {editingId === log.id ? (
      <>
        <input
          className="w-full border px-2 py-1 rounded"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
        />
        <textarea
          className="w-full border px-2 py-1 rounded h-20"
          value={editMemo}
          onChange={(e) => setEditMemo(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            onClick={handleEditSave}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
          >
            保存
          </button>
          <button
            onClick={handleEditCancel}
            className="px-3 py-1 bg-gray-400 hover:bg-gray-500 text-white rounded"
          >
            キャンセル
          </button>
        </div>
      </>
    ) : (
      <>
        <h3 className="font-bold">{log.title}</h3>
        <p className="whitespace-pre-wrap">{log.memo}</p>
        <p className="text-xs text-gray-500">
          {format(log.date, 'yyyy-MM-dd HH:mm')}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => handleEditStart(log)}
            className="px-3 py-1 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded"
          >
            編集
          </button>
          <button
            onClick={() => handleDelete(log.id)}
            className="px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded"
          >
            削除
          </button>
        </div>
      </>
    )}
  </div>
))}
      </section>
    </main>
  );
}