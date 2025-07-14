'use client';

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/nextjs';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center space-y-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold">
          学習ログアプリへようこそ！
        </h1>

        {/* ── 未ログイン案内 ─────────────────── */}
        <SignedOut>
          <p className="text-gray-700 dark:text-gray-300">
            ログインして学習記録を管理しましょう。
          </p>

          <div className="flex justify-center gap-4">
            <SignInButton mode="modal">
              <button className="px-5 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white transition">
                Sign in
              </button>
            </SignInButton>

            <SignUpButton mode="modal">
              <button className="px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white transition">
                Sign up
              </button>
            </SignUpButton>
          </div>
        </SignedOut>

        {/* ── ログイン済み案内 ───────────────── */}
        <SignedIn>
          <p className="text-gray-700 dark:text-gray-300">
            すでにログインしています。
          </p>

          <div className="flex items-center justify-center gap-4">
            <UserButton afterSignOutUrl="/" />
            <Link
              href="/dashboard"
              className="px-5 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white transition"
            >
              Dashboardへ
            </Link>
          </div>
        </SignedIn>
      </div>
    </main>
  );
}