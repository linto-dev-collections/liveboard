import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      <h1 className="font-bold text-4xl">404</h1>
      <p className="text-muted-foreground">お探しのページは存在しません。</p>
      <Link href="/" className="underline underline-offset-4 hover:opacity-80">
        ホームに戻る
      </Link>
    </div>
  );
}
