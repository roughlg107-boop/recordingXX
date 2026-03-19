"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Mail } from "lucide-react";

import { useAuth } from "@/components/auth-provider";

export function LoginForm() {
  const router = useRouter();
  const { loading, signIn, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
      router.refresh();
    }
  }, [loading, router, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await signIn(email, password);
      router.replace("/");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "登入失敗。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel auth-panel">
      <div className="panel-content form-panel">
        <div className="eyebrow">登入</div>
        <h2 className="display-title">使用公司帳號登入</h2>
        <p className="lead compact-lead">啟用 email / password 後，所有頁面與 API 都需要先登入。</p>

        <form className="stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <div className="input-with-icon">
              <Mail size={16} />
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="password">密碼</label>
            <div className="input-with-icon">
              <LockKeyhole size={16} />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="輸入密碼"
                required
              />
            </div>
          </div>

          {errorMessage ? (
            <div className="notice" data-tone="danger">
              {errorMessage}
            </div>
          ) : (
            <div className="notice">登入成功後會直接回到首頁。</div>
          )}

          <button className="button wide-button" type="submit" disabled={isSubmitting || loading}>
            {isSubmitting || loading ? "登入中..." : "登入"}
          </button>
        </form>
      </div>
    </section>
  );
}
