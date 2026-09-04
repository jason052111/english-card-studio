"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  isSupabaseConfigured,
  supabase,
  type GroupRecord,
  type WordRecord,
} from "@/lib/supabase";

type AuthMode = "login" | "register";
type Screen = "groups" | "cards";
type ListType = "group" | "favorites";
type ReviewStrategy = "least-seen" | "oldest-seen";

type WordDraft = {
  word: string;
  prompt: string;
  pronunciation: string;
  meaning: string;
  explanation: string;
  example_sentence: string;
  note: string;
};

const RECENT_LIMIT = 20;

const emptyDraft: WordDraft = {
  word: "",
  prompt: "",
  pronunciation: "",
  meaning: "",
  explanation: "",
  example_sentence: "",
  note: "",
};

export default function Home() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [words, setWords] = useState<WordRecord[]>([]);
  const [screen, setScreen] = useState<Screen>("groups");
  const [listType, setListType] = useState<ListType>("group");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [recentWordIds, setRecentWordIds] = useState<string[]>(() => getStoredRecentIds());
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showWordModal, setShowWordModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [wordDraft, setWordDraft] = useState<WordDraft>(emptyDraft);

  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) ?? null,
    [activeGroupId, groups],
  );

  const activeWords = useMemo(() => {
    if (listType === "favorites") {
      return words.filter((word) => word.favorite);
    }

    return words.filter((word) => word.group_id === activeGroupId);
  }, [activeGroupId, listType, words]);

  const activeCard = activeWords[activeWordIndex] ?? null;

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function boot() {
      const { data } = await supabase!.auth.getSession();
      if (!mounted) return;

      setSession(data.session);
      setLoading(false);

      if (data.session) {
        await loadRecords();
      }
    }

    void boot();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (nextSession) {
        void loadRecords();
      } else {
        resetLocalStudyState();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (activeWordIndex >= activeWords.length) {
      setActiveWordIndex(0);
    }
  }, [activeWordIndex, activeWords.length]);

  async function loadRecords() {
    if (!supabase) return;

    setBusy(true);
    setMessage("");

    const [groupResult, wordResult] = await Promise.all([
      supabase.from("groups").select("*").order("created_at", { ascending: true }),
      supabase.from("words").select("*").order("created_at", { ascending: false }),
    ]);

    if (groupResult.error || wordResult.error) {
      setMessage("讀取資料失敗，請確認 Supabase 資料表和權限 SQL 已經建立。");
      setGroups([]);
      setWords([]);
    } else {
      setGroups(groupResult.data ?? []);
      setWords(wordResult.data ?? []);
    }

    setBusy(false);
  }

  function resetLocalStudyState() {
    setGroups([]);
    setWords([]);
    setScreen("groups");
    setListType("group");
    setActiveGroupId(null);
    setActiveWordIndex(0);
    setRecentWordIds([]);
    storeRecentIds([]);
  }

  function userName() {
    return (
      session?.user.user_metadata?.name ||
      session?.user.email ||
      "已登入"
    );
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) return;

    const email = authEmail.trim().toLowerCase();
    const password = authPassword;
    const name = authName.trim() || email.split("@")[0];

    if (!email || !password) {
      setMessage("請輸入 Email 和密碼。");
      return;
    }

    setBusy(true);
    setMessage("");

    if (authMode === "register") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });

      setBusy(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      if (!data.session) {
        setAuthMode("login");
        setMessage("註冊完成，請先到信箱確認後再登入。");
        return;
      }

      setSession(data.session);
      clearAuthForm();
      await loadRecords();
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSession(data.session);
    clearAuthForm();
    await loadRecords();
  }

  function clearAuthForm() {
    setAuthName("");
    setAuthEmail("");
    setAuthPassword("");
  }

  async function logout() {
    if (!supabase) return;

    await supabase.auth.signOut();
    setSession(null);
    resetLocalStudyState();
  }

  async function addGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session) return;

    const name = newGroupName.trim();
    if (!name) return;

    if (groups.some((group) => normalizeName(group.name) === normalizeName(name))) {
      setMessage("這個組別已經存在了。");
      return;
    }

    setBusy(true);
    setMessage("");

    const { data, error } = await supabase
      .from("groups")
      .insert({
        user_id: session.user.id,
        name,
      })
      .select("*")
      .single();

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setGroups((current) => [...current, data]);
    setNewGroupName("");
    setShowGroupModal(false);
    openGroup(data.id, [...groups, data]);
  }

  async function deleteGroup(group: GroupRecord) {
    if (!supabase) return;

    const wordCount = words.filter((word) => word.group_id === group.id).length;
    const confirmText =
      wordCount > 0
        ? `確定要刪除「${group.name}」嗎？這會一起刪除 ${wordCount} 張單字卡。`
        : `確定要刪除「${group.name}」嗎？`;

    if (!window.confirm(confirmText)) return;

    setBusy(true);
    setMessage("");

    const { error } = await supabase.from("groups").delete().eq("id", group.id);

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setGroups((current) => current.filter((item) => item.id !== group.id));
    setWords((current) => current.filter((word) => word.group_id !== group.id));

    if (activeGroupId === group.id) {
      setScreen("groups");
      setActiveGroupId(null);
      setActiveWordIndex(0);
    }
  }

  async function addWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session || !activeGroup) return;

    const wordText = wordDraft.word.trim();
    if (!wordText) return;

    const duplicate = words.find(
      (word) =>
        word.group_id === activeGroup.id &&
        normalizeName(word.word) === normalizeName(wordText),
    );

    if (duplicate) {
      setMessage("這個單字已經在這個組別裡了。");
      const groupWords = words.filter((word) => word.group_id === activeGroup.id);
      const duplicateIndex = groupWords.findIndex((word) => word.id === duplicate.id);
      setActiveWordIndex(Math.max(duplicateIndex, 0));
      setShowWordModal(false);
      void recordWordView(duplicate);
      return;
    }

    setBusy(true);
    setMessage("");

    const payload = {
      user_id: session.user.id,
      group_id: activeGroup.id,
      word: wordText,
      pronunciation: wordDraft.pronunciation.trim() || wordText,
      meaning: wordDraft.meaning.trim() || "尚未填寫中文意思",
      explanation: wordDraft.explanation.trim() || "尚未填寫解釋。",
      example_sentence:
        wordDraft.example_sentence.trim() ||
        `I want to practice the word "${wordText}" today.`,
      note: wordDraft.note.trim(),
      favorite: false,
      seen_count: 0,
      first_seen_at: null,
      last_seen_at: null,
    };

    const { data, error } = await supabase
      .from("words")
      .insert(payload)
      .select("*")
      .single();

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setWords((current) => [data, ...current]);
    setWordDraft(emptyDraft);
    setShowWordModal(false);
    setActiveWordIndex(0);
    void recordWordView(data);
  }

  async function deleteActiveWord() {
    if (!supabase || !activeCard) return;

    if (!window.confirm(`確定要刪除「${activeCard.word}」這張單字卡嗎？`)) {
      return;
    }

    setBusy(true);
    setMessage("");

    const { error } = await supabase.from("words").delete().eq("id", activeCard.id);

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setWords((current) => current.filter((word) => word.id !== activeCard.id));
    setRecentWordIds((current) => current.filter((id) => id !== activeCard.id));
    setActiveWordIndex((current) => Math.max(current - 1, 0));
  }

  async function toggleFavorite() {
    if (!supabase || !activeCard) return;

    const nextFavorite = !activeCard.favorite;

    setWords((current) =>
      current.map((word) =>
        word.id === activeCard.id ? { ...word, favorite: nextFavorite } : word,
      ),
    );

    const { error } = await supabase
      .from("words")
      .update({ favorite: nextFavorite })
      .eq("id", activeCard.id);

    if (error) {
      setMessage(error.message);
      setWords((current) =>
        current.map((word) =>
          word.id === activeCard.id ? { ...word, favorite: !nextFavorite } : word,
        ),
      );
      return;
    }

    if (listType === "favorites" && !nextFavorite) {
      setActiveWordIndex((current) => Math.max(current - 1, 0));
    }
  }

  async function recordWordView(card: WordRecord) {
    if (!supabase) return;

    const now = new Date().toISOString();
    const nextCard = {
      ...card,
      seen_count: Math.max(0, Number(card.seen_count) || 0) + 1,
      first_seen_at: card.first_seen_at ?? now,
      last_seen_at: now,
    };

    setWords((current) =>
      current.map((word) => (word.id === card.id ? nextCard : word)),
    );
    setRecentWordIds((current) => {
      const nextRecentIds = [...current, card.id].slice(-RECENT_LIMIT);
      storeRecentIds(nextRecentIds);
      return nextRecentIds;
    });

    const { error } = await supabase
      .from("words")
      .update({
        seen_count: nextCard.seen_count,
        first_seen_at: nextCard.first_seen_at,
        last_seen_at: nextCard.last_seen_at,
      })
      .eq("id", card.id);

    if (error) {
      setMessage("看過次數同步失敗，重新整理後會以資料庫為準。");
    }
  }

  function openGroup(groupId: string, sourceGroups = groups) {
    const groupWords = words.filter((word) => word.group_id === groupId);
    const index = pickCardIndex(groupWords, "least-seen", null, recentWordIds);

    setListType("group");
    setActiveGroupId(groupId);
    setActiveWordIndex(index);
    setScreen("cards");

    const groupExists = sourceGroups.some((group) => group.id === groupId);
    if (groupExists && groupWords[index]) {
      void recordWordView(groupWords[index]);
    }
  }

  function openFavorites() {
    const favoriteWords = words.filter((word) => word.favorite);
    const index = pickCardIndex(favoriteWords, "least-seen", null, recentWordIds);

    setListType("favorites");
    setActiveGroupId(null);
    setActiveWordIndex(index);
    setScreen("cards");

    if (favoriteWords[index]) {
      void recordWordView(favoriteWords[index]);
    }
  }

  function showNextCard(strategy: ReviewStrategy) {
    if (activeWords.length === 0) return;

    const index = pickCardIndex(activeWords, strategy, activeCard?.id ?? null, recentWordIds);
    const nextCard = activeWords[index];

    setActiveWordIndex(index);

    if (nextCard) {
      void recordWordView(nextCard);
    }
  }

  function moveCard(direction: number) {
    if (activeWords.length === 0) return;

    const index = (activeWordIndex + direction + activeWords.length) % activeWords.length;
    const nextCard = activeWords[index];

    setActiveWordIndex(index);

    if (nextCard) {
      void recordWordView(nextCard);
    }
  }

  function fillMockAiContent() {
    const wordText = wordDraft.word.trim() || "example";
    const prompt = wordDraft.prompt.trim();

    setWordDraft((current) => ({
      ...current,
      pronunciation: current.pronunciation || wordText,
      meaning: current.meaning || "請填入 AI 回傳的中文意思",
      explanation:
        current.explanation ||
        `這裡未來會接 GPT，根據「${wordText}」和你的 prompt 產生清楚的繁體中文解釋。`,
      example_sentence:
        current.example_sentence || `I will use "${wordText}" in a natural sentence.`,
      note:
        current.note ||
        (prompt ? `Prompt：${prompt}` : "這裡可以放常見搭配、易混淆用法或口說提醒。"),
    }));
  }

  function speakActiveWord() {
    if (!activeCard || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(activeCard.word);
    utterance.lang = "en-US";
    utterance.rate = 0.86;
    window.speechSynthesis.speak(utterance);
  }

  function updateDraft<K extends keyof WordDraft>(key: K, value: WordDraft[K]) {
    setWordDraft((current) => ({ ...current, [key]: value }));
  }

  function activeTitle() {
    if (listType === "favorites") return "最愛單字";
    return activeGroup?.name ?? "未選擇組別";
  }

  function cardGroupName(card: WordRecord) {
    if (listType === "favorites") {
      return groups.find((group) => group.id === card.group_id)?.name ?? "未分類";
    }

    return activeTitle();
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Setup</p>
          <h1>需要設定 Supabase</h1>
          <p className="setup-text">
            請先建立 `.env.local`，填入 `NEXT_PUBLIC_SUPABASE_URL` 和
            `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。
          </p>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Loading</p>
          <h1>正在載入</h1>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Account</p>
          <h1>{authMode === "register" ? "建立帳號" : "登入單字卡"}</h1>
          <form className="stack-form" onSubmit={handleAuth}>
            {authMode === "register" && (
              <label>
                暱稱
                <input
                  autoComplete="name"
                  onChange={(event) => setAuthName(event.target.value)}
                  placeholder="你的名字"
                  value={authName}
                />
              </label>
            )}
            <label>
              Email
              <input
                autoComplete="email"
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={authEmail}
              />
            </label>
            <label>
              密碼
              <input
                autoComplete={authMode === "register" ? "new-password" : "current-password"}
                minLength={6}
                onChange={(event) => setAuthPassword(event.target.value)}
                required
                type="password"
                value={authPassword}
              />
            </label>
            <p className="form-message" aria-live="polite">
              {message}
            </p>
            <div className="form-actions">
              <button className="primary-button" disabled={busy} type="submit">
                {authMode === "register" ? "註冊" : "登入"}
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setAuthMode(authMode === "login" ? "register" : "login");
                  setMessage("");
                }}
                type="button"
              >
                {authMode === "register" ? "已有帳號" : "建立帳號"}
              </button>
            </div>
          </form>
        </section>
      </main>
    );
  }

  return (
    <>
      <div className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">English Card Studio</p>
            <h1>我的英文單字卡</h1>
          </div>
          <div className="user-bar">
            <span>{userName()}</span>
            <button className="ghost-button compact" disabled={busy} onClick={logout} type="button">
              登出
            </button>
          </div>
        </header>

        {message && (
          <p className="status-message" aria-live="polite">
            {message}
          </p>
        )}

        <main>
          {screen === "groups" && (
            <section aria-labelledby="groups-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Groups</p>
                  <h2 id="groups-title">選擇組別</h2>
                </div>
                <button
                  aria-label="新增組別"
                  className="round-button"
                  onClick={() => setShowGroupModal(true)}
                  title="新增組別"
                  type="button"
                >
                  +
                </button>
              </div>

              <div className="group-grid">
                <article className="group-card favorite-list">
                  <button className="group-open-button" onClick={openFavorites} type="button">
                    <strong>最愛單字</strong>
                    <span>{words.filter((word) => word.favorite).length} 已加入最愛</span>
                  </button>
                </article>

                {groups.map((group) => {
                  const wordCount = words.filter((word) => word.group_id === group.id).length;

                  return (
                    <article className="group-card" key={group.id}>
                      <button
                        className="group-open-button"
                        onClick={() => openGroup(group.id)}
                        type="button"
                      >
                        <strong>{group.name}</strong>
                        <span>{wordCount} 張單字卡</span>
                      </button>
                      <button
                        aria-label={`刪除 ${group.name}`}
                        className="delete-icon-button"
                        onClick={() => deleteGroup(group)}
                        title="刪除組別"
                        type="button"
                      >
                        ×
                      </button>
                    </article>
                  );
                })}

                {groups.length === 0 && (
                  <p className="empty-state">目前還沒有組別，按右上角的 + 開始新增。</p>
                )}
              </div>
            </section>
          )}

          {screen === "cards" && (
            <section aria-labelledby="cards-title">
              <div className="card-header">
                <button
                  className="ghost-button compact"
                  onClick={() => setScreen("groups")}
                  type="button"
                >
                  ← 組別
                </button>
                <div>
                  <p className="eyebrow">Study</p>
                  <h2 id="cards-title">{activeTitle()}</h2>
                </div>
                {listType === "group" && (
                  <button
                    aria-label="新增單字卡"
                    className="round-button"
                    onClick={() => setShowWordModal(true)}
                    title="新增單字卡"
                    type="button"
                  >
                    +
                  </button>
                )}
              </div>

              <article className="word-card">
                <div className="card-meta">
                  <span>{activeCard ? cardGroupName(activeCard) : activeTitle()}</span>
                  <span className="meta-right">
                    <span>看過 {activeCard?.seen_count ?? 0} 次</span>
                    <span>
                      {activeWords.length > 0 ? activeWordIndex + 1 : 0} / {activeWords.length}
                    </span>
                  </span>
                </div>
                {activeCard ? (
                  <>
                    <div className="word-main">
                      <p className="word">{activeCard.word}</p>
                      <div className="card-tools">
                        <button
                          className={`favorite-button ${activeCard.favorite ? "active" : ""}`}
                          onClick={toggleFavorite}
                          type="button"
                        >
                          {activeCard.favorite ? "★ 已最愛" : "☆ 加入最愛"}
                        </button>
                        <button
                          aria-label="播放發音"
                          className="sound-button"
                          onClick={speakActiveWord}
                          title="播放發音"
                          type="button"
                        >
                          ▶
                        </button>
                      </div>
                    </div>
                    <p className="phonetic">{activeCard.pronunciation}</p>
                    <p className="meaning">{activeCard.meaning}</p>
                    <div className="divider" />
                    <p className="explanation">{activeCard.explanation}</p>
                    <blockquote>{activeCard.example_sentence}</blockquote>
                    <p className="note">{activeCard.note}</p>
                  </>
                ) : (
                  <>
                    <div className="word-main">
                      <p className="word">No cards</p>
                    </div>
                    <p className="meaning">
                      {listType === "favorites"
                        ? "目前還沒有最愛單字，練習時按「加入最愛」就會出現在這裡。"
                        : "這個組別還沒有單字卡，按右上角的 + 新增第一張。"}
                    </p>
                    <div className="divider" />
                    <p className="explanation">新增或加入最愛後，單字卡會直接出現在這裡。</p>
                    <blockquote>Add a word card to start studying.</blockquote>
                  </>
                )}
              </article>

              <div className="card-actions" aria-label="卡片控制">
                <button
                  className="secondary-button"
                  disabled={!activeCard}
                  onClick={() => moveCard(-1)}
                  type="button"
                >
                  ← 上一張
                </button>
                <button
                  className="primary-button"
                  disabled={!activeCard}
                  onClick={() => showNextCard("least-seen")}
                  type="button"
                >
                  下一張 →
                </button>
                <button
                  className="secondary-button"
                  disabled={!activeCard}
                  onClick={() => showNextCard("oldest-seen")}
                  type="button"
                >
                  最早看過
                </button>
                <button
                  className="danger-button"
                  disabled={!activeCard}
                  onClick={deleteActiveWord}
                  type="button"
                >
                  刪除卡片
                </button>
              </div>
            </section>
          )}
        </main>
      </div>

      {showGroupModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="group-modal-title">
          <section className="modal-panel">
            <div className="modal-header">
              <h3 id="group-modal-title">新增組別</h3>
              <button
                aria-label="關閉"
                className="ghost-button icon-only"
                onClick={() => setShowGroupModal(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <form className="stack-form" onSubmit={addGroup}>
              <label>
                組別名稱
                <input
                  autoFocus
                  onChange={(event) => setNewGroupName(event.target.value)}
                  placeholder="例如：多益、口說、日常"
                  required
                  value={newGroupName}
                />
              </label>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  onClick={() => setShowGroupModal(false)}
                  type="button"
                >
                  取消
                </button>
                <button className="primary-button" disabled={busy} type="submit">
                  新增
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showWordModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="word-modal-title">
          <section className="modal-panel wide">
            <div className="modal-header">
              <h3 id="word-modal-title">新增單字卡</h3>
              <button
                aria-label="關閉"
                className="ghost-button icon-only"
                onClick={() => setShowWordModal(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <form className="stack-form" onSubmit={addWord}>
              <label>
                單字
                <input
                  autoFocus
                  onChange={(event) => updateDraft("word", event.target.value)}
                  placeholder="momentum"
                  required
                  value={wordDraft.word}
                />
              </label>

              <label>
                給 AI 的 prompt
                <textarea
                  onChange={(event) => updateDraft("prompt", event.target.value)}
                  placeholder="請用繁體中文解釋這個單字，給我自然例句和常見使用情境。"
                  rows={4}
                  value={wordDraft.prompt}
                />
              </label>

              <div className="form-row">
                <label>
                  中文意思
                  <input
                    onChange={(event) => updateDraft("meaning", event.target.value)}
                    placeholder="動力；推進力"
                    value={wordDraft.meaning}
                  />
                </label>
                <label>
                  發音提示
                  <input
                    onChange={(event) => updateDraft("pronunciation", event.target.value)}
                    placeholder="mo-men-tum"
                    value={wordDraft.pronunciation}
                  />
                </label>
              </div>

              <label>
                解釋
                <textarea
                  onChange={(event) => updateDraft("explanation", event.target.value)}
                  placeholder="這個單字可以怎麼用？"
                  rows={3}
                  value={wordDraft.explanation}
                />
              </label>

              <label>
                例句
                <textarea
                  onChange={(event) => updateDraft("example_sentence", event.target.value)}
                  placeholder="I am building momentum..."
                  rows={2}
                  value={wordDraft.example_sentence}
                />
              </label>

              <label>
                補充筆記
                <textarea
                  onChange={(event) => updateDraft("note", event.target.value)}
                  placeholder="容易搞混、常見搭配、口說用法..."
                  rows={2}
                  value={wordDraft.note}
                />
              </label>

              <div className="form-actions">
                <button className="secondary-button" onClick={fillMockAiContent} type="button">
                  AI 生成
                </button>
                <button className="primary-button" disabled={busy} type="submit">
                  儲存
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function pickCardIndex(
  cards: WordRecord[],
  strategy: ReviewStrategy,
  currentCardId: string | null,
  recentWordIds: string[],
) {
  if (cards.length === 0) return 0;

  const recentIds = new Set(recentWordIds.slice(-RECENT_LIMIT));
  let candidates = cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => !recentIds.has(card.id));

  if (candidates.length === 0 && cards.length > 1) {
    candidates = cards
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => card.id !== currentCardId);
  }

  if (candidates.length === 0) {
    candidates = cards.map((card, index) => ({ card, index }));
  }

  if (strategy === "oldest-seen") {
    const seenCandidates = candidates.filter(({ card }) => card.last_seen_at);
    const pool = seenCandidates.length > 0 ? seenCandidates : candidates;

    pool.sort((a, b) => {
      const lastDiff = timestamp(a.card.last_seen_at, Number.MAX_SAFE_INTEGER) -
        timestamp(b.card.last_seen_at, Number.MAX_SAFE_INTEGER);
      if (lastDiff !== 0) return lastDiff;

      const countDiff = a.card.seen_count - b.card.seen_count;
      if (countDiff !== 0) return countDiff;

      return a.index - b.index;
    });

    return pool[0].index;
  }

  candidates.sort((a, b) => {
    const countDiff = a.card.seen_count - b.card.seen_count;
    if (countDiff !== 0) return countDiff;

    const lastDiff = timestamp(a.card.last_seen_at, 0) - timestamp(b.card.last_seen_at, 0);
    if (lastDiff !== 0) return lastDiff;

    return a.index - b.index;
  });

  return candidates[0].index;
}

function getStoredRecentIds() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.sessionStorage.getItem("english-card-recent-ids");
    return raw ? (JSON.parse(raw) as string[]).slice(-RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

function storeRecentIds(ids: string[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem("english-card-recent-ids", JSON.stringify(ids.slice(-RECENT_LIMIT)));
}

function timestamp(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}
