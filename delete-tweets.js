// ============================================================
// XStream — Use X as a stream, not an archive
// Deletes tweets, replies & retweets older than DAYS_OLD days
// ============================================================
(async () => {
  "use strict";

  // ── CONFIG ────────────────────────────────────────────────
  const DAYS_OLD = 30;                // delete posts older than this
  const DELAY_BETWEEN_DELETES = 1200; // ms between delete calls
  const DELAY_BETWEEN_PAGES   = 2000; // ms between pagination calls
  const MAX_ERRORS = 15;              // stop after this many consecutive errors

  // ── API CONSTANTS (from X.com frontend) ───────────────────
  const BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  const DELETE_QUERY_ID = "nxpZCY2K-I6QoFHAHeojFQ";
  const TWEETS_QUERY_ID = "9ESiiRo8Mhb_jqNIxduCgA";

  const FEATURES = {
    rweb_video_screen_enabled: false,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_profile_redirect_enabled: false,
    rweb_tipjar_consumption_enabled: false,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    premium_content_api_read_enabled: false,
    communities_web_enable_tweet_community_results_fetch: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    responsive_web_grok_analyze_button_fetch_trends_enabled: false,
    responsive_web_grok_analyze_post_followups_enabled: true,
    responsive_web_jetfuel_frame: true,
    responsive_web_grok_share_attachment_enabled: true,
    responsive_web_grok_annotations_enabled: true,
    articles_preview_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    content_disclosure_indicator_enabled: true,
    content_disclosure_ai_generated_indicator_enabled: true,
    responsive_web_grok_show_grok_translated_post: false,
    responsive_web_grok_analysis_button_from_backend: true,
    post_ctas_fetch_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_grok_image_annotation_enabled: true,
    responsive_web_grok_imagine_annotation_enabled: true,
    responsive_web_grok_community_note_auto_translation_is_enabled: false,
    responsive_web_enhance_cards_enabled: false,
  };

  // ── HELPERS ───────────────────────────────────────────────
  const getCsrf = () => document.cookie.match(/ct0=([^;]+)/)?.[1];
  const getUserId = () => document.cookie.match(/twid=u%3D(\d+)/)?.[1];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const csrf = getCsrf();
  const userId = getUserId();
  if (!csrf || !userId) {
    alert("❌ Could not read CSRF token or user ID from cookies.\nMake sure you are logged into x.com.");
    return;
  }

  const cutoffDate = new Date(Date.now() - DAYS_OLD * 86400000);

  const headers = () => ({
    authorization: `Bearer ${decodeURIComponent(BEARER)}`,
    "content-type": "application/json",
    "x-csrf-token": getCsrf(),
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
  });

  // ── MODAL UI ──────────────────────────────────────────────
  const modal = document.createElement("div");
  modal.id = "__dt_modal";
  modal.innerHTML = `
    <style>
      #__dt_modal {
        position: fixed; inset: 0; z-index: 999999;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,.65); backdrop-filter: blur(6px);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #__dt_box {
        background: #16181c; border-radius: 20px; padding: 32px 36px 28px;
        width: 420px; max-width: 92vw; color: #e7e9ea;
        box-shadow: 0 8px 40px rgba(0,0,0,.6);
      }
      #__dt_spinner_wrap { text-align: center; margin-bottom: 12px; }
      #__dt_spinner {
        width: 56px; height: 56px; border-radius: 50%;
        border: 4px solid #2f3336; border-top-color: #794bc4;
        animation: __dt_spin 1s linear infinite;
      }
      @keyframes __dt_spin { to { transform: rotate(360deg); } }
      #__dt_title {
        text-align: center; font-size: 18px; font-weight: 700;
        margin-bottom: 20px; color: #e7e9ea;
      }
      #__dt_section_label {
        font-size: 11px; font-weight: 600; letter-spacing: 1.5px;
        color: #71767b; margin-bottom: 8px; text-transform: uppercase;
      }
      #__dt_log {
        max-height: 160px; overflow-y: auto; margin-bottom: 20px;
        scrollbar-width: thin; scrollbar-color: #2f3336 transparent;
      }
      #__dt_log::-webkit-scrollbar { width: 4px; }
      #__dt_log::-webkit-scrollbar-thumb { background: #2f3336; border-radius: 4px; }
      .dt-entry {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 12px; margin-bottom: 4px;
        background: #1d1f23; border-radius: 10px; font-size: 13px;
      }
      .dt-badge {
        font-size: 10px; font-weight: 700; padding: 3px 8px;
        border-radius: 4px; letter-spacing: .5px; white-space: nowrap;
        flex-shrink: 0;
      }
      .dt-badge-tweet    { background: #1d3a5f; color: #4a9eed; }
      .dt-badge-reply    { background: #5c2a1e; color: #f4724a; }
      .dt-badge-retweet  { background: #1a4d2e; color: #5cb85c; }
      .dt-text {
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        color: #a0a4a8; flex: 1;
      }
      #__dt_counters {
        display: flex; gap: 10px; justify-content: center; margin-bottom: 18px;
      }
      .dt-counter {
        flex: 1; text-align: center; padding: 14px 8px;
        border-radius: 12px; background: #1d1f23;
      }
      .dt-counter-num { font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums; }
      .dt-counter-label {
        font-size: 10px; font-weight: 700; letter-spacing: 1.5px;
        margin-top: 2px; text-transform: uppercase;
      }
      .dt-c-read  .dt-counter-num { color: #e7e9ea; }
      .dt-c-read  .dt-counter-label { color: #71767b; }
      .dt-c-find  .dt-counter-num { color: #4a9eed; }
      .dt-c-find  .dt-counter-label { color: #4a9eed; }
      .dt-c-del   .dt-counter-num { color: #f4212e; }
      .dt-c-del   .dt-counter-label { color: #f4212e; }
      #__dt_stop {
        display: block; width: 100%; padding: 12px;
        border: 1px solid #2f3336; border-radius: 24px;
        background: transparent; color: #e7e9ea; font-size: 14px;
        font-weight: 700; cursor: pointer; transition: background .15s;
      }
      #__dt_stop:hover { background: #1d1f23; }
      #__dt_error {
        text-align: center; font-size: 12px; color: #f4212e;
        margin-bottom: 10px; min-height: 16px;
      }
    </style>
    <div id="__dt_box">
      <div id="__dt_spinner_wrap"><div id="__dt_spinner" style="display:inline-block"></div></div>
      <div id="__dt_title">XStream is running…</div>
      <div id="__dt_section_label">Recently Deleted</div>
      <div id="__dt_log"></div>
      <div id="__dt_counters">
        <div class="dt-counter dt-c-read">
          <div class="dt-counter-num" id="__dt_n_read">0</div>
          <div class="dt-counter-label">Read</div>
        </div>
        <div class="dt-counter dt-c-find">
          <div class="dt-counter-num" id="__dt_n_find">0</div>
          <div class="dt-counter-label">Find</div>
        </div>
        <div class="dt-counter dt-c-del">
          <div class="dt-counter-num" id="__dt_n_del">0</div>
          <div class="dt-counter-label">Delete</div>
        </div>
      </div>
      <div id="__dt_error"></div>
      <button id="__dt_stop">Stop</button>
    </div>
  `;
  document.body.appendChild(modal);

  const elRead  = document.getElementById("__dt_n_read");
  const elFind  = document.getElementById("__dt_n_find");
  const elDel   = document.getElementById("__dt_n_del");
  const elLog   = document.getElementById("__dt_log");
  const elTitle = document.getElementById("__dt_title");
  const elError = document.getElementById("__dt_error");
  const elStop  = document.getElementById("__dt_stop");

  let stopped = false;
  let nRead = 0, nFind = 0, nDel = 0;

  elStop.onclick = () => { stopped = true; };

  function updateUI() {
    elRead.textContent = nRead;
    elFind.textContent = nFind;
    elDel.textContent  = nDel;
  }

  function addLogEntry(type, text) {
    const badgeClass = type === "TWEET" ? "dt-badge-tweet"
                     : type === "REPLY" ? "dt-badge-reply"
                     : "dt-badge-retweet";
    const entry = document.createElement("div");
    entry.className = "dt-entry";
    entry.innerHTML = `<span class="dt-badge ${badgeClass}">${type}</span><span class="dt-text">${escHtml(text)}</span>`;
    elLog.prepend(entry);
    // keep max 50 entries
    while (elLog.children.length > 50) elLog.lastChild.remove();
  }

  function escHtml(s) {
    const d = document.createElement("span");
    d.textContent = s;
    return d.innerHTML;
  }

  // ── FETCH TWEETS ──────────────────────────────────────────
  async function fetchTweetsPage(cursor) {
    const variables = {
      userId,
      count: 20,
      includePromotedContent: true,
      withCommunity: true,
      withVoice: true,
      withQuickPromoteEligibilityTweetFields: true,
    };
    if (cursor) variables.cursor = cursor;

    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(FEATURES),
      fieldToggles: JSON.stringify({ withArticlePlainText: false }),
    });

    const resp = await fetch(
      `https://x.com/i/api/graphql/${TWEETS_QUERY_ID}/UserTweetsAndReplies?${params}`,
      { headers: headers(), credentials: "include" }
    );

    if (!resp.ok) throw new Error(`Fetch tweets failed: ${resp.status}`);
    return resp.json();
  }

  // ── DELETE TWEET ──────────────────────────────────────────
  async function deleteTweet(tweetId) {
    const resp = await fetch(
      `https://x.com/i/api/graphql/${DELETE_QUERY_ID}/DeleteTweet`,
      {
        method: "POST",
        headers: headers(),
        credentials: "include",
        body: JSON.stringify({
          variables: { tweet_id: tweetId, dark_request: false },
          queryId: DELETE_QUERY_ID,
        }),
      }
    );
    if (!resp.ok) throw new Error(`Delete ${tweetId} failed: ${resp.status}`);
    return resp.json();
  }

  // ── PARSE TWEETS FROM RESPONSE ────────────────────────────
  function parseTweets(data) {
    const instructions = data?.data?.user?.result?.timeline_v2?.timeline?.instructions || [];
    const tweets = [];
    let nextCursor = null;

    for (const inst of instructions) {
      const entries = inst.entries || inst.moduleItems || [];
      for (const entry of entries) {
        // cursor handling
        if (entry.entryId?.startsWith("cursor-bottom")) {
          nextCursor = entry.content?.value;
          continue;
        }

        const item = entry.content?.itemContent || entry.item?.itemContent;
        if (!item) continue;

        const result = item.tweet_results?.result;
        if (!result) continue;

        // handle tombstones / unavailable
        const tweet = result.__typename === "TweetWithVisibilityResults"
          ? result.tweet
          : result;
        if (!tweet?.legacy) continue;

        const legacy = tweet.legacy;
        const createdAt = new Date(legacy.created_at);
        const isRetweet = !!legacy.retweeted_status_result;
        const isReply = !!legacy.in_reply_to_status_id_str;
        const fullText = isRetweet
          ? ("RT: " + (legacy.retweeted_status_result?.result?.legacy?.full_text || ""))
          : (legacy.full_text || "");

        // only include tweets authored by the logged-in user
        if (tweet.core?.user_results?.result?.rest_id === userId || legacy.user_id_str === userId) {
          tweets.push({
            id: legacy.id_str || tweet.rest_id,
            text: fullText,
            date: createdAt,
            type: isRetweet ? "RETWEET" : isReply ? "REPLY" : "TWEET",
          });
        }
      }
    }

    return { tweets, nextCursor };
  }

  // ── MAIN LOOP ─────────────────────────────────────────────
  let cursor = null;
  let consecutiveErrors = 0;
  let reachedEnd = false;

  try {
    while (!stopped && !reachedEnd) {
      // Fetch a page of tweets
      let data;
      try {
        data = await fetchTweetsPage(cursor);
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors++;
        elError.textContent = `⚠ Fetch error: ${err.message} (${consecutiveErrors}/${MAX_ERRORS})`;
        if (consecutiveErrors >= MAX_ERRORS) { stopped = true; break; }
        await sleep(5000);
        continue;
      }

      const { tweets, nextCursor } = parseTweets(data);
      nRead += tweets.length;
      updateUI();

      if (!nextCursor || tweets.length === 0) {
        reachedEnd = true;
      }

      // Filter to old tweets
      const oldTweets = tweets.filter((t) => t.date < cutoffDate);
      nFind += oldTweets.length;
      updateUI();

      // If we got tweets but none are old enough, we still have newer tweets;
      // if ALL tweets on this page are newer than cutoff, keep paginating
      // (timeline is reverse-chronological so older tweets come later)

      // Delete each qualifying tweet
      for (const tw of oldTweets) {
        if (stopped) break;
        try {
          await deleteTweet(tw.id);
          nDel++;
          addLogEntry(tw.type, tw.text);
          updateUI();
          consecutiveErrors = 0;
        } catch (err) {
          consecutiveErrors++;
          elError.textContent = `⚠ Delete error: ${err.message} (${consecutiveErrors}/${MAX_ERRORS})`;
          if (consecutiveErrors >= MAX_ERRORS) { stopped = true; break; }
        }
        await sleep(DELAY_BETWEEN_DELETES);
      }

      cursor = nextCursor;
      if (!reachedEnd) await sleep(DELAY_BETWEEN_PAGES);
    }
  } catch (err) {
    elError.textContent = `❌ Fatal: ${err.message}`;
  }

  // ── DONE ──────────────────────────────────────────────────
  const spinner = document.getElementById("__dt_spinner");
  if (spinner) spinner.style.animation = "none";
  if (spinner) spinner.style.borderTopColor = stopped ? "#f4212e" : "#5cb85c";
  elTitle.textContent = stopped
    ? `XStream stopped — deleted ${nDel} posts`
    : `XStream done — deleted ${nDel} posts`;
  elStop.textContent = "Close";
  elStop.onclick = () => modal.remove();

  console.log(`✅ XStream finished. Read: ${nRead}, Found: ${nFind}, Deleted: ${nDel}`);
})();
