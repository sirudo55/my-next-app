-- =====================================================
-- 学習ログアプリ Supabase セットアップSQL
-- Supabase Dashboard > SQL Editor で実行してください
-- =====================================================

-- 1. logs テーブル作成
CREATE TABLE IF NOT EXISTS public.logs (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT         NOT NULL DEFAULT '',
  memo        TEXT         NOT NULL DEFAULT '',
  date        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  user_id     TEXT         NOT NULL,
  categories  TEXT[]       NOT NULL DEFAULT '{"未分類"}',
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. インデックス（パフォーマンス改善）
CREATE INDEX IF NOT EXISTS logs_user_id_idx    ON public.logs (user_id);
CREATE INDEX IF NOT EXISTS logs_sort_order_idx ON public.logs (sort_order DESC);
CREATE INDEX IF NOT EXISTS logs_date_idx       ON public.logs (date DESC);

-- 3. RLS（Row Level Security）を有効化
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- 4. RLSポリシー設定（Clerk JWT連携用）
--    Clerk の JWT に含まれる sub クレームがユーザーIDとなるため
--    auth.jwt() ->> 'sub' でマッチさせます

-- 既存ポリシーを削除（再実行時の冪等性のため）
DROP POLICY IF EXISTS "Users can view own logs"   ON public.logs;
DROP POLICY IF EXISTS "Users can insert own logs" ON public.logs;
DROP POLICY IF EXISTS "Users can update own logs" ON public.logs;
DROP POLICY IF EXISTS "Users can delete own logs" ON public.logs;

CREATE POLICY "Users can view own logs"
  ON public.logs FOR SELECT
  USING (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own logs"
  ON public.logs FOR INSERT
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own logs"
  ON public.logs FOR UPDATE
  USING (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users can delete own logs"
  ON public.logs FOR DELETE
  USING (user_id = (auth.jwt() ->> 'sub'));

-- 5. reorder_logs RPC関数（ドラッグ&ドロップ並び替え用）
CREATE OR REPLACE FUNCTION public.reorder_logs(ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  i         INT;
  base_val  INT;
BEGIN
  base_val := array_length(ids, 1) * 1000;
  FOR i IN 1 .. array_length(ids, 1) LOOP
    UPDATE public.logs
    SET sort_order = base_val - (i - 1) * 1000
    WHERE id = ids[i]
      AND user_id = (auth.jwt() ->> 'sub');
  END LOOP;
END;
$$;

-- =====================================================
-- ここまでをSQL Editorで実行してください
-- =====================================================

-- 次のステップ（手動でUIから設定）:
-- ・Storage > New bucket で「learning-logs」バケットを作成（Public ON）
-- ・Authentication > JWT Settings でClerkのJWKS URLを設定
-- =====================================================
