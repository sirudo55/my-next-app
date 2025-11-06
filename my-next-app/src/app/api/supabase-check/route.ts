import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !anon) {
    return NextResponse.json({ ok: false, reason: "ENV_MISSING" }, { status: 500 });
  }

  const supabase = createClient(url, anon);

  // 実テーブル名に合わせて変更（例: "logs"）
  const { error, status } = await supabase
    .from("logs")
    .select("id", { head: true, count: "exact" });

  return NextResponse.json({
    ok: !error,
    status,
    error: error ? { message: error.message, details: (error as any).details } : null,
    project: url,
  });
}